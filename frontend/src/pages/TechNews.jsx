import { useState, useEffect } from 'react';

export default function TechNews() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [message, setMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadingArticle, setLoadingArticle] = useState(false);

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scraper/articles?limit=200');
      const result = await response.json();
      if (result.success) {
        setArticles(result.articles || []);
        setDebugInfo({
          total: result.total,
          loaded: result.articles?.length || 0,
          timestamp: new Date().toISOString()
        });
      } else {
        setMessage(`Error loading articles: ${result.error}`);
      }
    } catch (err) {
      setMessage(`Failed to load articles: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const runScraper = async () => {
    setScraping(true);
    setMessage('');
    setDebugInfo(null);
    
    try {
      const response = await fetch('/api/scraper/run', { method: 'POST' });
      const result = await response.json();
      
      if (result.success) {
        setMessage(`✓ ${result.message}`);
        setDebugInfo({
          sources_scraped: result.results?.sources_scraped,
          articles_found: result.results?.articles_found,
          articles_saved: result.results?.articles_saved,
          errors: result.results?.errors,
          timestamp: new Date().toISOString()
        });
        
        // Reload articles after scraping
        setTimeout(() => loadArticles(), 1000);
      } else {
        setMessage(`✗ ${result.error || 'Scraping failed'}`);
      }
    } catch (err) {
      setMessage(`✗ Error: ${err.message}`);
    } finally {
      setScraping(false);
    }
  };

  const loadArticleDetails = async (articleId) => {
    setLoadingArticle(true);
    try {
      const response = await fetch(`/api/scraper/articles/${articleId}`);
      const result = await response.json();
      
      if (result.success) {
        setSelectedArticle(result.article);
      } else {
        setMessage(`Error loading article: ${result.error}`);
      }
    } catch (err) {
      setMessage(`Failed to load article: ${err.message}`);
    } finally {
      setLoadingArticle(false);
    }
  };

  const getFaviconUrl = (url) => {
    try {
      const domain = new URL(url).hostname;
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
    } catch {
      return null;
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>Tech News</h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={runScraper}
            disabled={scraping}
            className="save-button"
          >
            {scraping ? 'Scraping...' : '▶ Run Scraper'}
          </button>
          <button
            onClick={loadArticles}
            disabled={loading}
            className="save-button secondary"
          >
            {loading ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>
      </div>

      {message && (
        <div style={{
          padding: '12px 16px',
          marginBottom: '20px',
          background: message.startsWith('✓') ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${message.startsWith('✓') ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          borderRadius: '8px',
          color: message.startsWith('✓') ? '#22c55e' : '#ef4444'
        }}>
          {message}
        </div>
      )}

      {debugInfo && (
        <div style={{
          padding: '16px',
          marginBottom: '20px',
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          borderRadius: '8px',
          fontFamily: 'monospace',
          fontSize: '0.85em'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>Debug Info:</div>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      )}

      <div style={{
        display: 'flex',
        gap: '20px',
        height: 'calc(100vh - 200px)',
        overflow: 'hidden'
      }}>
        {/* Left Pane - Article List */}
        <div style={{
          width: '400px',
          flexShrink: 0,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            padding: '16px',
            borderBottom: '1px solid rgba(255,255,255,0.1)',
            fontWeight: '600',
            color: '#fff'
          }}>
            Articles ({articles.length})
          </div>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden'
          }}>
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.5)' }}>
                Loading articles...
              </div>
            ) : articles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.5)' }}>
                <p>No articles scraped yet.</p>
                <p style={{ fontSize: '0.9em', marginTop: '8px' }}>
                  Configure sources in Settings → Web Scraper, then click "Run Scraper" above.
                </p>
              </div>
            ) : (
              articles.map((article) => (
                <div
                  key={article.id}
                  style={{
                    padding: '16px',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    cursor: 'pointer',
                    background: selectedArticle?.id === article.id ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => loadArticleDetails(article.id)}
                  onMouseEnter={(e) => {
                    if (selectedArticle?.id !== article.id) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedArticle?.id !== article.id) {
                      e.currentTarget.style.background = 'transparent';
                    }
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    marginBottom: '8px'
                  }}>
                    {getFaviconUrl(article.url) && (
                      <img
                        src={getFaviconUrl(article.url)}
                        alt=""
                        style={{
                          width: '16px',
                          height: '16px',
                          flexShrink: 0,
                          marginTop: '2px',
                          opacity: 0.7
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    )}
                    <h4 style={{
                      margin: 0,
                      fontSize: '0.95em',
                      fontWeight: '600',
                      color: '#fff',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                      flex: 1
                    }}>
                      {article.title || 'Untitled Article'}
                    </h4>
                  </div>
                  {article.summary && (
                    <p style={{
                      margin: '0 0 8px 0',
                      fontSize: '0.8em',
                      color: 'rgba(255,255,255,0.5)',
                      lineHeight: '1.4',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {article.summary}
                    </p>
                  )}
                  <div style={{
                    fontSize: '0.75em',
                    color: 'rgba(255,255,255,0.4)'
                  }}>
                    {article.published_date
                      ? new Date(article.published_date).toLocaleDateString()
                      : new Date(article.scraped_at).toLocaleDateString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Pane - Article Content */}
        <div style={{
          flex: 1,
          background: 'rgba(255,255,255,0.03)',
          borderRadius: '12px',
          border: '1px solid rgba(255,255,255,0.1)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {loadingArticle ? (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: 'rgba(255,255,255,0.5)'
            }}>
              Loading article...
            </div>
          ) : selectedArticle ? (
            <>
              {/* Article Header */}
              <div style={{
                padding: '24px',
                borderBottom: '1px solid rgba(255,255,255,0.1)'
              }}>
                <h2 style={{
                  margin: '0 0 12px 0',
                  fontSize: '1.8em',
                  fontWeight: '600',
                  color: '#fff',
                  lineHeight: '1.3'
                }}>
                  {selectedArticle.title || 'Untitled'}
                </h2>
                <div style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'center',
                  fontSize: '0.9em',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '12px'
                }}>
                  {selectedArticle.author && <span>By {selectedArticle.author}</span>}
                  {selectedArticle.published_date && (
                    <span>{new Date(selectedArticle.published_date).toLocaleDateString()}</span>
                  )}
                </div>
                <a
                  href={selectedArticle.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: '#3b82f6',
                    textDecoration: 'none',
                    fontSize: '0.85em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  View Original Article →
                </a>
              </div>

              {/* Article Content */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '24px'
              }}>
                {selectedArticle.image_url && (
                  <img
                    src={selectedArticle.image_url}
                    alt={selectedArticle.title}
                    style={{
                      width: '100%',
                      maxHeight: '400px',
                      objectFit: 'cover',
                      borderRadius: '8px',
                      marginBottom: '24px'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
                {selectedArticle.summary && (
                  <div style={{
                    padding: '16px',
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '8px',
                    marginBottom: '24px',
                    fontSize: '0.95em',
                    lineHeight: '1.6',
                    color: 'rgba(255,255,255,0.8)'
                  }}>
                    <strong style={{ color: '#fff' }}>Summary:</strong> {selectedArticle.summary}
                  </div>
                )}
                <div style={{
                  fontSize: '1em',
                  lineHeight: '1.8',
                  color: 'rgba(255,255,255,0.9)',
                  whiteSpace: 'pre-wrap',
                  wordWrap: 'break-word'
                }}>
                  {selectedArticle.content || 'No content available'}
                </div>
              </div>
            </>
          ) : (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              height: '100%',
              color: 'rgba(255,255,255,0.5)',
              textAlign: 'center',
              padding: '40px'
            }}>
              <div>
                <p style={{ fontSize: '1.2em', marginBottom: '8px' }}>Select an article to read</p>
                <p style={{ fontSize: '0.9em' }}>Click on any article from the list on the left</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
