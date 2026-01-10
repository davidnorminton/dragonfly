import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for Google Cast integration
 */
export const useChromecast = () => {
  const [castAvailable, setCastAvailable] = useState(false);
  const [casting, setCasting] = useState(false);
  const [castSession, setCastSession] = useState(null);
  const [currentMedia, setCurrentMedia] = useState(null);
  const [playbackInfo, setPlaybackInfo] = useState(null);

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
          autoJoinPolicy: window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED
        });

        castContext.addEventListener(
          window.cast.framework.CastContextEventType.CAST_STATE_CHANGED,
          (event) => {
            const isAvailable = event.castState !== window.cast.framework.CastState.NO_DEVICES_AVAILABLE;
            setCastAvailable(isAvailable);
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

  const castVideo = useCallback((videoUrl, title, posterUrl = null, currentTime = 0) => {
    if (!window.cast?.framework) return;

    const castContext = window.cast.framework.CastContext.getInstance();
    const session = castContext.getCurrentSession();

    if (!session) {
      castContext.requestSession().then(() => {
        const newSession = castContext.getCurrentSession();
        if (newSession) {
          loadMedia(newSession, videoUrl, title, posterUrl, currentTime);
        }
      }).catch((error) => {
        console.error('Failed to start Cast session:', error.code);
      });
    } else {
      loadMedia(session, videoUrl, title, posterUrl, currentTime);
    }
  }, []);

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
            
            // Listen for playback completion
            media.addUpdateListener((isAlive) => {
              if (!isAlive) return;
              
              const playerState = media.playerState;
              const currentTime = media.getEstimatedTime();
              const duration = media.media?.duration;
              
              // Store current playback info
              window.__currentPlaybackInfo = {
                currentTime,
                duration,
                playerState,
                isIdle: playerState === 'IDLE',
                hasEnded: currentTime > 0 && duration && currentTime >= duration - 2
              };
              
              // Log when episode is ending or has ended
              if (playerState === 'IDLE' || (currentTime && duration && currentTime >= duration - 2)) {
                console.log('🎬 Episode ending/ended:', { 
                  playerState, 
                  currentTime: Math.floor(currentTime), 
                  duration: Math.floor(duration),
                  remaining: duration ? Math.floor(duration - currentTime) : 0
                });
              }
            });
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
    stopCasting
  };
};

export default useChromecast;
