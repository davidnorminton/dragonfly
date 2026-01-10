import { useState, useEffect, useRef } from 'react';

export function CoverArtModal({ isOpen, onClose, directoryPath, scanData }) {
  const [currentItem, setCurrentItem] = useState('');
  const [progress, setProgress] = useState(0);
  const [totalItems, setTotalItems] = useState(0);
  const [downloadedItems, setDownloadedItems] = useState([]);
  const [errors, setErrors] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle, downloading, complete
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!isOpen || !directoryPath) {
      return;
    }

    // Reset state when modal opens
    setCurrentItem('');
    setProgress(0);
    setTotalItems(0);
    setDownloadedItems([]);
    setErrors([]);
    setPhase('idle');
    setSummary(null);
  }, [isOpen, directoryPath]);

  const startDownload = async () => {
    if (!directoryPath) {
      return;
    }

    setPhase('downloading');
    setTotalItems(scanData?.summary?.total_missing_artist + scanData?.summary?.total_missing_album || 0);

    try {
      const response = await fetch('/api/music/download-covers-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory_path: directoryPath })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read the stream manually
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                switch (data.type) {
                  case 'start':
                    setTotalItems(data.total);
                    setProgress(0);
                    break;
                  
                  case 'downloading':
                    setCurrentItem(data.item);
                    setProgress((data.current / data.total) * 100);
                    break;
                  
                  case 'downloaded':
                    setDownloadedItems(prev => [...prev, data.item]);
                    break;
                  
                  case 'error':
                    setErrors(prev => [...prev, { item: data.item, error: data.error }]);
                    break;
                  
                  case 'complete':
                    setPhase('complete');
                    setProgress(100);
                    setSummary({
                      downloaded: data.downloaded,
                      errors: data.errors
                    });
                    return;
                }
              } catch (err) {
                console.error('Error parsing SSE data:', err);
              }
            }
          }
        }
      };

      processStream().catch(err => {
        console.error('Stream processing error:', err);
        setErrors(prev => [...prev, { error: err.message }]);
        setPhase('complete');
      });
    } catch (err) {
      console.error('Error starting download:', err);
      setErrors(prev => [...prev, { error: err.message }]);
      setPhase('complete');
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="conversion-modal-overlay" onClick={onClose}>
      <div className="conversion-modal" onClick={(e) => e.stopPropagation()}>
        <div className="conversion-modal-header">
          <h2>Cover Art Scanner</h2>
          {phase === 'complete' && (
            <button className="conversion-modal-close" onClick={onClose}>✕</button>
          )}
        </div>

        <div className="conversion-modal-body">
          {phase === 'idle' && scanData && (
            <div className="conversion-scan-results">
              <div className="conversion-summary">
                <h3>Cover Art Scanner</h3>
                {scanData.is_artist_directory && (
                  <div style={{ 
                    background: 'rgba(59, 130, 246, 0.2)', 
                    border: '1px solid rgba(59, 130, 246, 0.4)',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    color: '#93c5fd'
                  }}>
                    🎤 Detected as artist directory: <strong>{scanData.missing_artist_covers[0]?.artist}</strong>
                  </div>
                )}
                <div className="conversion-stats">
                  <div className="conversion-stat">
                    <span className="stat-label">{scanData.is_artist_directory ? 'Artist:' : 'Artist Directories:'}</span>
                    <span className="stat-value">{scanData.summary.total_missing_artist}</span>
                  </div>
                  <div className="conversion-stat">
                    <span className="stat-label">Album Directories:</span>
                    <span className="stat-value">{scanData.summary.total_missing_album}</span>
                  </div>
                  <div className="conversion-stat">
                    <span className="stat-label">Total to Process:</span>
                    <span className="stat-value">{scanData.summary.total_missing_artist + scanData.summary.total_missing_album}</span>
                  </div>
                </div>
                <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.9em', marginTop: '12px' }}>
                  This will download cover art for all artist and album directories. Existing cover.jpg files will be replaced.
                </p>
              </div>

              <div className="conversion-file-lists">
                <div className="conversion-file-list">
                  <h4>Missing Artist Covers ({scanData.missing_artist_covers.length})</h4>
                  <div className="conversion-file-scroll">
                    {scanData.missing_artist_covers.map((item, idx) => (
                      <div key={idx} className="conversion-file-item">
                        🎤 {item.artist}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="conversion-file-list">
                  <h4>Missing Album Covers ({scanData.missing_album_covers.length})</h4>
                  <div className="conversion-file-scroll">
                    {scanData.missing_album_covers.map((item, idx) => (
                      <div key={idx} className="conversion-file-item">
                        💿 {item.artist} - {item.album}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button className="conversion-start-button" onClick={startDownload}>
                Download All Covers
              </button>
            </div>
          )}

          {phase === 'downloading' && (
            <div className="conversion-progress">
              <div className="conversion-progress-header">
                <h3>Downloading Cover Art</h3>
                <div className="conversion-progress-text">
                  {currentItem && <div className="current-file">{currentItem}</div>}
                  <div className="progress-percent">{Math.round(progress)}%</div>
                </div>
              </div>
              <div className="conversion-progress-bar-container">
                <div className="conversion-progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              {totalItems > 0 && (
                <div className="conversion-progress-info">
                  <div>Downloaded: {downloadedItems.length} / {totalItems}</div>
                  {errors.length > 0 && (
                    <div style={{ color: '#ff6b6b', marginTop: '8px' }}>Errors: {errors.length}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'complete' && (
            <div className="conversion-complete">
              <div className="conversion-success-icon">✅</div>
              <h3>Download Complete!</h3>
              {summary && (
                <div className="conversion-final-summary">
                  <div className="conversion-summary-item">
                    <span className="summary-label">Downloaded:</span>
                    <span className="summary-value">{summary.downloaded} covers</span>
                  </div>
                  {summary.errors > 0 && (
                    <div className="conversion-summary-item error">
                      <span className="summary-label">Errors:</span>
                      <span className="summary-value">{summary.errors}</span>
                    </div>
                  )}
                </div>
              )}

              {downloadedItems.length > 0 && (
                <div className="conversion-results-section">
                  <h4>Downloaded Covers ({downloadedItems.length})</h4>
                  <div className="conversion-file-scroll">
                    {downloadedItems.slice(0, 20).map((item, idx) => (
                      <div key={idx} className="conversion-file-item success">✓ {item}</div>
                    ))}
                    {downloadedItems.length > 20 && (
                      <div className="conversion-file-item">... and {downloadedItems.length - 20} more</div>
                    )}
                  </div>
                </div>
              )}

              {errors.length > 0 && (
                <div className="conversion-results-section">
                  <h4>Errors ({errors.length})</h4>
                  <div className="conversion-file-scroll">
                    {errors.map((err, idx) => (
                      <div key={idx} className="conversion-file-item error">
                        ❌ {err.item || 'Unknown'}: {err.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
