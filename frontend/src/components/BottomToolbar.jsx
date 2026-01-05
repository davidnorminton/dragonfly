export function BottomToolbar({ sessionId, audioQueue, onMicClick, hideMic = false, hideControls = false }) {
  const {
    currentIndex,
    isPlaying,
    isPaused,
    isGenerating,
    currentTime,
    duration,
    startQueue,
    stopQueue,
    pauseQueue,
    seekTo,
    queueLength,
  } = audioQueue;

  const formatTime = (seconds) => {
    if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      pauseQueue();
    } else {
      startQueue();
    }
  };

  const handleProgressClick = (e) => {
    if (!duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    const newTime = percent * duration;
    seekTo(newTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="bottom-toolbar">
      {!hideControls && (
        <div className="toolbar-progress-wrapper">
          <div 
            className="toolbar-progress-bar"
            onClick={handleProgressClick}
          >
            <div 
              className="toolbar-progress-fill"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      )}
      <div className="toolbar-content">
        {!hideControls && (
          <div className="toolbar-controls">
            <button
              className="toolbar-button stop-button"
              onClick={stopQueue}
              disabled={!isPlaying && !isPaused}
              title="Stop"
            >
              ⏹
            </button>
            <button
              className="toolbar-button play-button"
              onClick={handlePlayPause}
              disabled={queueLength === 0 || isGenerating}
              title={isPlaying ? 'Pause' : 'Play queue'}
            >
              {isGenerating ? (
                <span className="loading-spinner">⏳</span>
              ) : isPlaying ? (
                '⏸'
              ) : (
                '▶'
              )}
            </button>
          </div>
        )}
        {!hideMic && (
          <div className="toolbar-center">
            <button
              className="toolbar-button mic-button"
              title="AI mic mode"
              aria-label="AI mic mode"
              onClick={onMicClick}
            >
              <span className="mic-icon-svg" aria-hidden="true">
                <svg viewBox="0 0 64 64" role="presentation">
                  <circle cx="32" cy="32" r="30" fill="#0a0a0f" stroke="#16c782" strokeWidth="4" />
                  <rect x="26" y="18" width="12" height="22" rx="6" fill="#ffffff" />
                  <rect x="24" y="38" width="16" height="4" rx="2" fill="#16c782" />
                  <line x1="32" y1="42" x2="32" y2="50" stroke="#16c782" strokeWidth="4" strokeLinecap="round" />
                  <line x1="22" y1="50" x2="42" y2="50" stroke="#16c782" strokeWidth="4" strokeLinecap="round" />
                </svg>
              </span>
            </button>
          </div>
        )}
        {!hideControls && (
          <div className="toolbar-info">
            <div className="toolbar-time">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
            {isGenerating && <span className="toolbar-status">Generating audio...</span>}
            {isPlaying && <span className="toolbar-status">Playing...</span>}
            {queueLength > 0 && currentIndex >= 0 && (
              <span className="toolbar-status">
                {currentIndex + 1} of {queueLength} in queue
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
