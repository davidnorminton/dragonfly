import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for Google Cast integration
 */
export const useChromecast = () => {
  const [castAvailable, setCastAvailable] = useState(true); // Always show cast button
  const [casting, setCasting] = useState(false);
  const [castSession, setCastSession] = useState(null);
  const [currentMedia, setCurrentMedia] = useState(null);
  const [playbackInfo, setPlaybackInfo] = useState(null);
  const [savedDeviceId, setSavedDeviceId] = useState(null);

  // Load saved cast device from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('chromecast_device_id');
    if (saved) {
      setSavedDeviceId(saved);
      console.log('📱 Loaded saved cast device:', saved);
    }
  }, []);

  useEffect(() => {
    let initAttempts = 0;
    const maxAttempts = 30;

    const initializeCast = () => {
      initAttempts++;
      
      if (initAttempts > maxAttempts) {
        console.error('Cast SDK failed to load');
        return;
      }

      if (!window.chrome?.cast || !window.cast?.framework) {
        setTimeout(initializeCast, 1000);
        return;
      }

      try {
        const castContext = window.cast.framework.CastContext.getInstance();
        
        castContext.setOptions({
          receiverApplicationId: window.chrome.cast.media.DEFAULT_MEDIA_RECEIVER_APP_ID,
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED,
          resumeSavedSession: true // Resume previous session if available
        });

        // Always show cast button once SDK is initialized
        setCastAvailable(true);
        
        castContext.addEventListener(
          window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          (event) => {
            // Keep button available regardless of device detection
            // The Cast SDK will show device picker when clicked
            console.log('📡 Cast state changed:', event.castState);
          }
        );

      // Listen for ALL session state changes with detailed logging
      castContext.addEventListener(
        window.cast.framework.CastContextEventType.SESSION_STATE_CHANGED,
        (event) => {
          console.log('🔍 Event object:', event);
          console.log('🔍 Session State:', event.sessionState);
          console.log('🔍 Error Code:', event.errorCode);
          
          const session = castContext.getCurrentSession();
          console.log('🔍 Current Session:', session);
          
          setCastSession(session);
          setCasting(!!session);
          
          // Handle different session states
          switch(event.sessionState) {
            case window.cast.framework.SessionState.SESSION_STARTING:
              console.log('📡 SESSION_STARTING - Connecting to Chromecast...');
              break;
            case window.cast.framework.SessionState.SESSION_STARTED:
              console.log('✅ SESSION_STARTED - Connected to Chromecast!');
              console.log('✅ Session details:', {
                sessionId: session?.getSessionId(),
                receiver: session?.getCastDevice()?.friendlyName
              });
              // Save device ID when session starts
              if (session) {
                const device = session.getCastDevice();
                if (device) {
                  const deviceId = device.deviceId || device.friendlyName;
                  localStorage.setItem('chromecast_device_id', deviceId);
                  setSavedDeviceId(deviceId);
                  console.log('💾 Auto-saved cast device:', deviceId, device.friendlyName);
                }
              }
              break;
            case window.cast.framework.SessionState.SESSION_START_FAILED:
              console.error('❌ SESSION_START_FAILED - Could not connect');
              console.error('❌ Error code:', event.errorCode);
              break;
            case window.cast.framework.SessionState.SESSION_ENDING:
              console.log('🔌 SESSION_ENDING - Disconnecting...');
              break;
            case window.cast.framework.SessionState.SESSION_ENDED:
              console.log('🛑 SESSION_ENDED - Disconnected from Chromecast');
              break;
            case window.cast.framework.SessionState.SESSION_RESUMED:
              console.log('🔄 SESSION_RESUMED - Reconnected to existing session');
              break;
            default:
              console.log('❓ Unknown session state:', event.sessionState);
          }
        }
      );
      console.log('✅ SESSION_STATE_CHANGED listener attached');
      

        const initialSession = castContext.getCurrentSession();
        if (initialSession) {
          setCastSession(initialSession);
          setCasting(true);
        }

        setCastAvailable(true);
      } catch (error) {
        console.error('Error initializing Cast SDK:', error);
      }
    };

    if (window.chrome?.cast && window.cast?.framework) {
      initializeCast();
    } else {
      window.__onGCastApiAvailable = (isAvailable) => {
        if (isAvailable) {
          initializeCast();
        }
      };
    }
  }, []);

  const castVideo = useCallback((videoUrl, title, posterUrl = null, currentTime = 0, deviceId = null) => {
    if (!window.cast?.framework) return;

    const castContext = window.cast.framework.CastContext.getInstance();
    const session = castContext.getCurrentSession();

    if (!session) {
      // Request a new session (will show device selection dialog)
      // The SDK will auto-reconnect to saved session if available due to autoJoinPolicy
      castContext.requestSession().then(() => {
        const newSession = castContext.getCurrentSession();
        if (newSession) {
          // Save the device ID for future use
          const device = newSession.getCastDevice();
          if (device) {
            const deviceId = device.deviceId || device.friendlyName;
            localStorage.setItem('chromecast_device_id', deviceId);
            setSavedDeviceId(deviceId);
            console.log('💾 Saved cast device:', deviceId, device.friendlyName);
          }
          loadMedia(newSession, videoUrl, title, posterUrl, currentTime);
        }
      }).catch((error) => {
        console.error('Failed to start Cast session:', error.code);
      });
    } else {
      // Session already exists, just load media
      loadMedia(session, videoUrl, title, posterUrl, currentTime);
    }
  }, [savedDeviceId]);

  const loadMedia = (session, videoUrl, title, posterUrl, currentTime) => {
    try {
      const mediaInfo = new window.chrome.cast.media.MediaInfo(videoUrl, 'video/mp4');
      
      mediaInfo.metadata = new window.chrome.cast.media.GenericMediaMetadata();
      mediaInfo.metadata.title = title;
      
      if (posterUrl) {
        mediaInfo.metadata.images = [new window.chrome.cast.Image(posterUrl)];
      }

      const request = new window.chrome.cast.media.LoadRequest(mediaInfo);
      request.currentTime = currentTime;
      request.autoplay = true;

      session.loadMedia(request).then(
        (media) => {
          console.log('✅ Casting to Chromecast');
          
          // Listen for media events
          if (media) {
            // Store media reference for updates
            window.__currentCastMedia = media;
            
            // Listen for playback completion and status changes
            media.addUpdateListener((isAlive) => {
              if (!isAlive) return;
              
              const playerState = media.playerState;
              const currentTime = media.getEstimatedTime();
              const duration = media.media?.duration;
              const session = window.cast.framework.CastContext.getInstance().getCurrentSession();
              const volume = session?.getVolume()?.level ?? 1;
              
              // Better end detection: episode ended if IDLE state after playing
              // or if we're very close to the end (within 1 second)
              const isAtEnd = duration && currentTime > 0 && (duration - currentTime) <= 1;
              const hasEnded = (playerState === 'IDLE' && currentTime > 10) || 
                              (playerState === 'IDLE' && isAtEnd) ||
                              (isAtEnd && playerState !== 'PLAYING');
              
              // Store current playback info
              window.__currentPlaybackInfo = {
                currentTime,
                duration,
                playerState,
                volume,
                isIdle: playerState === 'IDLE',
                hasEnded: hasEnded,
                isAtEnd: isAtEnd
              };
              
              // Log when episode is ending or has ended
              if (hasEnded || isAtEnd) {
                console.log('🎬 Episode ending/ended:', { 
                  playerState, 
                  currentTime: Math.floor(currentTime), 
                  duration: Math.floor(duration),
                  remaining: duration ? Math.floor(duration - currentTime) : 0,
                  hasEnded,
                  isAtEnd
                });
              }
            });
            
            // Also listen for media status changes
            const mediaStatusListener = (event) => {
              const playerState = event.playerState;
              if (playerState === 'IDLE' && window.__currentPlaybackInfo) {
                const { currentTime, duration } = window.__currentPlaybackInfo;
                if (currentTime > 10 && duration && currentTime >= duration - 1) {
                  window.__currentPlaybackInfo.hasEnded = true;
                  console.log('🎬 Media status: Episode ended (IDLE at end)');
                }
              }
            };
            
            // Add status listener if available
            if (media.addMediaStatusListener) {
              media.addMediaStatusListener(mediaStatusListener);
            }
          }
        },
        (error) => console.error('Failed to cast:', error.code)
      );
    } catch (error) {
      console.error('Error loading media:', error);
    }
  };

  const stopCasting = useCallback(() => {
    if (!window.cast?.framework) return;

    const castContext = window.cast.framework.CastContext.getInstance();
    const session = castContext.getCurrentSession();
    
    if (session) {
      session.endSession(true);
      console.log('⏹️ Cast session ended');
    }
  }, []);

  // Control functions for casting
  const playCast = useCallback(() => {
    if (!window.__currentCastMedia) return;
    const media = window.__currentCastMedia;
    if (media.playerState === 'PAUSED') {
      media.play();
      console.log('▶️ Cast play');
    }
  }, []);

  const pauseCast = useCallback(() => {
    if (!window.__currentCastMedia) return;
    const media = window.__currentCastMedia;
    if (media.playerState === 'PLAYING') {
      media.pause();
      console.log('⏸️ Cast pause');
    }
  }, []);

  const seekCast = useCallback((timeInSeconds) => {
    if (!window.__currentCastMedia) return;
    const media = window.__currentCastMedia;
    const seekRequest = new window.chrome.cast.media.SeekRequest();
    seekRequest.currentTime = timeInSeconds;
    media.seek(seekRequest);
    console.log('⏩ Cast seek to:', timeInSeconds);
  }, []);

  const setCastVolume = useCallback((volume) => {
    if (!castSession) return;
    const volumeRequest = new window.chrome.cast.VolumeRequest();
    volumeRequest.volume = Math.max(0, Math.min(1, volume));
    castSession.setVolume(volumeRequest);
    console.log('🔊 Cast volume set to:', volumeRequest.volume);
  }, [castSession]);

  // Poll for playback info updates
  useEffect(() => {
    if (!casting) return;
    
    const interval = setInterval(() => {
      if (window.__currentPlaybackInfo) {
        setPlaybackInfo(window.__currentPlaybackInfo);
      }
      if (window.__currentCastMedia) {
        setCurrentMedia(window.__currentCastMedia);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [casting]);

  return {
    castAvailable,
    casting,
    castSession,
    currentMedia,
    playbackInfo,
    castVideo,
    stopCasting,
    playCast,
    pauseCast,
    seekCast,
    setCastVolume,
    savedDeviceId
  };
};

export default useChromecast;
