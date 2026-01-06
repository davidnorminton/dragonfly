import { useEffect, useRef, useState, useMemo } from 'react';
import { musicAPI } from '../services/api';

export function MusicPage() {
  const [library, setLibrary] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [selectedArtist, setSelectedArtist] = useState(null);
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [viewMode, setViewMode] = useState('artists'); // artists | albums
  const [lengths, setLengths] = useState({});
  const [playlists, setPlaylists] = useState([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState(null);
  const [popularMap, setPopularMap] = useState({});
  const [popularLoading, setPopularLoading] = useState(false);
  const [popularError, setPopularError] = useState('');
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [playlistModalName, setPlaylistModalName] = useState('');
  const [playlistModalExisting, setPlaylistModalExisting] = useState('');
  const [pendingSong, setPendingSong] = useState(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistModalError, setPlaylistModalError] = useState('');
  const [volume, setVolume] = useState(1.0); // 0.0 to 1.0
  const audioRef = useRef(null);
  const heroImgRef = useRef(null);
  const handleNextRef = useRef(null);
  const playIndexRef = useRef(null);
  const playlistRef = useRef([]);
  const lengthsRef = useRef({});
  const sortedAlbumsRef = useRef([]);

  // Define these early so they're available for useCallback dependencies
  const currentArtist = useMemo(() => {
    if (!selectedArtist) return null;
    return library.find((a) => a.name === selectedArtist) || null;
  }, [selectedArtist, library]);

  const sortedAlbums = useMemo(() => {
    if (!currentArtist?.albums) return [];
    return [...currentArtist.albums].sort((a, b) => {
      const ya = a.year || (a.date ? parseInt(String(a.date).split('-')[0]) : 0);
      const yb = b.year || (b.date ? parseInt(String(b.date).split('-')[0]) : 0);
      if (yb !== ya) return (yb || 0) - (ya || 0); // newest first
      return a.name.localeCompare(b.name);
    });
  }, [currentArtist]);

  // keep sorted albums in a ref for functions that avoid hook deps
  useEffect(() => {
    sortedAlbumsRef.current = sortedAlbums;
  }, [sortedAlbums]);

  const toggleArtist = (artist) => {
    setSelectedArtist(artist);
    setSelectedAlbum(null);
    setViewMode('artists');
  };

  const scanLibrary = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await musicAPI.scanMusic();
      if (res.success) {
        setLibrary(res.artists || []);
        const firstArtist = res.artists?.[0];
        if (firstArtist) {
          setSelectedArtist(firstArtist.name);
          // album selection will auto-set to top sorted album later
        }
      } else {
        setError(res.error || 'Scan failed');
      }
    } catch (err) {
      setError(err?.message || 'Scan failed');
    } finally {
      setLoading(false);
    }
  };

  const loadPlaylists = async () => {
    setPlaylistLoading(true);
    try {
      const res = await musicAPI.getPlaylists();
      if (res?.success) {
        setPlaylists(res.playlists || []);
      }
    } catch (e) {
      console.error('Failed to load playlists', e);
    } finally {
      setPlaylistLoading(false);
    }
  };

  useEffect(() => {
    scanLibrary();
    loadPlaylists();
  }, []);

  useEffect(() => {
    // Auto-select a playlist when switching to playlists view or when playlists load
    if (viewMode === 'playlists' && playlists.length > 0 && !selectedPlaylist) {
      setSelectedPlaylist(playlists[0].name);
    }
    // If the selected playlist was removed, pick the first available
    if (selectedPlaylist && !playlists.some((p) => p.name === selectedPlaylist) && playlists.length > 0) {
      setSelectedPlaylist(playlists[0].name);
    }
  }, [viewMode, playlists, selectedPlaylist]);

  // Keep refs in sync with latest state
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    lengthsRef.current = lengths;
  }, [lengths]);

  useEffect(() => {
    audioRef.current = new Audio();
    const onTime = () => {
      if (!audioRef.current) return;
      setProgress(audioRef.current.currentTime || 0);
    };
    const onLoaded = () => {
      if (!audioRef.current) return;
      setDuration(audioRef.current.duration || 0);
    };
    audioRef.current.addEventListener('timeupdate', onTime);
    audioRef.current.addEventListener('loadedmetadata', onLoaded);
    audioRef.current.addEventListener('loadeddata', onLoaded);
    audioRef.current.addEventListener('durationchange', onLoaded);
    return () => {
      if (!audioRef.current) return;
      audioRef.current.removeEventListener('timeupdate', onTime);
      audioRef.current.removeEventListener('loadedmetadata', onLoaded);
      audioRef.current.removeEventListener('loadeddata', onLoaded);
      audioRef.current.removeEventListener('durationchange', onLoaded);
      audioRef.current.pause();
    };
  }, []);

  // Update refs every render so callbacks always point to latest implementations/state
  useEffect(() => {
    handleNextRef.current = handleNext;
    playIndexRef.current = playIndex;
  });

  // Set up ended event handler separately - uses ref to avoid dependency issues
  useEffect(() => {
    if (!audioRef.current) return;
    const onEnded = () => {
      console.log('Song ended, playing next...');
      if (handleNextRef.current) {
        handleNextRef.current();
      }
    };
    audioRef.current.addEventListener('ended', onEnded);
    return () => {
      if (audioRef.current) {
        audioRef.current.removeEventListener('ended', onEnded);
      }
    };
  }, []); // Empty deps - ref is updated separately

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const playIndex = async (idx, list) => {
    const songList = list || playlistRef.current;
    if (!songList || idx < 0 || idx >= songList.length) return;
    playlistRef.current = songList;
    setPlaylist(songList);
    setCurrentIndex(idx);
    const track = songList[idx];
    const src = `/api/music/stream?path=${encodeURIComponent(track.path)}`;
    const fallbackDuration = track.duration ?? lengthsRef.current[track.path] ?? 0;
    setProgress(0);
    setDuration(fallbackDuration);
    if (audioRef.current) {
      audioRef.current.src = src;
      audioRef.current.currentTime = 0;
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (e) {
        console.error('Play error', e);
        setIsPlaying(false);
      }
    }
  };

  const handlePlayPause = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((e) => console.error('Play error', e));
      setIsPlaying(true);
    }
  };

  const handlePrev = () => {
    const list = playlistRef.current || playlist;
    if (!list.length) return;
    const nextIdx = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    if (playIndexRef.current) playIndexRef.current(nextIdx, list);
  };

  const sortSongs = (songs = []) =>
    songs.slice().sort((a, b) => {
      const ta = a.track_number ?? 9999;
      const tb = b.track_number ?? 9999;
      return ta - tb;
    });

  const getNextAlbumSong = (currentPath) => {
    const albumsList = sortedAlbumsRef.current || [];
    if (!albumsList.length) return null;
    const albumsSeq = albumsList
      .map((album) => ({
        album,
        songs: sortSongs(album.songs || []),
      }))
      .filter((a) => a.songs.length);
    if (!albumsSeq.length) return null;

    let foundAlbumIdx = -1;
    let foundSongIdx = -1;
    albumsSeq.forEach((al, ai) => {
      const si = al.songs.findIndex((s) => s.path === currentPath);
      if (si !== -1) {
        foundAlbumIdx = ai;
        foundSongIdx = si;
      }
    });

    // If not found, start from the first album/song
    if (foundAlbumIdx === -1) {
      return { songs: albumsSeq[0].songs, idx: 0 };
    }

    // Next song in same album
    if (foundSongIdx + 1 < albumsSeq[foundAlbumIdx].songs.length) {
      return { songs: albumsSeq[foundAlbumIdx].songs, idx: foundSongIdx + 1 };
    }

    // Move to next album
    const nextAlbumIdx = foundAlbumIdx + 1;
    if (nextAlbumIdx < albumsSeq.length) {
      return { songs: albumsSeq[nextAlbumIdx].songs, idx: 0 };
    }

    // Wrap to first album
    return { songs: albumsSeq[0].songs, idx: 0 };
  };

  const handleNext = () => {
    const list = playlistRef.current || playlist;
    if (!list.length) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx < list.length) {
      if (playIndexRef.current) playIndexRef.current(nextIdx, list);
      return;
    }
    // End of playlist
    if (viewMode !== 'playlists') {
      const currentPath = list[currentIndex]?.path;
      const next = getNextAlbumSong(currentPath);
      if (next && playIndexRef.current) {
        playIndexRef.current(next.idx, next.songs);
        return;
      }
    }
    // Otherwise loop within playlist
    if (playIndexRef.current) playIndexRef.current(0, list);
  };

  const handleSeek = (e) => {
    e.stopPropagation();
    e.preventDefault();
    
    console.log('handleSeek called');
    
    if (!audioRef.current) {
      console.log('No audio ref');
      return;
    }
    
    const dur = audioRef.current.duration;
    console.log('Audio duration:', dur, 'readyState:', audioRef.current.readyState);
    
    if (!dur || isNaN(dur) || dur === 0) {
      console.log('Duration not valid:', dur);
      return;
    }
    
    // Check if audio is ready for seeking (readyState >= 2 means HAVE_CURRENT_DATA)
    if (audioRef.current.readyState < 2) {
      console.log('Audio not ready for seeking, readyState:', audioRef.current.readyState);
      return;
    }
    
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const newTime = pct * dur;
    
    console.log('Seeking to:', newTime, 'seconds (', Math.round(pct * 100), '% of', dur, ')');
    
    try {
      audioRef.current.currentTime = newTime;
      setProgress(newTime);
      console.log('Seek successful');
    } catch (err) {
      console.error('Seek failed:', err);
    }
  };

  const handleVolumeChange = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setVolume(pct);
  };

  const toggleMute = () => {
    if (volume > 0) {
      setVolume(0);
    } else {
      setVolume(1.0);
    }
  };

  const handleSongClick = (songs, idx) => {
    if (playIndexRef.current) playIndexRef.current(idx, songs);
  };

  const openPlaylistModal = (song = null) => {
    setPendingSong(song);
    setPlaylistModalName('');
    setPlaylistModalExisting('');
    setPlaylistModalOpen(true);
  };

  const handleCreatePlaylist = () => {
    openPlaylistModal(null);
    setViewMode('playlists');
  };

  const upsertPlaylistWithSong = (playlistName, song) => {
    if (!playlistName || !song) return;
    setPlaylists((prev) =>
      prev.map((p) =>
        p.name === playlistName
          ? {
              ...p,
              songs: p.songs.some((s) => s.path === song.path) ? p.songs : [...p.songs, song],
            }
          : p
      )
    );
  };

  const confirmPlaylistAdd = async () => {
    setPopularError('');
    setPlaylistModalError('');
    const name = (playlistModalExisting || playlistModalName).trim();
    if (!name) return;
    const song = pendingSong;
    if (song) {
      try {
        setPlaylistModalError('');
        await musicAPI.addToPlaylist({
          name,
          path: song.path,
          title: song.title || song.name,
          artist: song.artist,
          album: song.album,
          track_number: song.track_number,
          duration_seconds: song.duration ?? song.duration_seconds,
        });
        await loadPlaylists();
      } catch (e) {
        console.error('Failed to add to playlist', e);
        setPlaylistModalError(e?.message || 'Failed to add to playlist');
        return;
      }
    } else {
      try {
        setPlaylistModalError('');
        await musicAPI.createPlaylist(name);
        await loadPlaylists();
      } catch (e) {
        console.error('Failed to create playlist', e);
        setPlaylistModalError(e?.message || 'Failed to create playlist');
        return;
      }
    }
    setSelectedPlaylist(name);
    setViewMode('playlists');
    setPlaylistModalOpen(false);
    setPendingSong(null);
  };

  const handleAddToPlaylist = (song, albumName, artistName) => {
    if (!song) return;
    const enriched = {
      ...song,
      album: song.album || song.album_title || albumName || song.albumName,
      artist: song.artist || song.artistName || artistName || song.artist_name,
    };
    setPendingSong(enriched);
    openPlaylistModal(enriched);
  };

  const currentPopular = selectedArtist ? popularMap[selectedArtist] || [] : [];

  const fetchPopular = async (artistName) => {
    if (!artistName) return;
    setPopularError('');
    setPopularLoading(true);
    try {
      const res = await musicAPI.getPopular(artistName);
      if (res.success) {
        setPopularMap((prev) => ({ ...prev, [artistName]: res.popular || [] }));
      } else {
        setPopularError(res.error || 'Failed to load popular songs');
      }
    } catch (e) {
      setPopularError(e?.message || 'Failed to load popular songs');
    } finally {
      setPopularLoading(false);
    }
  };

  const handleGeneratePopular = async () => {
    if (!selectedArtist) return;
    setPopularError('');
    setPopularLoading(true);
    try {
      console.log('Popular refresh: requesting generatePopular for', selectedArtist);
      const res = await musicAPI.generatePopular(selectedArtist);
      console.log('Popular refresh response:', res);
      if (res.success) {
        setPopularMap((prev) => ({ ...prev, [selectedArtist]: res.popular || [] }));
      } else {
        setPopularError(res.error || 'Failed to generate popular songs');
        console.error('Popular refresh failed:', res);
      }
    } catch (e) {
      setPopularError(e?.message || 'Failed to generate popular songs');
      console.error('Popular refresh exception:', e);
    } finally {
      setPopularLoading(false);
    }
  };

  const guessArtistDirectoryFromSongs = (artist) => {
    const firstSongPath = artist?.albums?.[0]?.songs?.[0]?.path;
    if (!firstSongPath) return null;
    const parts = firstSongPath.split('/');
    if (parts.length < 3) return null;
    return parts.slice(0, -2).join('/');
  };

  const normalizeMusicPath = (path) => {
    if (!path) return null;
    // Convert absolute paths to relative paths
    const musicBase = '/Users/davidnorminton/Music/';
    if (path.startsWith(musicBase)) {
      return path.substring(musicBase.length);
    } else if (path.startsWith('/Users/davidnorminton/Music')) {
      let relPath = path.substring('/Users/davidnorminton/Music'.length);
      if (relPath.startsWith('/')) {
        relPath = relPath.substring(1);
      }
      return relPath;
    }
    // Already relative or different format
    return path;
  };

  const guessCoverFromSongPath = (songPath) => {
    if (!songPath) return null;
    const relPath = normalizeMusicPath(songPath);
    const parts = relPath.split('/');
    if (parts.length < 2) return null;
    const dir = parts.slice(0, -1).join('/');
    const baseNames = ['cover', 'Cover', 'folder', 'Folder', 'album', 'Album'];
    const exts = ['webp', 'jpg', 'jpeg', 'png'];
    const picks = [];
    baseNames.forEach((b) => exts.forEach((ext) => picks.push(`${dir}/${b}.${ext}`)));
    return picks[0] || null;
  };

  const makeArtistImageCandidates = (artist, artistName = '') => {
    const candidates = [];

    const push = (val) => {
      if (val) candidates.push(val);
    };

    const addCoverFields = (obj) => {
      push(obj?.cover_path);
      push(obj?.coverPath);
      push(obj?.image_path);
      push(obj?.imagePath);
      push(obj?.image);
    };

    addCoverFields(artist);
    (artist?.albums || []).forEach((al) => addCoverFields(al));

    const artistDir = guessArtistDirectoryFromSongs(artist);
    const roots = [];
    if (artistDir) roots.push(artistDir);
    if (artistName) roots.push(`/Users/davidnorminton/Music/${artistName}`);

    // Prioritize cover.jpg for artist images
    roots.forEach((root) => {
      push(`${root}/cover.jpg`);
    });

    // Then check other common names and extensions
    const baseNames = ['cover', 'Cover', 'folder', 'Folder', 'album', 'Album'];
    const exts = ['webp', 'jpg', 'jpeg', 'png'];
    roots.forEach((root) => {
      baseNames.forEach((b) => {
        exts.forEach((ext) => {
          const path = `${root}/${b}.${ext}`;
          // Skip cover.jpg as we already added it first
          if (path !== `${root}/cover.jpg`) {
            push(path);
          }
        });
      });
    });

    // Deduplicate while preserving order
    return Array.from(new Set(candidates.filter(Boolean)));
  };

  const getArtistImage = (artist) => makeArtistImageCandidates(artist, artist?.name)[0] || null;

  const nextImageFallback = (e, candidates) => {
    const idx = Number(e.target.dataset.idx || '0');
    const nextIdx = idx + 1;
    const next = candidates?.[nextIdx];
    if (next) {
      e.target.dataset.idx = String(nextIdx);
      e.target.src = `/api/music/stream?path=${encodeURIComponent(next)}`;
    }
  };

  const currentPlaylist = useMemo(() => {
    if (!selectedPlaylist) return null;
    return playlists.find((p) => p.name === selectedPlaylist) || null;
  }, [selectedPlaylist, playlists]);

  const allAlbums = useMemo(() => {
    const albums = [];
    library.forEach((artist) => {
      (artist.albums || []).forEach((album) => {
        albums.push({
          ...album,
          artistName: artist.name,
        });
      });
    });
    return albums.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date(a.year || 0, 0, 1);
      const dateB = b.date ? new Date(b.date) : new Date(b.year || 0, 0, 1);
      return dateB.getTime() - dateA.getTime();
    });
  }, [library]);

  const currentAlbum = useMemo(() => {
    if (!selectedArtist || !selectedAlbum) return null;
    if (!currentArtist) return null;
    const alb = currentArtist.albums?.find((al) => al.name === selectedAlbum);
    return alb || null;
  }, [selectedArtist, selectedAlbum, currentArtist]);

  const handleHeroToggle = () => {
    if (isPlaying) {
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }
      return;
    }
    if (playlist.length && currentIndex >= 0) {
      audioRef.current
        ?.play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.error('Play error', e));
      return;
    }
    // Choose songs from playlist, selected album, otherwise from the latest album
    if (viewMode === 'playlists' && currentPlaylist?.songs?.length) {
      if (playIndexRef.current) playIndexRef.current(0, currentPlaylist.songs);
      return;
    }
    const baseAlbum = currentAlbum || sortedAlbums[0];
    const songs = sortSongs(baseAlbum?.songs || []);
    if (songs.length && playIndexRef.current) {
      playIndexRef.current(0, songs);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${s}`;
  };

  const stats = useMemo(() => {
    let totalSongs = 0;
    let totalDuration = 0;
    const addSongs = (songs = []) => {
      songs.forEach((s) => {
        totalSongs += 1;
        totalDuration += s.duration ?? lengths[s.path] ?? 0;
      });
    };
    if (viewMode === 'playlists' && selectedPlaylist) {
      const pl = playlists.find((p) => p.name === selectedPlaylist);
      addSongs(pl?.songs || []);
    } else if (selectedAlbum && currentAlbum?.songs) {
      addSongs(currentAlbum.songs);
    } else if (currentArtist?.albums) {
      currentArtist.albums.forEach((al) => addSongs(al.songs));
    }
    return {
      songs: totalSongs,
      durationText: totalDuration ? formatTime(totalDuration) : '',
    };
  }, [viewMode, selectedPlaylist, playlists, selectedAlbum, currentAlbum, currentArtist, lengths]);

  useEffect(() => {
    if (!currentArtist?.albums?.length) return;
    const songs = currentArtist.albums.flatMap((al) => al.songs || []);
    if (!songs.length) return;
    const fetchLengths = async () => {
      const updates = {};
      await Promise.all(
        songs.map(async (s) => {
          if (lengths[s.path]) return;
          try {
            const meta = await musicAPI.getMetadata(s.path);
            updates[s.path] = meta.duration || 0;
          } catch (e) {
            updates[s.path] = 0;
          }
        })
      );
      if (Object.keys(updates).length) {
        setLengths((prev) => ({ ...prev, ...updates }));
      }
    };
    fetchLengths();
  }, [currentArtist, lengths]);

  useEffect(() => {
    if (viewMode === 'playlists') return;
    if (!selectedArtist) return;
    fetchPopular(selectedArtist);
  }, [selectedArtist, viewMode]);

  const handleAlbumSelect = (artistName, albumName) => {
    setSelectedArtist(artistName);
    setSelectedAlbum(albumName);
    setViewMode('albums');
  };

  const heroLabel = viewMode === 'playlists' && selectedPlaylist ? 'Playlist' : selectedAlbum && currentAlbum ? 'Album' : 'Artist';
  const heroTitle = viewMode === 'playlists' && selectedPlaylist ? selectedPlaylist : selectedAlbum && currentAlbum ? currentAlbum.name : selectedArtist || 'Select an artist';
  const heroSub =
    viewMode === 'playlists' && selectedPlaylist
      ? `${stats.songs} songs${stats.durationText ? ` • ${stats.durationText}` : ''}`
      : selectedAlbum && currentAlbum
      ? `${currentAlbum.artist || selectedArtist || ''}${currentAlbum.songs?.length ? ` • ${currentAlbum.songs.length} songs` : ''}`
      : stats.songs
      ? `${stats.songs} songs${stats.durationText ? ` • ${stats.durationText}` : ''}`
      : '';

  const heroImageCandidates = useMemo(() => {
    const candidates = [];
    const push = (val) => {
      if (val) {
        const normalized = normalizeMusicPath(val);
        if (normalized) candidates.push(normalized);
      }
    };

    // Current album cover first
    if (currentAlbum) {
      push(currentAlbum.cover_path);
      push(currentAlbum.coverPath);
      push(currentAlbum.image);
      push(currentAlbum.image_path);
      push(currentAlbum.imagePath);
    }

    // Playlist cover guess from first song
    if (viewMode === 'playlists' && selectedPlaylist) {
      const pl = playlists.find((p) => p.name === selectedPlaylist);
      const firstSong = pl?.songs?.[0];
      if (firstSong) {
        // Try to find album cover from library
        const albumName = firstSong.album || firstSong.album_title || firstSong.albumName;
        const artistName = firstSong.artist || firstSong.artistName || firstSong.artist_name;
        if (albumName && artistName) {
          const artist = library.find((a) => a.name === artistName);
          const album = artist?.albums?.find((al) => al.name === albumName);
          if (album) {
            push(album.image || album.cover_path || album.coverPath || album.image_path || album.imagePath);
          }
        }
        // Fallback to guessing from song path
        const coverGuess = guessCoverFromSongPath(firstSong.path);
        push(coverGuess);
      }
    }

    // Artist images
    makeArtistImageCandidates(currentArtist, selectedArtist).forEach((c) => push(c));

    // Extra fallback to selected artist path - prioritize cover.jpg
    if (selectedArtist) {
      push(`/Users/davidnorminton/Music/${selectedArtist}/cover.jpg`);
      const baseNames = ['cover', 'Cover', 'folder', 'Folder', 'album', 'Album'];
      const exts = ['webp', 'jpg', 'jpeg', 'png'];
      baseNames.forEach((b) => {
        exts.forEach((ext) => {
          const path = `/Users/davidnorminton/Music/${selectedArtist}/${b}.${ext}`;
          // Skip cover.jpg as we already added it first
          if (path !== `/Users/davidnorminton/Music/${selectedArtist}/cover.jpg`) {
            push(path);
          }
        });
      });
    }

    return Array.from(new Set(candidates.filter(Boolean)));
  }, [currentAlbum, currentArtist, selectedArtist, viewMode, selectedPlaylist, playlists, library]);

  const heroBgStyle = {
    backgroundImage:
      heroImageCandidates.length > 0
        ? [
            'linear-gradient(180deg, rgba(11, 139, 230, 0.82) 0%, rgba(5, 47, 107, 0.92) 100%)',
            ...heroImageCandidates.map((p) => `url(/api/music/stream?path=${encodeURIComponent(p)})`),
          ].join(', ')
        : 'linear-gradient(180deg, rgba(11, 139, 230, 0.82) 0%, rgba(5, 47, 107, 0.92) 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="music-page">
      {error && <div className="music-error">{error}</div>}

      <div className="music-layout">
        <div className="music-sidebar">
          <div className="music-filters">
            <button
              className={`filter-pill ${viewMode === 'artists' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('artists');
                setSelectedPlaylist(null);
              }}
            >
              Artists
            </button>
            <button
              className={`filter-pill ${viewMode === 'albums' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('albums');
                setSelectedPlaylist(null);
              }}
            >
              Albums
            </button>
            <button
              className={`filter-pill ${viewMode === 'playlists' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('playlists');
                setSelectedArtist(null);
                setSelectedAlbum(null);
              }}
            >
              Playlists
            </button>
          </div>
          <div className="music-library">
            {library.length === 0 && !loading && <div className="music-empty">No music found yet.</div>}
            {viewMode === 'playlists' && (
              <div className="playlist-actions">
                <button className="playlist-add-btn" onClick={handleCreatePlaylist}>
                  + New playlist
                </button>
              </div>
            )}
            {viewMode === 'artists' &&
              library.map((artist) => {
                const artistCandidates = makeArtistImageCandidates(artist, artist.name);
                const artistImg = artistCandidates[0];
                return (
                  <div
                    key={artist.name}
                    className={`music-row artist-only ${selectedArtist === artist.name && !selectedAlbum ? 'active' : ''}`}
                    onClick={() => toggleArtist(artist.name)}
                  >
                    {artistImg && (
                      <img
                        src={`/api/music/stream?path=${encodeURIComponent(artistImg)}`}
                        alt={`${artist.name} cover`}
                        className="artist-thumb"
                        data-idx="0"
                        onError={(e) => nextImageFallback(e, artistCandidates)}
                      />
                    )}
                    <strong>{artist.name}</strong>
                  </div>
                );
              })}
            {viewMode === 'playlists' &&
              playlists.map((pl) => (
                <div
                  key={pl.name}
                  className={`music-row artist-only ${selectedPlaylist === pl.name ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedPlaylist(pl.name);
                    setSelectedArtist(null);
                    setSelectedAlbum(null);
                  }}
                >
                  <strong>{pl.name}</strong>
                  <div className="music-row-sub">{pl.songs?.length || 0} songs</div>
                </div>
              ))}
            {viewMode === 'albums' &&
              allAlbums.map((album) => (
                <div
                  key={`${album.artistName}-${album.name}`}
                  className={`music-row album-only ${
                    selectedAlbum === album.name && selectedArtist === album.artistName ? 'active' : ''
                  }`}
                  onClick={() => handleAlbumSelect(album.artistName, album.name)}
                >
                  <div className="music-row-title">
                    <div className="music-row-title-line">
                      {(() => {
                        const albumImg =
                          album.image ||
                          album.cover_path ||
                          album.coverPath ||
                          (album.songs?.[0]?.path ? guessCoverFromSongPath(album.songs?.[0]?.path) : null);
                        return albumImg ? (
                          <img
                            src={`/api/music/stream?path=${encodeURIComponent(albumImg)}`}
                            alt={`${album.name} cover`}
                            className="album-thumb"
                          />
                        ) : null;
                      })()}
                      <strong>{album.name}</strong>
                    </div>
                    <div className="music-row-sub">{album.artistName}</div>
                  </div>
                  <div className="music-row-meta">
                    {album.year || (album.date ? new Date(album.date).getFullYear() : '')}
                  </div>
                </div>
              ))}
          </div>
        </div>

        <div className="music-main">
          <div className="music-hero" style={heroBgStyle}>
            {heroImageCandidates[0] ? (
              <img
                src={`/api/music/stream?path=${encodeURIComponent(heroImageCandidates[0])}`}
                alt={currentArtist?.name || currentAlbum?.name || currentPlaylist?.name || 'Artist'}
                className="album-hero"
                data-idx="0"
                onError={(e) => nextImageFallback(e, heroImageCandidates)}
              />
            ) : (
              <div className="album-hero" style={{ background: 'rgba(0, 0, 0, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', fontSize: '0.9em' }}>
                {viewMode === 'playlists' ? '🎵' : '🎤'}
              </div>
            )}
            <div className="hero-text">
              <div className="album-label">{heroLabel}</div>
              <h1 className="hero-title">{heroTitle}</h1>
              <div className="album-artist">{heroSub}</div>
              <div className="hero-actions">
                <button
                  className="hero-play"
                  onClick={handleHeroToggle}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>
                <button className="hero-icon" title="Shuffle">🔀</button>
                <button className="hero-icon" title="Repeat">↻</button>
              </div>
            </div>
          </div>

          <div className="music-tracklist">
            <div className="tracklist-body">
              {viewMode === 'playlists' ? (
                currentPlaylist?.songs?.length ? (
                  <div className="album-section">
                    <div className="album-section-title">{currentPlaylist.name}</div>
                    <div className="tracklist-header playlist-view">
                      <span className="col-index">#</span>
                      <span className="col-title">Title</span>
                      <span className="col-artist">Artist</span>
                      <span className="col-album">Album</span>
                      <span className="col-length">Length</span>
                      <span className="col-add" />
                    </div>
                    {currentPlaylist.songs.map((song, idx) => {
                      const active = playlist[currentIndex]?.path === song.path;
                      const dur = song.duration ?? lengths[song.path];
                      return (
                        <div
                          key={`${song.path}-${idx}`}
                          className={`track-row playlist-view ${active ? 'active' : ''}`}
                          onClick={() => handleSongClick(currentPlaylist.songs, idx)}
                        >
                          <span className="col-index">{song.track_number || idx + 1}</span>
                          <span className="col-title">{song.name}</span>
                          <span className="col-artist">{song.artist || song.artistName || song.artist_name || ''}</span>
                          <span className="col-album">{song.album || song.album_title || song.albumName || ''}</span>
                          <span className="col-length">{formatTime(dur)}</span>
                          <button
                            className="track-add"
                            title="Add to playlist"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAddToPlaylist(
                                song,
                                song.album || song.album_title || song.albumName || '',
                                song.artist || song.artistName || song.artist_name || currentArtist?.name || ''
                              );
                            }}
                          >
                            +
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="music-empty">
                    {playlists.length ? 'Select a playlist to view tracks' : 'Create a playlist to get started'}
                  </div>
                )
              ) : (
                <>
                  <div className="album-section popular-section">
                    <div className="album-section-title popular-title">
                      <span>Popular</span>
                      <div className="popular-actions">
                        <button className="playlist-add-btn" onClick={handleGeneratePopular} disabled={popularLoading} title="Refresh popular songs">
                          {popularLoading ? '⟳' : '⟳'}
                        </button>
                      </div>
                    </div>
                    {popularError && <div className="music-error-inline">{popularError}</div>}
                    {popularLoading && <div className="music-empty">Loading popular songs…</div>}
                    {currentPopular.length > 0 && (
                      <>
                        <div className="tracklist-header">
                          <span className="col-index">#</span>
                          <span className="col-title">Title</span>
                          <span className="col-length">Length</span>
                          <span className="col-add" />
                        </div>
                        {currentPopular.map((song, idx) => {
                          const active = playlist[currentIndex]?.path === song.path;
                          const dur = song.duration ?? song.duration_seconds ?? lengths[song.path];
                          return (
                            <div
                              key={`${song.path}-${idx}`}
                              className={`track-row ${active ? 'active' : ''}`}
                              onClick={() => handleSongClick(currentPopular, idx)}
                            >
                              <span className="col-index">{song.track_number || idx + 1}</span>
                              <span className="col-title">{song.title || song.name}</span>
                              <span className="col-length">{formatTime(dur)}</span>
                              <button
                                className="track-add"
                                title="Add to playlist"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToPlaylist({
                                    ...song,
                                    name: song.title || song.name,
                                  });
                                }}
                              >
                                +
                              </button>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </div>
                  {sortedAlbums.map((album) => {
                    const songsSorted = sortSongs(album.songs || []);
                    return (
                      <div key={album.name} className="album-section">
                        <div className="album-section-title">{album.name}</div>
                        <div className="tracklist-header">
                          <span className="col-index">#</span>
                          <span className="col-title">Title</span>
                          <span className="col-length">Length</span>
                          <span className="col-add" />
                        </div>
                        {songsSorted.map((song, idx) => {
                          const active = playlist[currentIndex]?.path === song.path;
                          const dur = song.duration ?? lengths[song.path];
                          return (
                            <div
                              key={song.path}
                              className={`track-row ${active ? 'active' : ''}`}
                              onClick={() => handleSongClick(songsSorted, idx)}
                            >
                              <span className="col-index">{song.track_number || idx + 1}</span>
                              <span className="col-title">{song.name}</span>
                              <span className="col-length">{formatTime(dur)}</span>
                              <button
                                className="track-add"
                                title="Add to playlist"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddToPlaylist(song);
                                }}
                              >
                                +
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  {!sortedAlbums.length && <div className="music-empty">Select an artist to view tracks</div>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="music-bottom-spacer" />
      <div className="music-player-footer">
        <div className="music-player-left">
          <div className="music-controls-row">
            <button className="control-icon" title="Shuffle">🔀</button>
            <button className="control-btn" onClick={handlePrev} title="Previous">⏮</button>
            <button className="control-btn play-btn" onClick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="control-btn" onClick={handleNext} title="Next">⏭</button>
            <button className="control-icon" title="Repeat">🔁</button>
          </div>
          <div className="music-progress-container">
            <span className="time-stamp">{formatTime(progress)}</span>
            <div className="music-progress" onClick={handleSeek}>
              <div
                className="music-progress-fill"
                style={{
                  width: duration ? `${(progress / duration) * 100}%` : '0%',
                }}
              />
              <div
                className="music-progress-handle"
                style={{
                  left: duration ? `${(progress / duration) * 100}%` : '0%',
                }}
              />
            </div>
            <span className="time-stamp">{formatTime(duration)}</span>
          </div>
        </div>
        <div className="music-volume-control">
          <button className="volume-icon" onClick={toggleMute} title={volume > 0 ? 'Mute' : 'Unmute'}>
            {volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
          </button>
          <div className="music-volume-slider" onClick={handleVolumeChange}>
            <div
              className="music-volume-fill"
              style={{
                width: `${volume * 100}%`,
              }}
            />
            <div
              className="music-volume-handle"
              style={{
                left: `${volume * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {playlistModalOpen && (
        <div className="playlist-modal-overlay" onClick={() => setPlaylistModalOpen(false)}>
          <div className="playlist-modal" onClick={(e) => e.stopPropagation()}>
            <h4>{pendingSong ? 'Add to playlist' : 'Create playlist'}</h4>
            {playlists.length > 0 && (
              <div className="form-group">
                <label>Select existing</label>
                <select
                  value={playlistModalExisting}
                  onChange={(e) => setPlaylistModalExisting(e.target.value)}
                >
                  <option value="">-- none --</option>
                  {playlists.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-group">
              <label>Or create new</label>
              <input
                type="text"
                placeholder="Playlist name"
                value={playlistModalName}
                onChange={(e) => setPlaylistModalName(e.target.value)}
              />
            </div>
            {playlistModalError && <div className="settings-message error">{playlistModalError}</div>}
            <div className="modal-actions">
              <button className="save-button secondary" onClick={() => setPlaylistModalOpen(false)}>
                Cancel
              </button>
              <button
                className="save-button"
                onClick={confirmPlaylistAdd}
                disabled={!playlistModalExisting && !playlistModalName.trim()}
              >
                {pendingSong ? 'Add' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

