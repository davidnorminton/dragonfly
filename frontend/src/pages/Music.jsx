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
  const audioRef = useRef(null);
  const heroImgRef = useRef(null);

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

  useEffect(() => {
    scanLibrary();
  }, []);

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
    const onEnded = () => handleNext();
    audioRef.current.addEventListener('timeupdate', onTime);
    audioRef.current.addEventListener('loadedmetadata', onLoaded);
    audioRef.current.addEventListener('loadeddata', onLoaded);
    audioRef.current.addEventListener('durationchange', onLoaded);
    audioRef.current.addEventListener('ended', onEnded);
    return () => {
      if (!audioRef.current) return;
      audioRef.current.removeEventListener('timeupdate', onTime);
      audioRef.current.removeEventListener('loadedmetadata', onLoaded);
      audioRef.current.removeEventListener('loadeddata', onLoaded);
      audioRef.current.removeEventListener('durationchange', onLoaded);
      audioRef.current.removeEventListener('ended', onEnded);
      audioRef.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playIndex = async (idx, list = playlist) => {
    if (idx < 0 || idx >= list.length) return;
    setPlaylist(list);
    setCurrentIndex(idx);
    const track = list[idx];
    const src = `/api/music/stream?path=${encodeURIComponent(track.path)}`;
    const fallbackDuration = track.duration ?? lengths[track.path] ?? 0;
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
    if (!playlist.length) return;
    const nextIdx = currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    playIndex(nextIdx);
  };

  const handleNext = () => {
    if (!playlist.length) return;
    const nextIdx = currentIndex + 1 < playlist.length ? currentIndex + 1 : 0;
    playIndex(nextIdx);
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const newTime = pct * duration;
    audioRef.current.currentTime = newTime;
    setProgress(newTime);
  };

  const handleSongClick = (songs, idx) => {
    playIndex(idx, songs);
  };

  const sortSongs = (songs = []) =>
    songs.slice().sort((a, b) => {
      const ta = a.track_number ?? 9999;
      const tb = b.track_number ?? 9999;
      return ta - tb;
    });

  const guessArtistDirectoryFromSongs = (artist) => {
    const firstSongPath = artist?.albums?.[0]?.songs?.[0]?.path;
    if (!firstSongPath) return null;
    const parts = firstSongPath.split('/');
    if (parts.length < 3) return null;
    return parts.slice(0, -2).join('/');
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
    const baseNames = ['cover', 'Cover', 'folder', 'Folder', 'album', 'Album'];
    const exts = ['webp', 'jpg', 'jpeg', 'png'];
    const roots = [];
    if (artistDir) roots.push(artistDir);
    if (artistName) roots.push(`/Users/davidnorminton/Music/${artistName}`);

    roots.forEach((root) => {
      baseNames.forEach((b) => {
        exts.forEach((ext) => push(`${root}/${b}.${ext}`));
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

  const currentArtist = useMemo(() => {
    if (!selectedArtist) return null;
    return library.find((a) => a.name === selectedArtist) || null;
  }, [selectedArtist, library]);

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

  const sortedAlbums = useMemo(() => {
    if (!currentArtist?.albums) return [];
    return [...currentArtist.albums].sort((a, b) => {
      const ya = a.year || (a.date ? parseInt(String(a.date).split('-')[0]) : 0);
      const yb = b.year || (b.date ? parseInt(String(b.date).split('-')[0]) : 0);
      if (yb !== ya) return (yb || 0) - (ya || 0); // newest first
      return a.name.localeCompare(b.name);
    });
  }, [currentArtist]);

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
    // Choose songs from the selected album, otherwise from the latest album
    const baseAlbum = currentAlbum || sortedAlbums[0];
    const songs = sortSongs(baseAlbum?.songs || []);
    if (songs.length) {
      playIndex(0, songs);
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
    if (selectedAlbum && currentAlbum?.songs) {
      addSongs(currentAlbum.songs);
    } else if (currentArtist?.albums) {
      currentArtist.albums.forEach((al) => addSongs(al.songs));
    }
    return {
      songs: totalSongs,
      durationText: totalDuration ? formatTime(totalDuration) : '',
    };
  }, [selectedAlbum, currentAlbum, currentArtist, lengths]);

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

  const handleAlbumSelect = (artistName, albumName) => {
    setSelectedArtist(artistName);
    setSelectedAlbum(albumName);
    setViewMode('albums');
  };

  const heroLabel = selectedAlbum && currentAlbum ? 'Album' : 'Artist';
  const heroTitle = selectedAlbum && currentAlbum ? currentAlbum.name : selectedArtist || 'Select an artist';
  const heroSub =
    selectedAlbum && currentAlbum
      ? `${currentAlbum.artist || selectedArtist || ''}${currentAlbum.songs?.length ? ` • ${currentAlbum.songs.length} songs` : ''}`
      : stats.songs
      ? `${stats.songs} songs${stats.durationText ? ` • ${stats.durationText}` : ''}`
      : '';

  const heroImageCandidates = useMemo(() => {
    const candidates = [];
    const push = (val) => val && candidates.push(val);

    // Current album cover first
    if (currentAlbum) {
      push(currentAlbum.cover_path);
      push(currentAlbum.coverPath);
      push(currentAlbum.image);
      push(currentAlbum.image_path);
      push(currentAlbum.imagePath);
    }

    // Artist images
    makeArtistImageCandidates(currentArtist, selectedArtist).forEach((c) => push(c));

    // Extra fallback to selected artist path
    if (selectedArtist) {
      const baseNames = ['cover', 'Cover', 'folder', 'Folder', 'album', 'Album'];
      const exts = ['webp', 'jpg', 'jpeg', 'png'];
      baseNames.forEach((b) => exts.forEach((ext) => push(`/Users/davidnorminton/Music/${selectedArtist}/${b}.${ext}`)));
    }

    return Array.from(new Set(candidates.filter(Boolean)));
  }, [currentAlbum, currentArtist, selectedArtist]);

  const heroBgStyle =
    heroImageCandidates.length > 0
      ? {
          backgroundImage: [
            'linear-gradient(180deg, rgba(11, 139, 230, 0.82) 0%, rgba(5, 47, 107, 0.92) 100%)',
            ...heroImageCandidates.map((p) => `url(/api/music/stream?path=${encodeURIComponent(p)})`),
          ].join(', '),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }
      : undefined;

  return (
    <div className="music-page">
      {error && <div className="music-error">{error}</div>}

      <div className="music-layout">
        <div className="music-sidebar">
          <div className="music-filters">
            <button
              className={`filter-pill ${viewMode === 'artists' ? 'active' : ''}`}
              onClick={() => setViewMode('artists')}
            >
              Artists
            </button>
            <button
              className={`filter-pill ${viewMode === 'albums' ? 'active' : ''}`}
              onClick={() => setViewMode('albums')}
            >
              Albums
            </button>
          </div>
          <div className="music-library">
            {library.length === 0 && !loading && <div className="music-empty">No music found yet.</div>}
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
                    <strong>{album.name}</strong>
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
            {heroImageCandidates[0] && (
              <img
                src={`/api/music/stream?path=${encodeURIComponent(heroImageCandidates[0])}`}
                alt={currentArtist?.name || currentAlbum?.name || 'Artist'}
                className="album-hero"
                data-idx="0"
                onError={(e) => nextImageFallback(e, heroImageCandidates)}
              />
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
              {sortedAlbums.map((album) => {
                const songsSorted = sortSongs(album.songs || []);
                return (
                  <div key={album.name} className="album-section">
                    <div className="album-section-title">{album.name}</div>
                    <div className="tracklist-header">
                      <span className="col-index">#</span>
                      <span className="col-title">Title</span>
                      <span className="col-length">Length</span>
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
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {!sortedAlbums.length && <div className="music-empty">Select an artist to view tracks</div>}
            </div>
          </div>
        </div>
      </div>

      <div className="music-bottom-spacer" />
      <div className="music-player-footer">
        <div className="music-controls">
          <div className="music-controls-row">
            <button className="hero-icon" title="Shuffle">🔀</button>
            <button className="control-btn" onClick={handlePrev} title="Previous">⏮</button>
            <button className="control-btn play-btn" onClick={handlePlayPause} title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button className="control-btn" onClick={handleNext} title="Next">⏭</button>
            <button className="hero-icon" title="Repeat">🔁</button>
          </div>
          <div className="music-progress-row">
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
      </div>
    </div>
  );
}

