import { useState, useEffect, useRef } from 'react';

export function ConversionProgressModal({ isOpen, onClose, directoryPath, scanData }) {
  const [currentFile, setCurrentFile] = useState('');
  const [progress, setProgress] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [convertedFiles, setConvertedFiles] = useState([]);
  const [deletedFiles, setDeletedFiles] = useState([]);
  const [errors, setErrors] = useState([]);
  const [phase, setPhase] = useState('idle'); // idle, converting, cleanup, complete
  const [summary, setSummary] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!isOpen || !directoryPath) {
      return;
    }

    // Reset state when modal opens
    setCurrentFile('');
    setProgress(0);
    setTotalFiles(0);
    setConvertedFiles([]);
    setDeletedFiles([]);
    setErrors([]);
    setPhase('idle');
    setSummary(null);

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [isOpen, directoryPath]);

  const startConversion = async () => {
    if (!directoryPath) {
      return;
    }

    setPhase('converting');
    setTotalFiles(scanData?.summary?.total_to_convert || 0);

    try {
      // Use fetch with POST and read the stream manually
      const response = await fetch('/api/music/convert-and-cleanup-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ directory_path: directoryPath })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Read the stream manually since EventSource doesn't support POST
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
                    setTotalFiles(data.total_files);
                    setProgress(0);
                    break;
                  
                  case 'converting':
                    setCurrentFile(data.file);
                    setProgress((data.current / data.total) * 50);
                    break;
                  
                  case 'converted':
                    setConvertedFiles(prev => [...prev, data.file]);
                    break;
                  
                  case 'cleanup_start':
                    setPhase('cleanup');
                    setCurrentFile('Cleaning up files...');
                    break;
                  
                  case 'deleted':
                    setDeletedFiles(prev => [...prev, { file: data.file, reason: data.reason }]);
                    const totalToDelete = scanData?.summary?.total_to_delete || 0;
                    const deleteProgress = totalToDelete > 0 ? (data.count / totalToDelete) * 50 : 0;
                    setProgress(50 + deleteProgress);
                    break;
                  
                  case 'error':
                    setErrors(prev => [...prev, { file: data.file, error: data.error }]);
                    break;
                  
                  case 'complete':
                    setPhase('complete');
                    setProgress(100);
                    setSummary({
                      converted: data.converted,
                      deleted: data.deleted,
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
      console.error('Error starting conversion:', err);
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
          <h2>Music File Conversion</h2>
          {phase === 'complete' && (
            <button className="conversion-modal-close" onClick={onClose}>✕</button>
          )}
        </div>

        <div className="conversion-modal-body">
          {phase === 'idle' && scanData && (
            <div className="conversion-scan-results">
              <div className="conversion-summary">
                <h3>Files to Process</h3>
                <div className="conversion-stats">
                  <div className="conversion-stat">
                    <span className="stat-label">To Convert:</span>
                    <span className="stat-value">{scanData.summary.total_to_convert} FLAC files</span>
                  </div>
                  <div className="conversion-stat">
                    <span className="stat-label">To Delete:</span>
                    <span className="stat-value">{scanData.summary.total_to_delete} files</span>
                  </div>
                  <div className="conversion-stat">
                    <span className="stat-label">Directories:</span>
                    <span className="stat-value">{scanData.summary.total_directories}</span>
                  </div>
                </div>
              </div>

              <div className="conversion-file-lists">
                <div className="conversion-file-list">
                  <h4>Files to Convert ({scanData.files_to_convert.length})</h4>
                  <div className="conversion-file-scroll">
                    {Object.entries(scanData.directories).map(([dir, files]) => (
                      <div key={dir} className="conversion-directory-group">
                        <div className="conversion-directory-name">{dir === '.' ? 'Root' : dir}</div>
                        {files.convert.map((file, idx) => (
                          <div key={idx} className="conversion-file-item">
                            📄 {file.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="conversion-file-list">
                  <h4>Files to Delete ({scanData.files_to_delete.length})</h4>
                  <div className="conversion-file-scroll">
                    {Object.entries(scanData.directories).map(([dir, files]) => (
                      <div key={dir} className="conversion-directory-group">
                        <div className="conversion-directory-name">{dir === '.' ? 'Root' : dir}</div>
                        {files.delete.map((file, idx) => (
                          <div key={idx} className="conversion-file-item">
                            🗑️ {file.name} <span className="file-reason">({file.reason})</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <button className="conversion-start-button" onClick={startConversion}>
                Start Conversion
              </button>
            </div>
          )}

          {(phase === 'converting' || phase === 'cleanup') && (
            <div className="conversion-progress">
              <div className="conversion-progress-header">
                <h3>{phase === 'converting' ? 'Converting Files' : 'Cleaning Up Files'}</h3>
                <div className="conversion-progress-text">
                  {currentFile && <div className="current-file">{currentFile}</div>}
                  <div className="progress-percent">{Math.round(progress)}%</div>
                </div>
              </div>
              <div className="conversion-progress-bar-container">
                <div className="conversion-progress-bar" style={{ width: `${progress}%` }}></div>
              </div>
              {totalFiles > 0 && (
                <div className="conversion-progress-info">
                  {phase === 'converting' && (
                    <div>Converted: {convertedFiles.length} / {totalFiles}</div>
                  )}
                  {phase === 'cleanup' && (
                    <div>Deleted: {deletedFiles.length} files</div>
                  )}
                </div>
              )}
            </div>
          )}

          {phase === 'complete' && (
            <div className="conversion-complete">
              <div className="conversion-success-icon">✅</div>
              <h3>Conversion Complete!</h3>
              {summary && (
                <div className="conversion-final-summary">
                  <div className="conversion-summary-item">
                    <span className="summary-label">Converted:</span>
                    <span className="summary-value">{summary.converted} files</span>
                  </div>
                  <div className="conversion-summary-item">
                    <span className="summary-label">Deleted:</span>
                    <span className="summary-value">{summary.deleted} files</span>
                  </div>
                  {summary.errors > 0 && (
                    <div className="conversion-summary-item error">
                      <span className="summary-label">Errors:</span>
                      <span className="summary-value">{summary.errors}</span>
                    </div>
                  )}
                </div>
              )}

              {convertedFiles.length > 0 && (
                <div className="conversion-results-section">
                  <h4>Converted Files ({convertedFiles.length})</h4>
                  <div className="conversion-file-scroll">
                    {convertedFiles.slice(0, 20).map((file, idx) => (
                      <div key={idx} className="conversion-file-item success">✓ {file}</div>
                    ))}
                    {convertedFiles.length > 20 && (
                      <div className="conversion-file-item">... and {convertedFiles.length - 20} more</div>
                    )}
                  </div>
                </div>
              )}

              {deletedFiles.length > 0 && (
                <div className="conversion-results-section">
                  <h4>Deleted Files ({deletedFiles.length})</h4>
                  <div className="conversion-file-scroll">
                    {deletedFiles.slice(0, 20).map((file, idx) => (
                      <div key={idx} className="conversion-file-item deleted">
                        🗑️ {file.file} <span className="file-reason">({file.reason})</span>
                      </div>
                    ))}
                    {deletedFiles.length > 20 && (
                      <div className="conversion-file-item">... and {deletedFiles.length - 20} more</div>
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
                        ❌ {err.file || 'Unknown'}: {err.error}
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
