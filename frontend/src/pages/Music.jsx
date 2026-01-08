import { useEffect, useRef, useState, useMemo } from 'react';
import { musicAPI } from '../services/api';

export function MusicPage({ searchQuery = '' }) {
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
  const [aboutMap, setAboutMap] = useState({});
  const [aboutLoading, setAboutLoading] = useState(false);
  const [aboutError, setAboutError] = useState('');
  const [discographyMap, setDiscographyMap] = useState({});
  const [discographyLoading, setDiscographyLoading] = useState(false);
  const [discographyError, setDiscographyError] = useState('');
  const [videosMap, setVideosMap] = useState({});
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosError, setVideosError] = useState('');
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [playlistModalOpen, setPlaylistModalOpen] = useState(false);
  const [playlistModalName, setPlaylistModalName] = useState('');
  const [playlistModalExisting, setPlaylistModalExisting] = useState('');
  const [pendingSong, setPendingSong] = useState(null);
  const [playlistLoading, setPlaylistLoading] = useState(false);
  const [playlistModalError, setPlaylistModalError] = useState('');
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [songToRemove, setSongToRemove] = useState(null);
  const [volume, setVolume] = useState(1.0); // 0.0 to 1.0
  const [isScrolled, setIsScrolled] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleQueue, setShuffleQueue] = useState([]);
  const audioRef = useRef(null);
  const heroImgRef = useRef(null);
  const mainContentRef = useRef(null);
  const heroRef = useRef(null);
  const handleNextRef = useRef(null);
  const playIndexRef = useRef(null);
  const playlistRef = useRef([]);
  const lengthsRef = useRef({});
  const sortedAlbumsRef = useRef([]);

  // Define these early so they're available for useCallback dependencies
  const filteredLibrary = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return library;
    
    const query = searchQuery.toLowerCase();
    return library.map(artist => {
      // Filter albums and songs based on search
      const filteredAlbums = artist.albums.map(album => {
        const songMatches = album.songs.filter(song => 
          song.name?.toLowerCase().includes(query) ||
          song.title?.toLowerCase().includes(query)
        );
        
        const albumMatches = album.name?.toLowerCase().includes(query);
        
        // Include album if it matches or has matching songs
        if (albumMatches || songMatches.length > 0) {
          return {
            ...album,
            songs: songMatches.length > 0 ? songMatches : album.songs
          };
        }
        return null;
      }).filter(Boolean);
      
      const artistMatches = artist.name?.toLowerCase().includes(query);
      
      // Include artist if it matches or has matching albums
      if (artistMatches || filteredAlbums.length > 0) {
        return {
          ...artist,
          albums: filteredAlbums
        };
      }
      return null;
    }).filter(Boolean);
  }, [library, searchQuery]);

  const currentArtist = useMemo(() => {
    if (!selectedArtist) return null;
    return filteredLibrary.find((a) => a.name === selectedArtist) || null;
  }, [selectedArtist, filteredLibrary]);

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

  const loadLibrary = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await musicAPI.getLibrary();
      if (res.success) {
        setLibrary(res.artists || []);
        const firstArtist = res.artists?.[0];
        if (firstArtist) {
          setSelectedArtist(firstArtist.name);
          // album selection will auto-set to top sorted album later
        }
      } else {
        setError(res.error || 'Failed to load library');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load library');
    } finally {
      setLoading(false);
    }
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
    loadLibrary();
    loadPlaylists();
  }, []);

  // Listen for stopAllAudio event (e.g., when entering AI focus mode)
  useEffect(() => {
    const handleStopAllAudio = () => {
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        setIsPlaying(false);
      }
    };

    window.addEventListener('stopAllAudio', handleStopAllAudio);
    return () => {
      window.removeEventListener('stopAllAudio', handleStopAllAudio);
    };
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

  // Scroll detection for showing minimal hero
  useEffect(() => {
    if (!heroRef.current || !mainContentRef.current) return;

    // Show minimal hero when main hero's play button reaches the top
    // Main hero height: 280px, minimal hero height: 64px
    // Threshold: when scrolled ~216px (280px - 64px)
    const stickThreshold = 220; // Show minimal hero
    const unstickThreshold = 200; // Hide minimal hero

    const handleScroll = () => {
      if (!mainContentRef.current) return;
      
      const scrollTop = mainContentRef.current.scrollTop;
      
      // Use hysteresis to prevent flickering at the boundary
      setIsScrolled((prevScrolled) => {
        if (scrollTop >= stickThreshold) {
          return true; // Show minimal hero
        } else if (scrollTop <= unstickThreshold) {
          return false; // Hide minimal hero
        }
        // Between thresholds: maintain current state
        return prevScrolled;
      });
    };

    const mainContent = mainContentRef.current;
    mainContent.addEventListener('scroll', handleScroll, { passive: true });
    
    // Check initial state
    handleScroll();

    return () => {
      mainContent.removeEventListener('scroll', handleScroll);
    };
  }, [selectedArtist, selectedAlbum, selectedPlaylist]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Restore player state from session storage on mount
  useEffect(() => {
    try {
      const savedState = sessionStorage.getItem('musicPlayerState');
      if (savedState) {
        const state = JSON.parse(savedState);
        console.log('Restoring player state:', state);
        
        // Restore context (artist/album/playlist)
        if (state.selectedArtist) {
          setSelectedArtist(state.selectedArtist);
        }
        if (state.selectedAlbum) {
          setSelectedAlbum(state.selectedAlbum);
        }
        if (state.selectedPlaylist) {
          setSelectedPlaylist(state.selectedPlaylist);
        }
        
        // Restore playlist and current index
        if (state.playlist && state.playlist.length > 0) {
          setPlaylist(state.playlist);
          playlistRef.current = state.playlist;
          if (state.currentIndex >= 0) {
            setCurrentIndex(state.currentIndex);
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore player state:', err);
    }
  }, []); // Only run on mount

  // Save player state to session storage when it changes
  useEffect(() => {
    if (currentIndex >= 0 && playlist.length > 0) {
      const state = {
        currentIndex,
        playlist,
        selectedArtist,
        selectedAlbum,
        selectedPlaylist,
        timestamp: Date.now()
      };
      try {
        sessionStorage.setItem('musicPlayerState', JSON.stringify(state));
        console.log('Saved player state:', state);
      } catch (err) {
        console.error('Failed to save player state:', err);
      }
    }
  }, [currentIndex, playlist, selectedArtist, selectedAlbum, selectedPlaylist]);

  const playIndex = async (idx, list) => {
    const songList = list || playlistRef.current;
    if (!songList || idx < 0 || idx >= songList.length) return;
    // Update both ref and state for proper highlighting in shuffle mode
    playlistRef.current = songList;
    setPlaylist(songList);
    setCurrentIndex(idx);
    const track = songList[idx];
    
    // Debug logging
    console.log('Playing track:', track);
    console.log('Track path:', track.path);
    
    if (!track.path) {
      console.error('Track has no path!', track);
      setIsPlaying(false);
      return;
    }
    
    const src = `/api/music/stream?path=${encodeURIComponent(track.path)}`;
    console.log('Audio src:', src);
    
    const fallbackDuration = track.duration ?? lengthsRef.current[track.path] ?? 0;
    setProgress(0);
    setDuration(fallbackDuration);
    if (audioRef.current) {
      audioRef.current.src = src;
      audioRef.current.currentTime = 0;
      try {
        await audioRef.current.play();
        setIsPlaying(true);
        
        // Track play for analytics
        try {
          await musicAPI.trackPlay(track.path, track.duration);
        } catch (err) {
          console.error('Failed to track play:', err);
          // Don't stop playback if tracking fails
        }
      } catch (e) {
        console.error('Play error', e, 'for src:', src);
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
    // End of current list
    // Check if we're playing from popular list (don't auto-advance to albums)
    const isPlayingPopular = currentPopular.length > 0 && 
                             list.length === currentPopular.length &&
                             list[0]?.path === currentPopular[0]?.path;
    
    if (viewMode !== 'playlists' && !isPlayingPopular) {
      // Only auto-advance to next album if not playing from popular list
      const currentPath = list[currentIndex]?.path;
      const next = getNextAlbumSong(currentPath);
      if (next && playIndexRef.current) {
        playIndexRef.current(next.idx, next.songs);
        return;
      }
    }
    // Loop back to beginning of current list
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
    console.log('handleSongClick called with:', { songCount: songs.length, index: idx, firstSong: songs[0] });
    
    // Clear shuffle when manually clicking a song
    setIsShuffled(false);
    setShuffleQueue([]);
    
    // Make sure we have valid songs and index
    if (!songs || !Array.isArray(songs) || idx < 0 || idx >= songs.length) {
      console.error('Invalid songs or index:', { songs, idx });
      return;
    }
    
    // Stop current playback before starting new song
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
      console.log('Paused current song before switching');
    }
    
    if (playIndexRef.current) {
      playIndexRef.current(idx, songs);
    }
  };

  const handleShuffle = () => {
    if (isShuffled) {
      // Turn off shuffle
      setIsShuffled(false);
      setShuffleQueue([]);
    } else {
      // Turn on shuffle - get all songs from current context
      let songsToShuffle = [];
      
      if (viewMode === 'playlists' && selectedPlaylist) {
        const currentPlaylistData = playlists.find((p) => p.name === selectedPlaylist);
        songsToShuffle = currentPlaylistData?.songs || [];
      } else if (selectedAlbum && currentAlbum) {
        songsToShuffle = sortSongs(currentAlbum.songs || []);
      } else if (currentArtist && !selectedAlbum) {
        // On artist page - use popular songs if available, otherwise all songs
        if (currentPopular && currentPopular.length > 0) {
          songsToShuffle = currentPopular;
        } else {
          // Fallback to all songs from current artist
          const allSongs = sortedAlbums.flatMap((album) => sortSongs(album.songs || []));
          songsToShuffle = allSongs;
        }
      }
      
      if (songsToShuffle.length > 0) {
        // Shuffle using Fisher-Yates algorithm
        const shuffled = [...songsToShuffle];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        setIsShuffled(true);
        setShuffleQueue(shuffled);
        
        // Start playing first song in shuffled queue
        if (playIndexRef.current) {
          playIndexRef.current(0, shuffled);
        }
      }
    }
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

  const handleRemoveFromPlaylist = (song) => {
    setSongToRemove(song);
    setRemoveConfirmOpen(true);
  };

  const confirmRemoveFromPlaylist = async () => {
    if (!songToRemove || !selectedPlaylist) return;
    
    try {
      const res = await musicAPI.removeFromPlaylist(selectedPlaylist, songToRemove.path);
      if (res.success) {
        // Reload playlists to reflect the change
        const playlistRes = await musicAPI.getPlaylists();
        if (playlistRes.success) {
          setPlaylists(playlistRes.playlists || []);
        }
      } else {
        console.error('Failed to remove song:', res.error);
      }
    } catch (err) {
      console.error('Error removing song from playlist:', err);
    } finally {
      setRemoveConfirmOpen(false);
      setSongToRemove(null);
    }
  };

  const cancelRemoveFromPlaylist = () => {
    setRemoveConfirmOpen(false);
    setSongToRemove(null);
  };

  const currentPopular = selectedArtist ? popularMap[selectedArtist] || [] : [];

  const fetchPopular = async (artistName) => {
    if (!artistName) return;
    setPopularError('');
    setPopularLoading(true);
    try {
      const res = await musicAPI.getPopular(artistName);
      if (res.success) {
        const popularSongs = res.popular || [];
        console.log('Popular songs loaded for', artistName, ':', popularSongs);
        
        // Verify all songs have required fields
        const validSongs = popularSongs.filter(song => {
          if (!song.path) {
            console.error('Popular song missing path:', song);
            return false;
          }
          return true;
        });
        
        if (validSongs.length !== popularSongs.length) {
          console.warn(`Filtered out ${popularSongs.length - validSongs.length} invalid songs`);
        }
        
        setPopularMap((prev) => ({ ...prev, [artistName]: validSongs }));
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

  const fetchAbout = async (artistName) => {
    if (!artistName) return;
    setAboutError('');
    setAboutLoading(true);
    try {
      const res = await musicAPI.getAbout(artistName);
      if (res.success) {
        if (res.about) {
          setAboutMap((prev) => ({ ...prev, [artistName]: res.about }));
        }
      } else {
        setAboutError(res.error || 'Failed to load about info');
      }
    } catch (e) {
      setAboutError(e?.message || 'Failed to load about info');
    } finally {
      setAboutLoading(false);
    }
  };

  const handleGenerateAbout = async () => {
    if (!selectedArtist) return;
    setAboutError('');
    setAboutLoading(true);
    try {
      const res = await musicAPI.generateAbout(selectedArtist);
      if (res.success) {
        setAboutMap((prev) => ({ ...prev, [selectedArtist]: res.about || '' }));
      } else {
        setAboutError(res.error || 'Failed to generate about info');
      }
    } catch (e) {
      setAboutError(e?.message || 'Failed to generate about info');
    } finally {
      setAboutLoading(false);
    }
  };

  const fetchDiscography = async (artistName) => {
    if (!artistName) return;
    setDiscographyError('');
    setDiscographyLoading(true);
    try {
      const res = await musicAPI.getDiscography(artistName);
      if (res.success) {
        if (res.discography) {
          setDiscographyMap((prev) => ({ ...prev, [artistName]: res.discography }));
        }
      } else {
        setDiscographyError(res.error || 'Failed to load discography');
      }
    } catch (e) {
      setDiscographyError(e?.message || 'Failed to load discography');
    } finally {
      setDiscographyLoading(false);
    }
  };

  const handleGenerateDiscography = async () => {
    if (!selectedArtist) return;
    console.log('=== GENERATE DISCOGRAPHY ===');
    console.log('Artist:', selectedArtist);
    setDiscographyError('');
    setDiscographyLoading(true);
    try {
      const res = await musicAPI.generateDiscography(selectedArtist);
      console.log('Discography response:', res);
      if (res.success) {
        console.log('Success! Discography:', res.discography);
        setDiscographyMap((prev) => ({ ...prev, [selectedArtist]: res.discography || [] }));
      } else {
        console.error('Discography generation failed:', res.error);
        console.error('Debug info:', res.debug);
        setDiscographyError(res.error || 'Failed to generate discography');
      }
    } catch (e) {
      console.error('Discography exception:', e);
      setDiscographyError(e?.message || 'Failed to generate discography');
    } finally {
      setDiscographyLoading(false);
    }
  };

  const fetchVideos = async (artistName) => {
    if (!artistName) return;
    setVideosError('');
    setVideosLoading(true);
    try {
      const res = await musicAPI.getVideos(artistName);
      if (res.success) {
        if (res.videos) {
          setVideosMap((prev) => ({ ...prev, [artistName]: res.videos }));
        }
      } else {
        setVideosError(res.error || 'Failed to load videos');
      }
    } catch (e) {
      setVideosError(e?.message || 'Failed to load videos');
    } finally {
      setVideosLoading(false);
    }
  };

  const handleGenerateVideos = async () => {
    if (!selectedArtist) return;
    setVideosError('');
    setVideosLoading(true);
    try {
      const res = await musicAPI.generateVideos(selectedArtist);
      if (res.success) {
        setVideosMap((prev) => ({ ...prev, [selectedArtist]: res.videos || [] }));
      } else {
        setVideosError(res.error || 'Failed to generate videos');
      }
    } catch (e) {
      setVideosError(e?.message || 'Failed to generate videos');
    } finally {
      setVideosLoading(false);
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

    // Use artist metadata images
    push(artist?.image_path);
    push(artist?.imagePath);
    push(artist?.image);

    // Only use cover.jpg for artist root directory
    const artistDir = guessArtistDirectoryFromSongs(artist);
    const roots = [];
    if (artistDir) roots.push(artistDir);
    if (artistName) roots.push(`/Users/davidnorminton/Music/${artistName}`);

    roots.forEach((root) => {
      push(`${root}/cover.jpg`);
    });

    // Removed all other fallback images - only cover.jpg
    const baseNames = [];
    const exts = [];
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
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60)
      .toString()
      .padStart(2, '0');
    
    if (h > 0) {
      return `${h} hr ${m} min`;
    }
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
    
    // Don't stop playback when switching artists - let it continue
    // It will only stop when user clicks a new song
    
    fetchPopular(selectedArtist);
    fetchAbout(selectedArtist);
    fetchDiscography(selectedArtist);
    fetchVideos(selectedArtist);
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

    // Artist images - only cover.jpg
    makeArtistImageCandidates(currentArtist, selectedArtist).forEach((c) => push(c));

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
            {filteredLibrary.length === 0 && !loading && <div className="music-empty">{searchQuery ? 'No results found' : 'No music found yet.'}</div>}
            {viewMode === 'playlists' && (
              <div className="playlist-actions">
                <button className="playlist-add-btn" onClick={handleCreatePlaylist}>
                  + New playlist
                </button>
              </div>
            )}
            {viewMode === 'artists' &&
              filteredLibrary.map((artist) => {
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

        <div className="music-main" ref={mainContentRef}>
          {/* Minimal sticky hero - shows when scrolled */}
          <div className={`music-hero-minimal ${isScrolled ? 'visible' : ''}`}>
            <button
              className="hero-play-minimal"
              onClick={handleHeroToggle}
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2.7 1a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7H2.7zm8 0a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7h-2.6z"/>
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 1.713a.7.7 0 011.05-.607l10.89 6.288a.7.7 0 010 1.212L4.05 14.894A.7.7 0 013 14.288V1.713z"/>
                </svg>
              )}
            </button>
            <h2 className="hero-title-minimal">{heroTitle}</h2>
          </div>

          {/* Main full-size hero - scrolls normally */}
          <div ref={heroRef} className="music-hero" style={heroBgStyle}>
            {heroImageCandidates[0] ? (
              <img
                src={`/api/music/stream?path=${encodeURIComponent(heroImageCandidates[0])}`}
                alt={currentArtist?.name || currentAlbum?.name || currentPlaylist?.name || 'Artist'}
                className="album-hero"
                data-idx="0"
                onError={(e) => nextImageFallback(e, heroImageCandidates)}
              />
            ) : (
              <div className="album-hero" style={{ background: 'rgba(0, 0, 0, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>
                {viewMode === 'playlists' ? (
                  <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M15 14.5H5V13h10v1.5zm0-5.75H5v1.5h10v-1.5zM15 3H5v1.5h10V3zM3 3H1v1.5h2V3zm0 11.5H1V16h2v-1.5zm0-5.75H1v1.5h2v-1.5z"/>
                  </svg>
                ) : (
                  <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M11 5a3 3 0 11-6 0 3 3 0 016 0zM8 7a2 2 0 100-4 2 2 0 000 4zm.256 7a4.474 4.474 0 01-.229-1.004H3c.001-.246.154-.986.832-1.664C4.484 10.68 5.711 10 8 10c.26 0 .507.009.74.025.226-.341.496-.65.804-.918C9.077 9.038 8.564 9 8 9c-5 0-6 3-6 4s1 1 1 1h5.256z"/>
                    <path d="M12.5 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7zm-.646-4.854l.646.647.646-.647a.5.5 0 01.708.708l-.647.646.647.646a.5.5 0 01-.708.708L12.5 13.207l-.646.647a.5.5 0 01-.708-.708l.647-.646-.647-.646a.5.5 0 01.708-.708z"/>
                  </svg>
                )}
              </div>
            )}
            <div className="hero-text">
              <div className="album-label">{heroLabel}</div>
              <h1 className="hero-title">{heroTitle}</h1>
              <div className="album-artist">
                {selectedAlbum && currentAlbum ? (
                  <>
                    {(() => {
                      const artist = library.find((a) => a.name === (currentAlbum.artist || selectedArtist));
                      let artistImgPath = artist?.image || artist?.image_path;
                      
                      // Normalize the path (remove base path if present)
                      if (artistImgPath) {
                        artistImgPath = normalizeMusicPath(artistImgPath);
                      }
                      
                      // If no image, try to construct path from artist name
                      if (!artistImgPath && artist?.name) {
                        artistImgPath = `${artist.name}/cover.jpg`;
                      }
                      
                      return artistImgPath ? (
                        <img
                          src={`/api/music/stream?path=${encodeURIComponent(artistImgPath)}`}
                          alt={artist?.name}
                          className="artist-circular-thumb"
                          onError={(e) => (e.target.style.display = 'none')}
                        />
                      ) : null;
                    })()}
                    <span 
                      className="artist-name-link" 
                      onClick={() => {
                        setSelectedAlbum(null);
                        setViewMode('artists');
                      }}
                    >
                      {currentAlbum.artist || selectedArtist || ''}
                    </span>
                    {currentAlbum.songs?.length ? ` • ${currentAlbum.songs.length} songs` : ''}
                    {stats.durationText ? ` • ${stats.durationText}` : ''}
                  </>
                ) : (
                  heroSub
                )}
              </div>
              <div className="hero-actions">
                <button
                  className="hero-play"
                  onClick={handleHeroToggle}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M2.7 1a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7H2.7zm8 0a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7h-2.6z"/>
                    </svg>
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M3 1.713a.7.7 0 011.05-.607l10.89 6.288a.7.7 0 010 1.212L4.05 14.894A.7.7 0 013 14.288V1.713z"/>
                    </svg>
                  )}
                </button>
                <button 
                  className={`hero-icon ${isShuffled ? 'active' : ''}`} 
                  onClick={handleShuffle} 
                  title={isShuffled ? 'Shuffle: On' : 'Shuffle: Off'}
                >
                  <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.151.922a.75.75 0 10-1.06 1.06L13.109 3H11.16a3.75 3.75 0 00-2.873 1.34l-6.173 7.356A2.25 2.25 0 01.39 13H0v1.5h.391a3.75 3.75 0 002.873-1.34l6.173-7.356A2.25 2.25 0 0111.16 4.5h1.95l-1.02 1.02a.75.75 0 101.06 1.06l2.273-2.273a.75.75 0 000-1.06L13.151.922zM11.16 12.5H13.11l-1.02-1.02a.75.75 0 111.06-1.06l2.273 2.273a.75.75 0 010 1.06l-2.273 2.273a.75.75 0 11-1.06-1.06l1.02-1.02H11.16a2.25 2.25 0 01-1.722-.804l-1.367-1.628a3.75 3.75 0 002.873 1.932zm-8.282-.804A2.25 2.25 0 010 10.5V9h.391a3.75 3.75 0 002.873-1.34l1.367-1.628a3.75 3.75 0 00-2.873 1.932l-1.867 2.228z"/>
                  </svg>
                </button>
                <button className="hero-icon" title="Repeat">
                  <svg width="24" height="24" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M0 4.75A3.75 3.75 0 013.75 1h8.5A3.75 3.75 0 0116 4.75v5a3.75 3.75 0 01-3.75 3.75H9.81l1.018 1.018a.75.75 0 11-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 111.06 1.06L9.811 12h2.439a2.25 2.25 0 002.25-2.25v-5a2.25 2.25 0 00-2.25-2.25h-8.5a2.25 2.25 0 00-2.25 2.25v5A2.25 2.25 0 003.75 12H5v1.5H3.75A3.75 3.75 0 010 9.75v-5z"/>
                  </svg>
                </button>
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
                      <span className="col-album">Album</span>
                      <span className="col-length">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                          <path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8z"/>
                          <path d="M8 3.25a.75.75 0 01.75.75v3.25H11a.75.75 0 010 1.5H7.25V4A.75.75 0 018 3.25z"/>
                        </svg>
                      </span>
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
                          <span className="col-index">
                            {active && isPlaying ? (
                              <div className="playing-bars">
                                <span className="bar"></span>
                                <span className="bar"></span>
                                <span className="bar"></span>
                                <span className="bar"></span>
                              </div>
                            ) : (
                              idx + 1
                            )}
                          </span>
                          <span className="col-title">
                            <div className="title-main">{song.name}</div>
                            <div className="title-sub">{song.artist || song.artistName || song.artist_name || ''}</div>
                          </span>
                          <span className="col-album">{song.album || song.album_title || song.albumName || ''}</span>
                          <span className="col-length">{formatTime(dur)}</span>
                          <button
                            className="track-remove"
                            title="Remove from playlist"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveFromPlaylist(song);
                            }}
                          >
                            −
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
                  {!(viewMode === 'albums' && selectedAlbum) && (
                    <div className="album-section popular-section">
                      <div className="album-section-title popular-title">
                        <span>Popular</span>
                        <div className="popular-actions">
                          <button className="playlist-add-btn" onClick={handleGeneratePopular} disabled={popularLoading} title="Refresh popular songs">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" className={popularLoading ? 'spinning' : ''}>
                              <path fillRule="evenodd" d="M8 3a5 5 0 104.546 2.914.5.5 0 00-.908-.417A4 4 0 118 4v1H6.5a.5.5 0 000 1H9a.5.5 0 00.5-.5V2.5a.5.5 0 00-1 0V3z"/>
                            </svg>
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
                                <span className="col-index">
                                  {active && isPlaying ? (
                                    <div className="playing-bars">
                                      <span className="bar"></span>
                                      <span className="bar"></span>
                                      <span className="bar"></span>
                                      <span className="bar"></span>
                                    </div>
                                  ) : (
                                    idx + 1
                                  )}
                                </span>
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
                  )}
                  {viewMode === 'albums' && selectedAlbum && currentAlbum ? (
                    // Single album view - show songs
                    <div className="album-section">
                      <div className="tracklist-header">
                        <span className="col-index">#</span>
                        <span className="col-title">Title</span>
                        <span className="col-length">Length</span>
                        <span className="col-add" />
                      </div>
                      {sortSongs(currentAlbum.songs || []).map((song, idx) => {
                        const active = playlist[currentIndex]?.path === song.path;
                        const dur = song.duration ?? lengths[song.path];
                        const songsSorted = sortSongs(currentAlbum.songs || []);
                        return (
                          <div
                            key={song.path}
                            className={`track-row ${active ? 'active' : ''}`}
                            onClick={() => handleSongClick(songsSorted, idx)}
                          >
                            <span className="col-index">
                              {active && isPlaying ? (
                                <div className="playing-bars">
                                  <span className="bar"></span>
                                  <span className="bar"></span>
                                  <span className="bar"></span>
                                  <span className="bar"></span>
                                </div>
                              ) : (
                                song.track_number || idx + 1
                              )}
                            </span>
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
                  ) : (
                    // Artist view - show album tiles
                    <>
                      {sortedAlbums.length > 0 && (
                        <div className="album-section">
                          <div className="album-section-title">Discography</div>
                          <div className="album-grid">
                            {sortedAlbums.map((album) => {
                              const albumImg =
                                album.image ||
                                album.cover_path ||
                                album.coverPath ||
                                (album.songs?.[0]?.path ? guessCoverFromSongPath(album.songs?.[0]?.path) : null);
                              return (
                                <div
                                  key={album.name}
                                  className="album-card"
                                  onClick={() => handleAlbumSelect(selectedArtist, album.name)}
                                >
                                  {albumImg ? (
                                    <img
                                      src={`/api/music/stream?path=${encodeURIComponent(albumImg)}`}
                                      alt={`${album.name} cover`}
                                      className="album-card-img"
                                    />
                                  ) : (
                                    <div className="album-card-placeholder">
                                      <svg width="48" height="48" viewBox="0 0 16 16" fill="currentColor">
                                        <path d="M8 0a8 8 0 100 16A8 8 0 008 0zM3.5 6.5a.5.5 0 11-1 0 .5.5 0 011 0zm9.5 0a.5.5 0 11-1 0 .5.5 0 011 0zM8 13a4.5 4.5 0 01-3.848-2.13c-.178-.3.162-.654.478-.472C5.564 11.152 6.762 11.5 8 11.5s2.437-.348 3.37-1.102c.316-.182.656.172.478.472A4.5 4.5 0 018 13z"/>
                                      </svg>
                                    </div>
                                  )}
                                  <div className="album-card-title">{album.name}</div>
                                  <div className="album-card-meta">
                                    {album.year || (album.date ? new Date(album.date).getFullYear() : '')}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {selectedArtist && (
                        <div className="album-section about-section">
                          <div className="album-section-title">About</div>
                          {aboutMap[selectedArtist] ? (
                            <div className="about-content">{aboutMap[selectedArtist]}</div>
                          ) : (
                            <button 
                              className="about-generate-btn" 
                              onClick={handleGenerateAbout}
                              disabled={aboutLoading}
                            >
                              {aboutLoading ? 'Generating...' : 'Generate About Info'}
                            </button>
                          )}
                          {aboutError && <div className="music-error-inline">{aboutError}</div>}
                        </div>
                      )}
                      {selectedArtist && (
                        <div className="album-section discography-section">
                          <div className="album-section-title">Full Discography</div>
                          {discographyMap[selectedArtist] ? (
                            <div className="discography-list">
                              {discographyMap[selectedArtist].map((album, idx) => {
                                // Check if this album exists in the user's library
                                const albumInLibrary = sortedAlbums.find(
                                  (a) => a.name.toLowerCase() === album.title.toLowerCase()
                                );
                                return (
                                  <div key={idx} className="discography-item">
                                    <span className="discography-year">{album.year}</span>
                                    {albumInLibrary ? (
                                      <span
                                        className="discography-title linked"
                                        onClick={() => handleAlbumSelect(selectedArtist, albumInLibrary.name)}
                                      >
                                        {album.title}
                                      </span>
                                    ) : (
                                      <span className="discography-title">{album.title}</span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <button 
                              className="about-generate-btn" 
                              onClick={handleGenerateDiscography}
                              disabled={discographyLoading}
                            >
                              {discographyLoading ? 'Generating...' : 'Generate Full Discography'}
                            </button>
                          )}
                          {discographyError && <div className="music-error-inline">{discographyError}</div>}
                        </div>
                      )}
                      
                      {selectedArtist && (
                        <div className="album-section videos-section">
                          <div className="album-section-title">
                            Videos
                            <span className="videos-disclaimer"> (Some videos may be region-restricted)</span>
                          </div>
                          {videosMap[selectedArtist] ? (
                            <div className="videos-grid">
                              {videosMap[selectedArtist].map((video, idx) => (
                                <div key={idx} className="video-card" onClick={() => setSelectedVideo(video)}>
                                  <div className="video-thumbnail">
                                    <img 
                                      src={`https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`} 
                                      alt={video.title}
                                    />
                                    <div className="video-play-overlay">
                                      <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
                                        <path d="M8 5v14l11-7z"/>
                                      </svg>
                                    </div>
                                  </div>
                                  <div className="video-title">{video.title}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <button 
                              className="about-generate-btn" 
                              onClick={handleGenerateVideos}
                              disabled={videosLoading}
                            >
                              {videosLoading ? 'Generating...' : 'Generate Video List'}
                            </button>
                          )}
                          {videosError && <div className="music-error-inline">{videosError}</div>}
                        </div>
                      )}
                      
                      {!sortedAlbums.length && <div className="music-empty">Select an artist to view albums</div>}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="music-bottom-spacer" />
      
      {selectedVideo && (
        <div className="video-modal-overlay" onClick={() => setSelectedVideo(null)}>
          <div className="video-modal" onClick={(e) => e.stopPropagation()}>
            <button className="video-close" onClick={() => setSelectedVideo(null)}>✕</button>
            <iframe
              width="100%"
              height="100%"
              src={`https://www.youtube.com/embed/${selectedVideo.videoId}?autoplay=1`}
              title={selectedVideo.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
      <div className="music-player-footer">
        <div className="music-player-left">
          <div className="music-controls-row">
            <button 
              className={`control-icon ${isShuffled ? 'active' : ''}`} 
              onClick={handleShuffle} 
              title={isShuffled ? 'Shuffle: On' : 'Shuffle: Off'}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.151.922a.75.75 0 10-1.06 1.06L13.109 3H11.16a3.75 3.75 0 00-2.873 1.34l-6.173 7.356A2.25 2.25 0 01.39 13H0v1.5h.391a3.75 3.75 0 002.873-1.34l6.173-7.356A2.25 2.25 0 0111.16 4.5h1.95l-1.02 1.02a.75.75 0 101.06 1.06l2.273-2.273a.75.75 0 000-1.06L13.151.922zM11.16 12.5H13.11l-1.02-1.02a.75.75 0 111.06-1.06l2.273 2.273a.75.75 0 010 1.06l-2.273 2.273a.75.75 0 11-1.06-1.06l1.02-1.02H11.16a2.25 2.25 0 01-1.722-.804l-1.367-1.628a3.75 3.75 0 002.873 1.932zm-8.282-.804A2.25 2.25 0 010 10.5V9h.391a3.75 3.75 0 002.873-1.34l1.367-1.628a3.75 3.75 0 00-2.873 1.932l-1.867 2.228z"/>
              </svg>
            </button>
            <button className="control-btn" onClick={handlePrev} title="Previous">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.3 1a.7.7 0 01.7.7v5.15l9.95-5.744a.7.7 0 011.05.606v12.575a.7.7 0 01-1.05.607L4 9.149V14.3a.7.7 0 01-.7.7H1.7a.7.7 0 01-.7-.7V1.7a.7.7 0 01.7-.7h1.6z"/>
              </svg>
            </button>
            <button className="control-btn play-btn" onClick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2.7 1a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7H2.7zm8 0a.7.7 0 00-.7.7v12.6a.7.7 0 00.7.7h2.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7h-2.6z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M3 1.713a.7.7 0 011.05-.607l10.89 6.288a.7.7 0 010 1.212L4.05 14.894A.7.7 0 013 14.288V1.713z"/>
                </svg>
              )}
            </button>
            <button className="control-btn" onClick={handleNext} title="Next">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M12.7 1a.7.7 0 00-.7.7v5.15L2.05 1.107A.7.7 0 001 1.712v12.575a.7.7 0 001.05.607L12 9.149V14.3a.7.7 0 00.7.7h1.6a.7.7 0 00.7-.7V1.7a.7.7 0 00-.7-.7h-1.6z"/>
              </svg>
            </button>
            <button className="control-icon" title="Repeat">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M0 4.75A3.75 3.75 0 013.75 1h8.5A3.75 3.75 0 0116 4.75v5a3.75 3.75 0 01-3.75 3.75H9.81l1.018 1.018a.75.75 0 11-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 111.06 1.06L9.811 12h2.439a2.25 2.25 0 002.25-2.25v-5a2.25 2.25 0 00-2.25-2.25h-8.5a2.25 2.25 0 00-2.25 2.25v5A2.25 2.25 0 003.75 12H5v1.5H3.75A3.75 3.75 0 010 9.75v-5z"/>
              </svg>
            </button>
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
            {volume === 0 ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.86 5.47a.75.75 0 00-1.061 0l-1.47 1.47-1.47-1.47A.75.75 0 008.8 6.53L10.269 8l-1.47 1.47a.75.75 0 101.06 1.06l1.47-1.47 1.47 1.47a.75.75 0 001.06-1.06L12.39 8l1.47-1.47a.75.75 0 000-1.06z"/>
                <path d="M10.116 1.5A.75.75 0 008.991.85l-6.925 4a3.642 3.642 0 00-1.33 4.967 3.639 3.639 0 001.33 1.332l6.925 4a.75.75 0 001.125-.649v-1.906a4.73 4.73 0 01-1.5-.694v1.3L2.817 9.852a2.141 2.141 0 01-.781-2.92c.187-.324.456-.594.78-.782l5.8-3.35v1.3c.45-.313.956-.55 1.5-.694V1.5z"/>
              </svg>
            ) : volume < 0.5 ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.741.85a.75.75 0 01.375.65v13a.75.75 0 01-1.125.65l-6.925-4a3.642 3.642 0 01-1.33-4.967 3.639 3.639 0 011.33-1.332l6.925-4a.75.75 0 01.75 0zm-6.924 5.3a2.139 2.139 0 000 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 4.29V5.56a2.75 2.75 0 010 4.88z"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M9.741.85a.75.75 0 01.375.65v13a.75.75 0 01-1.125.65l-6.925-4a3.642 3.642 0 01-1.33-4.967 3.639 3.639 0 011.33-1.332l6.925-4a.75.75 0 01.75 0zm-6.924 5.3a2.139 2.139 0 000 3.7l5.8 3.35V2.8l-5.8 3.35zm8.683 6.087a4.502 4.502 0 000-8.474v1.65a2.999 2.999 0 010 5.175v1.649z"/>
              </svg>
            )}
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

      {removeConfirmOpen && (
        <div className="playlist-modal-overlay" onClick={cancelRemoveFromPlaylist}>
          <div className="playlist-modal" onClick={(e) => e.stopPropagation()}>
            <h4>Remove from playlist</h4>
            <p style={{ marginBottom: '20px', color: '#e0e0e0' }}>
              Are you sure you want to remove "{songToRemove?.name || songToRemove?.title}" from this playlist?
            </p>
            <div className="modal-actions">
              <button className="save-button secondary" onClick={cancelRemoveFromPlaylist}>
                Cancel
              </button>
              <button
                className="save-button"
                onClick={confirmRemoveFromPlaylist}
                style={{ background: '#dc3545' }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

