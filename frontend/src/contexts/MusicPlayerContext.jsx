import { createContext, useContext, useRef, useState, useEffect, useCallback } from 'react';

const MusicPlayerContext = createContext(null);

export function MusicPlayerProvider({ children }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [currentSong, setCurrentSong] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isShuffled, setIsShuffled] = useState(false);
  const [shuffleQueue, setShuffleQueue] = useState([]);
  
  const audioRef = useRef(null);
  const handleNextRef = useRef(null);
  const playlistRef = useRef([]);
  const wasPlayingBeforeFocusRef = useRef(false);

  // Initialize audio element
  useEffect(() => {
    audioRef.current = new Audio();
    
    const onTimeUpdate = () => {
      if (audioRef.current) {
        setProgress(audioRef.current.currentTime || 0);
      }
    };
    
    const onLoaded = () => {
      if (audioRef.current) {
        setDuration(audioRef.current.duration || 0);
      }
    };
    
    const onEnded = () => {
      console.log('[MusicPlayer] Song ended, handleNextRef.current:', handleNextRef.current);
      if (handleNextRef.current) {
        try {
          handleNextRef.current();
        } catch (err) {
          console.error('[MusicPlayer] Error calling handleNext:', err);
        }
      } else {
        console.warn('[MusicPlayer] No handleNext handler set');
      }
    };

    const audio = audioRef.current;
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('loadeddata', onLoaded);
    audio.addEventListener('durationchange', onLoaded);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('loadeddata', onLoaded);
      audio.removeEventListener('durationchange', onLoaded);
      audio.removeEventListener('ended', onEnded);
      // Don't pause on cleanup - let it keep playing
    };
  }, []);

  // Update volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Keep refs in sync
  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  const playSong = useCallback((song, index, songPlaylist) => {
    if (!audioRef.current) return;
    
    const songPath = song.file_path || song.path;
    if (!songPath) {
      console.error('Song has no path:', song);
      return;
    }

    // Update playlist if provided
    if (songPlaylist) {
      setPlaylist(songPlaylist);
      playlistRef.current = songPlaylist;
    }
    
    setCurrentIndex(index);
    setCurrentSong(song);
    
    // Reset progress
    setProgress(0);
    
    // Set source and play
    audioRef.current.src = `/api/music/stream?path=${encodeURIComponent(songPath)}`;
    audioRef.current.currentTime = 0;
    audioRef.current.play()
      .then(() => {
        setIsPlaying(true);
      })
      .catch((err) => {
        console.error('Error playing song:', err);
        setIsPlaying(false);
      });
  }, []);

  const pause = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const resume = useCallback(() => {
    if (audioRef.current && currentSong) {
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch((err) => {
          console.error('Error resuming song:', err);
        });
    }
  }, [currentSong]);

  const togglePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  const seek = useCallback((time) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setProgress(time);
    }
  }, []);

  const setNextHandler = useCallback((handler) => {
    handleNextRef.current = handler;
  }, []);

  const setPlaylistAndIndex = useCallback((newPlaylist, index) => {
    setPlaylist(newPlaylist);
    playlistRef.current = newPlaylist;
    setCurrentIndex(index);
  }, []);

  // Listen for focus mode events (pause/resume music)
  useEffect(() => {
    const handleEnterFocusMode = () => {
      // Save current playing state
      if (audioRef.current && !audioRef.current.paused) {
        wasPlayingBeforeFocusRef.current = true;
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        wasPlayingBeforeFocusRef.current = false;
      }
    };

    const handleExitFocusMode = () => {
      // Resume if it was playing before
      if (wasPlayingBeforeFocusRef.current && audioRef.current && currentSong) {
        audioRef.current.play()
          .then(() => {
            setIsPlaying(true);
          })
          .catch((err) => {
            console.error('Error resuming music after focus mode:', err);
          });
      }
      wasPlayingBeforeFocusRef.current = false;
    };

    window.addEventListener('enterFocusMode', handleEnterFocusMode);
    window.addEventListener('exitFocusMode', handleExitFocusMode);
    
    return () => {
      window.removeEventListener('enterFocusMode', handleEnterFocusMode);
      window.removeEventListener('exitFocusMode', handleExitFocusMode);
    };
  }, [currentSong]);

  const value = {
    // State
    isPlaying,
    progress,
    duration,
    volume,
    currentSong,
    playlist,
    currentIndex,
    isShuffled,
    shuffleQueue,
    audioRef,
    
    // Actions
    playSong,
    pause,
    resume,
    togglePlayPause,
    seek,
    setVolume,
    setIsShuffled,
    setShuffleQueue,
    setNextHandler,
    setPlaylistAndIndex,
    setCurrentIndex,
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  );
}

export function useMusicPlayer() {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error('useMusicPlayer must be used within MusicPlayerProvider');
  }
  return context;
}
