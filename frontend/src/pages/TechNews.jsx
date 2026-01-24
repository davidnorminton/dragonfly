import { useState, useEffect } from 'react';

export default function TechNews() {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [message, setMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);

  useEffect(() => {
    loadArticles();
  }, []);

  const loadArticles = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scraper/articles?limit=50');
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

  const viewArticle = async (articleId) => {
    try {
      const response = await fetch(`/api/scraper/articles/${articleId}`);
      const result = await response.json();
      
      if (result.success) {
        // Open article in new window
        const article = result.article;
        const win = window.open('', '_blank');
        win.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>${article.title || 'Article'}</title>
              <style>
                body {
                  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                  max-width: 800px;
                  margin: 40px auto;
                  padding: 20px;
                  background: #f5f5f5;
                  color: #333;
                }
                h1 { margin-bottom: 10px; }
                .meta {
                  color: #666;
                  font-size: 0.9em;
                  margin-bottom: 20px;
                  border-bottom: 1px solid #ddd;
                  padding-bottom: 10px;
                }
                .content {
                  background: white;
                  padding: 30px;
                  border-radius: 8px;
                  line-height: 1.6;
                  white-space: pre-wrap;
                }
                img {
                  max-width: 100%;
                  height: auto;
                  border-radius: 8px;
                  margin: 20px 0;
                }
                a { color: #0066cc; }
              </style>
            </head>
            <body>
              <h1>${article.title || 'Untitled'}</h1>
              <div class="meta">
                ${article.author ? `By ${article.author} • ` : ''}
                ${article.published_date ? new Date(article.published_date).toLocaleDateString() : 'Unknown date'}
                <br>
                <a href="${article.url}" target="_blank">View Original</a>
              </div>
              ${article.image_url ? `<img src="${article.image_url}" alt="Article image">` : ''}
              ${article.summary ? `<p><strong>Summary:</strong> ${article.summary}</p>` : ''}
              <div class="content">${article.content || 'No content available'}</div>
            </body>
          </html>
        `);
        win.document.close();
      }
    } catch (err) {
      alert(`Error loading article: ${err.message}`);
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

      <div className="content-container">
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
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: '20px'
          }}>
            {articles.map((article) => (
              <div
                key={article.id}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  overflow: 'hidden',
                  cursor: 'pointer',
                  transition: 'transform 0.2s, background 0.2s',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
                onClick={() => viewArticle(article.id)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
              >
                {article.image_url && (
                  <img
                    src={article.image_url}
                    alt={article.title}
                    style={{
                      width: '100%',
                      height: '180px',
                      objectFit: 'cover'
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
                <div style={{ padding: '16px' }}>
                  <h3 style={{
                    margin: '0 0 8px 0',
                    fontSize: '1.1em',
                    fontWeight: '600',
                    color: '#fff',
                    lineHeight: '1.4'
                  }}>
                    {article.title || 'Untitled Article'}
                  </h3>
                  {article.summary && (
                    <p style={{
                      margin: '0 0 12px 0',
                      fontSize: '0.85em',
                      color: 'rgba(255,255,255,0.6)',
                      lineHeight: '1.5',
                      display: '-webkit-box',
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}>
                      {article.summary}
                    </p>
                  )}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.75em',
                    color: 'rgba(255,255,255,0.4)',
                    borderTop: '1px solid rgba(255,255,255,0.1)',
                    paddingTop: '12px'
                  }}>
                    <span>{article.author || 'Unknown'}</span>
                    <span>
                      {article.published_date
                        ? new Date(article.published_date).toLocaleDateString()
                        : new Date(article.scraped_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
