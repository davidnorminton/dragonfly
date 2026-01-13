import { useState, useRef, useEffect } from 'react';
import '../styles/VideoPlayer.css';
import { useChromecast } from '../hooks/useChromecast';
import { videoProgressAPI } from '../services/videoProgress';

export const VideoPlayer = ({ videoId, title, onClose, type = 'movie' }) => {
  const { 
    castAvailable, 
    casting, 
    castVideo, 
    stopCasting, 
    castSession, 
    playbackInfo,
    playCast,
    pauseCast,
    seekCast,
    setCastVolume
  } = useChromecast();

  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const progressBarRef = useRef(null);
  const controlsTimeoutRef = useRef(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const [buffered, setBuffered] = useState(0);

  const [videoUrl, setVideoUrl] = useState('');

  // Get full URL for Chromecast compatibility
  useEffect(() => {
    const getVideoUrl = async () => {
      try {
        // Fetch network info from server to get the correct IP for Chromecast
        const response = await fetch('/api/system/network-info');
        const networkInfo = await response.json();
        
        // Use network IP instead of localhost for Chromecast compatibility
        const protocol = window.location.protocol;
        const host = `${networkInfo.network_ip}:${networkInfo.port}`;
        const fullUrl = `${protocol}//${host}/api/video/stream/${videoId}`;
        
        console.log('🎬 VideoPlayer mounted:', { videoId, title, type });
        console.log('🌐 Network IP:', networkInfo.network_ip);
        console.log('📍 Video URL for Chromecast:', fullUrl);
        console.log('📍 This URL will work with Chromecast (uses network IP, not localhost)');
        
        setVideoUrl(fullUrl);
      } catch (error) {
        // Fallback to current location if network info fails
        console.warn('Failed to get network info, using current location:', error);
        const protocol = window.location.protocol;
        const host = window.location.host;
        const fallbackUrl = `${protocol}//${host}/api/video/stream/${videoId}`;
        console.log('📍 Fallback URL:', fallbackUrl);
        setVideoUrl(fallbackUrl);
      }
    };

    getVideoUrl();
  }, [videoId, title, type]);

  // Format time as HH:MM:SS or MM:SS
  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle play/pause toggle
  const togglePlayPause = () => {
    // If casting, use cast controls
    if (casting && playbackInfo) {
      if (playbackInfo.playerState === 'PLAYING') {
        pauseCast();
      } else {
        playCast();
      }
      return;
    }
    
    // Otherwise use local video controls
    const video = videoRef.current;
    if (!video) {
      console.warn('Video element not ready');
      return;
    }
    
    if (isPlaying) {
      console.log('⏸ Pausing video');
      video.pause();
    } else {
      console.log('▶️ Playing video');
      video.play().catch(err => {
        console.error('Play failed:', err);
      });
    }
  };

  // Handle seeking via progress bar
  const handleProgressClick = (e) => {
    if (!progressBarRef.current) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const newTime = pos * duration;
    
    // If casting, use cast seek
    if (casting && playbackInfo) {
      seekCast(newTime);
      return;
    }
    
    // Otherwise use local video seek
    if (!videoRef.current) return;
    videoRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  // Handle progress bar dragging
  const handleProgressDrag = (e) => {
    if (!isSeeking) return;
    handleProgressClick(e);
  };

  // Handle volume change
  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    
    // If casting, use cast volume control
    if (casting) {
      setCastVolume(newVolume);
      setIsMuted(newVolume === 0);
      return;
    }
    
    // Otherwise use local video volume
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
    setIsMuted(newVolume === 0);
  };

  // Toggle mute
  const toggleMute = () => {
    if (videoRef.current) {
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      videoRef.current.muted = newMuted;
      if (newMuted) {
        setVolume(0);
      } else {
        const vol = volume === 0 ? 0.5 : volume;
        setVolume(vol);
        videoRef.current.volume = vol;
      }
    }
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    
    if (!isFullscreen) {
      if (containerRef.current.requestFullscreen) {
        containerRef.current.requestFullscreen();
      } else if (containerRef.current.webkitRequestFullscreen) {
        containerRef.current.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  };

  // Skip forward/backward
  const skipTime = (seconds) => {
    if (videoRef.current) {
      videoRef.current.currentTime = Math.max(0, Math.min(duration, currentTime + seconds));
    }
  };

  // Hide controls after inactivity
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  // Reload video when URL changes
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    
    console.log('Loading video with URL:', videoUrl);
    video.src = videoUrl;
    video.load();
  }, [videoUrl]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      console.log('🎬 Video playing');
      setIsPlaying(true);
    };
    const handlePause = () => {
      console.log('⏸ Video paused');
      setIsPlaying(false);
    };
    const handleLoadedMetadata = () => {
      console.log('✅ Video metadata loaded:', { duration: video.duration, videoWidth: video.videoWidth, videoHeight: video.videoHeight });
      setDuration(video.duration);
      setIsLoading(false);
    };
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
      
      // Update buffered
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleWaiting = () => {
      console.log('⏳ Video buffering...');
      setIsLoading(true);
    };
    const handleCanPlay = () => {
      console.log('▶️ Video can play');
      setIsLoading(false);
    };
    const handleError = (e) => {
      console.error('❌ Video error:', {
        error: video.error,
        code: video.error?.code,
        message: video.error?.message,
        src: video.currentSrc,
        networkState: video.networkState,
        readyState: video.readyState
      });
      setIsLoading(false);
    };
    const handleLoadStart = () => {
      console.log('🔄 Video load started:', video.currentSrc);
    };
    const handleLoadedData = () => {
      console.log('📊 Video data loaded');
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('waiting', handleWaiting);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleError);
    video.addEventListener('loadstart', handleLoadStart);
    video.addEventListener('loadeddata', handleLoadedData);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('waiting', handleWaiting);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleError);
      video.removeEventListener('loadstart', handleLoadStart);
      video.removeEventListener('loadeddata', handleLoadedData);
    };
  }, []);

  // Sync local state with cast playback info when casting
  useEffect(() => {
    if (casting && playbackInfo) {
      // Update current time from cast
      if (playbackInfo.currentTime !== undefined) {
        setCurrentTime(playbackInfo.currentTime);
      }
      
      // Update duration from cast
      if (playbackInfo.duration !== undefined) {
        setDuration(playbackInfo.duration);
      }
      
      // Update volume from cast
      if (playbackInfo.volume !== undefined) {
        setVolume(playbackInfo.volume);
        setIsMuted(playbackInfo.volume === 0);
      }
      
      // Update playing state from cast
      if (playbackInfo.playerState === 'PLAYING') {
        setIsPlaying(true);
      } else if (playbackInfo.playerState === 'PAUSED' || playbackInfo.playerState === 'IDLE') {
        setIsPlaying(false);
      }
    }
  }, [casting, playbackInfo]);

  // Initialize current season/episode info for episode tracking
  useEffect(() => {
    if (type === 'episode' && videoId) {
      // Reset auto-play trigger when episode changes
      window.__autoPlayTriggered = null;
      
      // Try to parse season/episode from title if available (format: "S01E02 - Title")
      if (title) {
        const match = title.match(/S(\d+)E(\d+)/i);
        if (match) {
          window.__currentSeason = parseInt(match[1], 10);
          window.__currentEpisode = parseInt(match[2], 10);
          console.log('📺 Episode info from title:', {
            season: window.__currentSeason,
            episode: window.__currentEpisode
          });
        }
      }
    } else {
      // Clear episode tracking for non-episodes
      window.__currentSeason = null;
      window.__currentEpisode = null;
    }
  }, [videoId, type, title]);

  // Load saved progress on mount
  useEffect(() => {
    const loadProgress = async () => {
      const progress = await videoProgressAPI.getProgress(type, videoId);
      if (progress.position > 10 && !progress.completed) {
        // Resume from saved position if >10 seconds and not completed
        setCurrentTime(progress.position);
        if (videoRef.current) {
          videoRef.current.currentTime = progress.position;
        }
      }
    };
    loadProgress();
  }, [videoId, type]);

  // Save progress periodically during playback
  useEffect(() => {
    if (!isPlaying || !duration) return;
    
    const interval = setInterval(() => {
      if (currentTime > 0) {
        videoProgressAPI.saveProgress(type, videoId, currentTime, duration);
      }
    }, 10000); // Save every 10 seconds
    
    return () => clearInterval(interval);
  }, [isPlaying, currentTime, duration, type, videoId]);

  // Save progress when video ends
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    
    const handleEnded = async () => {
      // Save final progress
      await videoProgressAPI.saveProgress(type, videoId, duration, duration);
      
      // Auto-play next episode if it's a TV episode
      if (type === 'episode') {
        const result = await videoProgressAPI.getNextEpisode(videoId);
        if (result.next_episode) {
          const nextEp = result.next_episode;
          console.log('Auto-playing next episode:', nextEp);
          
          // If casting, load next episode to Chromecast
          if (casting && castSession) {
            const protocol = window.location.protocol;
            const response = await fetch('/api/system/network-info');
            const networkInfo = await response.json();
            const host = `${networkInfo.network_ip}:${networkInfo.port}`;
            const nextUrl = `${protocol}//${host}/api/video/stream/${nextEp.id}`;
            const nextTitle = `S${nextEp.season_number}E${nextEp.episode_number} - ${nextEp.title}`;
            
            setTimeout(() => {
              castVideo(nextUrl, nextTitle, null, 0);
            }, 2000);
          }
        }
      }
    };
    
    video.addEventListener('ended', handleEnded);
    return () => video.removeEventListener('ended', handleEnded);
  }, [type, videoId, duration, casting, castSession, castVideo]);

  // Track currently casting episode ID (may differ from videoId prop if auto-played)
  const [currentlyCastingEpisodeId, setCurrentlyCastingEpisodeId] = useState(videoId);
  
  // Update currently casting episode ID when videoId changes or when we start casting
  useEffect(() => {
    if (type === 'episode') {
      setCurrentlyCastingEpisodeId(videoId);
    }
  }, [videoId, type]);

  // Track Chromecast playback and auto-play next episode
  useEffect(() => {
    if (!casting || !playbackInfo || !type || type !== 'episode') return;
    
    const { playerState, currentTime, duration: castDuration, hasEnded, isIdle } = playbackInfo;
    
    // Use currently casting episode ID for progress tracking
    const episodeIdToTrack = currentlyCastingEpisodeId || videoId;
    
    // Save progress for Chromecast playback every update
    if (currentTime > 0 && castDuration) {
      // Throttle saves - only save if position changed by more than 5 seconds
      const lastSaved = window.__lastSavedPosition || 0;
      if (Math.abs(currentTime - lastSaved) > 5) {
        videoProgressAPI.saveProgress(type, episodeIdToTrack, currentTime, castDuration);
        window.__lastSavedPosition = currentTime;
      }
    }
    
    // Better detection: episode ended if:
    // 1. hasEnded flag is true (from media update listener)
    // 2. Player state is IDLE and we're at/near the end (within 2 seconds)
    // 3. Player state is IDLE and we've watched substantial content (>10 seconds)
    const isNearEnd = castDuration && currentTime > 0 && (castDuration - currentTime) <= 2;
    const episodeEnded = hasEnded || 
                         (playerState === 'IDLE' && isNearEnd && currentTime > 10) ||
                         (playbackInfo.isAtEnd && playerState === 'IDLE');
    
    if (episodeEnded) {
      // Check if we already triggered auto-play for this episode
      const alreadyTriggered = window.__autoPlayTriggered === episodeIdToTrack;
      
      if (!alreadyTriggered) {
        console.log('🎬 Episode ended while casting:', {
          episodeId: episodeIdToTrack,
          currentTime: Math.floor(currentTime),
          duration: Math.floor(castDuration),
          playerState
        });
        window.__autoPlayTriggered = episodeIdToTrack;
        
        videoProgressAPI.getNextEpisode(episodeIdToTrack).then(result => {
          if (result.next_episode) {
            const nextEp = result.next_episode;
            const currentSeason = window.__currentSeason || (nextEp.season_number - (nextEp.episode_number === 1 ? 1 : 0));
            const isSeasonTransition = nextEp.season_number !== currentSeason;
            
            if (isSeasonTransition) {
              console.log('📺 Season transition detected! Moving from S' + currentSeason + ' to S' + nextEp.season_number);
            }
            
            console.log('▶️ Auto-casting next episode:', {
              current: `S${currentSeason}E${window.__currentEpisode || '?'}`,
              next: `S${nextEp.season_number}E${nextEp.episode_number}`,
              title: nextEp.title,
              isSeasonTransition
            });
            
            // Store current season/episode for next transition
            window.__currentSeason = nextEp.season_number;
            window.__currentEpisode = nextEp.episode_number;
            
            fetch('/api/system/network-info')
              .then(res => res.json())
              .then(networkInfo => {
                const protocol = window.location.protocol;
                const host = `${networkInfo.network_ip}:${networkInfo.port}`;
                const nextUrl = `${protocol}//${host}/api/video/stream/${nextEp.id}`;
                const nextTitle = `S${nextEp.season_number}E${nextEp.episode_number} - ${nextEp.title}`;
                
                setTimeout(() => {
                  // Update currently casting episode ID
                  setCurrentlyCastingEpisodeId(nextEp.id);
                  // Reset trigger for the next episode so it can also auto-play
                  window.__autoPlayTriggered = nextEp.id;
                  castVideo(nextUrl, nextTitle, null, 0);
                }, 2000);
              })
              .catch(error => {
                console.error('❌ Error getting network info for next episode:', error);
                // Reset trigger on error so user can try again
                window.__autoPlayTriggered = null;
              });
          } else {
            console.log('ℹ️ No next episode found - series ended');
            // Clear trigger when series ends
            window.__autoPlayTriggered = null;
            window.__currentSeason = null;
            window.__currentEpisode = null;
          }
        })
        .catch(error => {
          console.error('❌ Error getting next episode:', error);
          // Reset trigger on error
          window.__autoPlayTriggered = null;
        });
      }
    }
  }, [casting, playbackInfo, type, videoId, currentlyCastingEpisodeId, castVideo]);

  // Auto-load media when cast session becomes active (but only on first connection)
  useEffect(() => {
    // Only auto-load if we just established a new session AND video is already open
    // Don't auto-load if user is casting from episode list
    if (casting && castSession && videoUrl && !window.__justCastFromList) {
      // Use current playback position from the player
      setTimeout(() => {
        castVideo(videoUrl, title, null, currentTime);
      }, 500);
    }
    
    // Clear the flag after a short delay
    if (window.__justCastFromList) {
      setTimeout(() => {
        window.__justCastFromList = false;
      }, 1000);
    }
  }, [casting, castSession, videoUrl, title, currentTime, castVideo]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e) => {
      switch (e.key) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          skipTime(-10);
          break;
        case 'ArrowRight':
          e.preventDefault();
          skipTime(10);
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolume(v => Math.min(1, v + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolume(v => Math.max(0, v - 0.1));
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'Escape':
          if (isFullscreen) {
            toggleFullscreen();
          } else {
            onClose();
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [isPlaying, currentTime, duration, volume, isFullscreen]);

  // Fullscreen change detection
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(
        document.fullscreenElement === containerRef.current ||
        document.webkitFullscreenElement === containerRef.current
      );
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Mouse move handler for showing controls
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleMouseMove = () => resetControlsTimeout();
    const handleMouseLeave = () => {
      if (isPlaying) setShowControls(false);
    };

    container.addEventListener('mousemove', handleMouseMove);
    container.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      container.removeEventListener('mousemove', handleMouseMove);
      container.removeEventListener('mouseleave', handleMouseLeave);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [isPlaying]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const bufferedProgress = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div 
      ref={containerRef}
      className={`video-player-container ${showControls ? 'show-controls' : ''}`}
      onMouseMove={resetControlsTimeout}
    >
      {/* Close button (always visible) */}
      <button className="video-close-btn" onClick={onClose} title="Close (Esc)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>

      {/* Video element */}
      {/* Video element - always rendered but source set conditionally */}
      <video
        ref={videoRef}
        className="video-element"
        onClick={togglePlayPause}
        autoPlay
        preload="auto"
        playsInline
        controls={false}
        style={{ display: videoUrl ? 'block' : 'none' }}
      >
        {videoUrl && <source src={videoUrl} type="video/mp4" />}
        Your browser does not support HTML5 video.
      </video>
      
      {!videoUrl && (
        <div className="video-loading">
          <div className="spinner"></div>
        </div>
      )}

      {/* Loading spinner */}
      {isLoading && (
        <div className="video-loading">
          <div className="spinner"></div>
        </div>
      )}

      {/* Center play/pause overlay */}
      {!isPlaying && !isLoading && (
        <div className="video-play-overlay" onClick={togglePlayPause}>
          <div className="play-icon">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className={`video-controls ${showControls ? 'visible' : ''}`}>
        {/* Title */}
        <div className="video-title">{title}</div>

        {/* Progress bar */}
        <div 
          ref={progressBarRef}
          className="progress-container"
          onClick={handleProgressClick}
          onMouseDown={() => setIsSeeking(true)}
          onMouseUp={() => setIsSeeking(false)}
          onMouseMove={handleProgressDrag}
          onMouseLeave={() => setIsSeeking(false)}
        >
          <div className="progress-bar">
            <div className="progress-buffered" style={{ width: `${bufferedProgress}%` }} />
            <div className="progress-filled" style={{ width: `${progress}%` }} />
            <div className="progress-handle" style={{ left: `${progress}%` }} />
          </div>
        </div>

        {/* Bottom controls */}
        <div className="controls-bottom">
          <div className="controls-left">
            {/* Play/Pause */}
            <button className="control-btn" onClick={togglePlayPause} title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
              {isPlaying ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1"/>
                  <rect x="14" y="4" width="4" height="16" rx="1"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              )}
            </button>

            {/* Skip back */}
            <button className="control-btn" onClick={() => skipTime(-10)} title="Back 10s (←)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                <text x="10" y="16" fontSize="6" fill="white" fontFamily="Arial" fontWeight="bold" textAnchor="middle">10</text>
              </svg>
            </button>

            {/* Skip forward */}
            <button className="control-btn" onClick={() => skipTime(10)} title="Forward 10s (→)">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
                <text x="14" y="16" fontSize="6" fill="white" fontFamily="Arial" fontWeight="bold" textAnchor="middle">10</text>
              </svg>
            </button>

            {/* Volume */}
            <div className="volume-control">
              <button className="control-btn" onClick={toggleMute} title={isMuted ? 'Unmute (M)' : 'Mute (M)'}>
                {isMuted || volume === 0 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <line x1="23" y1="9" x2="17" y2="15"/>
                    <line x1="17" y1="9" x2="23" y2="15"/>
                  </svg>
                ) : volume < 0.5 ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={handleVolumeChange}
                className="volume-slider"
              />
            </div>

            {/* Time */}
            <div className="time-display">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="controls-right">
            {/* Custom Cast Button */}
            {castAvailable && (
              <button 
                className={`control-btn cast-btn ${casting ? 'casting' : ''}`}
                style={{
                  background: casting ? 'rgba(26, 115, 232, 0.3)' : 'rgba(255, 255, 255, 0.2)',
                  border: casting ? '2px solid #1a73e8' : '2px solid rgba(255, 255, 255, 0.5)',
                  zIndex: 999999,
                  pointerEvents: 'auto',
                  position: 'relative'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  
                  if (casting) {
                    stopCasting();
                  } else if (videoUrl) {
                    castVideo(videoUrl, title, null, currentTime);
                  }
                }}
                title={casting ? 'Stop casting' : 'Cast to Chromecast'}
              >
                {casting ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm18-7H5v1.63c3.96 1.28 7.09 4.41 8.37 8.37H19V7zM1 10v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11zm20-7H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                  </svg>
                )}
              </button>
            )}

            {/* Fullscreen */}
            <button className="control-btn" onClick={toggleFullscreen} title={isFullscreen ? 'Exit fullscreen (F)' : 'Fullscreen (F)'}>
              {isFullscreen ? (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/>
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
