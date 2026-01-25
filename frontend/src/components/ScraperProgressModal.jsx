import { useState, useEffect } from 'react';

export default function ScraperProgressModal({ source, isOpen, onClose }) {
  const [urls, setUrls] = useState([]);
  const [scrapedUrls, setScrapedUrls] = useState(new Set());
  const [failedUrls, setFailedUrls] = useState(new Set());
  const [currentUrl, setCurrentUrl] = useState(null);
  const [stats, setStats] = useState({ found: 0, saved: 0, failed: 0 });
  const [phase, setPhase] = useState('loading'); // loading, scraping, complete

  useEffect(() => {
    if (!isOpen || !source) return;

    // Reset state when modal opens
    setUrls([]);
    setScrapedUrls(new Set());
    setFailedUrls(new Set());
    setCurrentUrl(null);
    setStats({ found: 0, saved: 0, failed: 0 });
    setPhase('loading');

    let reader = null;
    let isCancelled = false;

    const scrapeSource = async () => {
      try {
        setPhase('loading');
        
        // First, get the list of URLs from the feed
        const scanResponse = await fetch(`/api/scraper/scrape-source/${source.id}/scan`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        });
        const scanResult = await scanResponse.json();
        
        if (!scanResult.success) {
          alert(`Failed to scan source: ${scanResult.error}`);
          setPhase('complete');
          return;
        }

        const articleUrls = scanResult.urls || [];
        setUrls(articleUrls);
        setStats(prev => ({ ...prev, found: articleUrls.length }));
        setPhase('scraping');

        if (articleUrls.length === 0) {
          setPhase('complete');
          return;
        }

        // Now start the actual scraping with progress updates
        const response = await fetch(`/api/scraper/scrape-source/${source.id}/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (!isCancelled) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                
                if (data.type === 'urls') {
                  // URLs already loaded from scan, but update stats
                  setStats(prev => ({ ...prev, found: data.new_count + data.existing_count }));
                } else if (data.type === 'url') {
                  setCurrentUrl(data.url);
                } else if (data.type === 'scraped') {
                  setScrapedUrls(prev => new Set([...prev, data.url]));
                  setStats(prev => ({ ...prev, saved: prev.saved + 1 }));
                  setCurrentUrl(null);
                } else if (data.type === 'failed') {
                  setFailedUrls(prev => new Set([...prev, data.url]));
                  setStats(prev => ({ ...prev, failed: prev.failed + 1 }));
                  setCurrentUrl(null);
                } else if (data.type === 'complete') {
                  setPhase('complete');
                  setCurrentUrl(null);
                } else if (data.type === 'error') {
                  console.error('Scraping error:', data.message);
                  setPhase('complete');
                }
              } catch (e) {
                console.error('Error parsing SSE data:', e, line);
              }
            }
          }
        }
      } catch (error) {
        console.error('Scraping error:', error);
        setPhase('complete');
      }
    };

    scrapeSource();

    // Cleanup function
    return () => {
      isCancelled = true;
      if (reader) {
        reader.cancel();
      }
    };
  }, [isOpen, source]);

  if (!isOpen || !source) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#1a1a1a',
          borderRadius: '12px',
          padding: '24px',
          maxWidth: '800px',
          maxHeight: '80vh',
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ margin: 0, color: '#fff' }}>Scraping: {source.name}</h2>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#fff',
              fontSize: '24px',
              cursor: 'pointer',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        </div>

        {/* Stats */}
        <div style={{ 
          display: 'flex', 
          gap: '20px', 
          marginBottom: '20px',
          padding: '12px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '8px'
        }}>
          <div>
            <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)' }}>Found</div>
            <div style={{ fontSize: '1.2em', fontWeight: '600', color: '#fff' }}>{stats.found}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)' }}>Saved</div>
            <div style={{ fontSize: '1.2em', fontWeight: '600', color: '#10b981' }}>{stats.saved}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)' }}>Failed</div>
            <div style={{ fontSize: '1.2em', fontWeight: '600', color: '#ef4444' }}>{stats.failed}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.85em', color: 'rgba(255,255,255,0.6)' }}>Progress</div>
            <div style={{ fontSize: '1.2em', fontWeight: '600', color: '#fff' }}>
              {stats.found > 0 ? Math.round(((stats.saved + stats.failed) / stats.found) * 100) : 0}%
            </div>
          </div>
        </div>

        {/* URL List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '8px',
          padding: '12px',
          background: 'rgba(0,0,0,0.3)'
        }}>
          {phase === 'loading' && (
            <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '20px' }}>
              Loading URLs from feed...
            </div>
          )}
          
          {phase === 'scraping' && urls.length === 0 && (
            <div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center', padding: '20px' }}>
              No articles found in feed
            </div>
          )}

          {urls.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {urls.map((url, index) => {
                const isScraped = scrapedUrls.has(url);
                const isFailed = failedUrls.has(url);
                const isCurrent = currentUrl === url;

                return (
                  <div
                    key={index}
                    style={{
                      padding: '8px 12px',
                      background: isScraped 
                        ? 'rgba(16, 185, 129, 0.1)' 
                        : isFailed 
                        ? 'rgba(239, 68, 68, 0.1)' 
                        : isCurrent
                        ? 'rgba(59, 130, 246, 0.1)'
                        : 'rgba(255,255,255,0.03)',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      border: isCurrent ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent'
                    }}
                  >
                    <div style={{ 
                      width: '20px', 
                      height: '20px', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      flexShrink: 0
                    }}>
                      {isScraped ? (
                        <span style={{ color: '#10b981', fontSize: '18px' }}>✓</span>
                      ) : isFailed ? (
                        <span style={{ color: '#ef4444', fontSize: '18px' }}>✗</span>
                      ) : isCurrent ? (
                        <div style={{
                          width: '12px',
                          height: '12px',
                          border: '2px solid #3b82f6',
                          borderTop: '2px solid transparent',
                          borderRadius: '50%',
                          animation: 'spin 1s linear infinite'
                        }} />
                      ) : (
                        <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px' }}>○</span>
                      )}
                    </div>
                    <div style={{ 
                      flex: 1, 
                      fontSize: '0.85em', 
                      color: isScraped || isFailed ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
                      wordBreak: 'break-all'
                    }}>
                      {url}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {phase === 'complete' && (
            <div style={{ 
              marginTop: '16px', 
              padding: '12px', 
              background: 'rgba(16, 185, 129, 0.1)', 
              borderRadius: '8px',
              textAlign: 'center',
              color: '#10b981',
              fontWeight: '500'
            }}>
              ✓ Scraping complete! {stats.saved} articles saved
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            background: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.9em',
            fontWeight: '500'
          }}
        >
          {phase === 'complete' ? 'Close' : 'Close (scraping will continue)'}
        </button>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
