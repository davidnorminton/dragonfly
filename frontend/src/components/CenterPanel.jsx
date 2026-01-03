export function CenterPanel({ audioUrl, onAudioUrlChange }) {
  return (
    <div className="center-panel">
      <div className="news-container">
        <div className="news-header">
          <div className="news-title">News</div>
        </div>
        <div className="news-content">
          {/* News content will be added here */}
          <div className="news-placeholder">
            News feed will be displayed here
          </div>
        </div>
      </div>
      {audioUrl && (
        <div className="cyber-audio-player">
          <audio controls src={audioUrl} preload="none">
            Your browser does not support audio.
          </audio>
        </div>
      )}
    </div>
  );
}
