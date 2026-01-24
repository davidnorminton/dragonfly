import { useState, useEffect, useMemo } from 'react';

export default function TechNews({ searchQuery = '' }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scraping, setScraping] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState('');
  const [debugInfo, setDebugInfo] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [visibleCount, setVisibleCount] = useState(30);
  const [sortBy, setSortBy] = useState('latest'); // latest, oldest, title-asc, title-desc

  // Strip HTML tags from text for search
  const stripHTML = (html) => {
    if (!html) return '';
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || temp.innerText || '';
  };

  // Calculate relevance score for search results
  const calculateRelevanceScore = (article, query) => {
    if (!query || query.length < 1) return 0;
    
    const queryLower = query.toLowerCase();
    let score = 0;
    
    // Title matches are most important (weight: 15)
    const title = (article.title || '').toLowerCase();
    if (title.includes(queryLower)) {
      score += 15;
      // Bonus for word boundary matches
      const wordBoundaryRegex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (wordBoundaryRegex.test(title)) {
        score += 10; // Whole word match bonus
      }
      // Position bonuses
      if (title === queryLower) score += 20; // Exact match
      else if (title.startsWith(queryLower)) score += 15; // Starts with
      else if (title.endsWith(queryLower)) score += 10; // Ends with
    }
    
    // Summary matches (weight: 8)
    const summary = (article.summary || '').toLowerCase();
    if (summary.includes(queryLower)) {
      score += 8;
      const wordBoundaryRegex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (wordBoundaryRegex.test(summary)) {
        score += 5; // Whole word in summary
      }
    }
    
    // Content matches (weight: 3) - strip HTML first
    const contentText = stripHTML(article.content || '').toLowerCase();
    if (contentText.includes(queryLower)) {
      score += 3;
      // Count occurrences but be more generous
      const matches = (contentText.match(new RegExp(queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
      score += Math.min(matches, 8); // Up to 8 bonus points for multiple matches
      
      // Whole word bonus in content
      const wordBoundaryRegex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
      if (wordBoundaryRegex.test(contentText)) {
        score += 3;
      }
    }
    
    // Author matches (weight: 5)
    const author = (article.author || '').toLowerCase();
    if (author.includes(queryLower)) {
      score += 5;
    }
    
    // URL matches for site-specific searches (weight: 2)
    const url = (article.url || '').toLowerCase();
    if (url.includes(queryLower)) {
      score += 2;
    }
    
    return score;
  };

  // Filter and sort articles with enhanced search
  const filteredAndSortedArticles = useMemo(() => {
    let filtered = articles;
    
    // Filter and calculate relevance if searching
    if (searchQuery.trim()) {
      const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      
      filtered = articles
        .map(article => {
          let totalScore = 0;
          let hasAnyMatch = false;
          
          // Check each search term
          for (const term of queryTerms) {
            const termScore = calculateRelevanceScore(article, term);
            if (termScore > 0) {
              hasAnyMatch = true;
              totalScore += termScore;
            }
          }
          
          // Bonus for matching multiple terms
          if (queryTerms.length > 1) {
            const matchedTerms = queryTerms.filter(term => calculateRelevanceScore(article, term) > 0);
            if (matchedTerms.length > 1) {
              totalScore += matchedTerms.length * 2; // Bonus for multi-term matches
            }
          }
          
          return {
            ...article,
            _relevanceScore: totalScore,
            _hasMatch: hasAnyMatch
          };
        })
        .filter(article => article._hasMatch) // Show any article with at least one match
        .sort((a, b) => {
          // Primary sort: relevance score (higher first)
          const scoreDiff = (b._relevanceScore || 0) - (a._relevanceScore || 0);
          if (scoreDiff !== 0) return scoreDiff;
          
          // Secondary sort: newer articles first
          const dateA = new Date(a.published_date || a.scraped_at);
          const dateB = new Date(b.published_date || b.scraped_at);
          return dateB - dateA;
        });
    }

    // Sort based on current sort option or search relevance
    const sorted = [...filtered];
    if (searchQuery.trim()) {
      // When searching, primary sort by relevance, secondary by date
      sorted.sort((a, b) => {
        const relevanceDiff = (b._relevanceScore || 0) - (a._relevanceScore || 0);
        if (relevanceDiff !== 0) return relevanceDiff;
        
        // If relevance is equal, sort by date (newest first)
        const dateA = new Date(a.published_date || a.scraped_at);
        const dateB = new Date(b.published_date || b.scraped_at);
        return dateB - dateA;
      });
    } else {
      // When not searching, use selected sort option
      switch (sortBy) {
        case 'latest':
          sorted.sort((a, b) => {
            const dateA = new Date(a.published_date || a.scraped_at);
            const dateB = new Date(b.published_date || b.scraped_at);
            return dateB - dateA; // Newest first
          });
          break;
        case 'oldest':
          sorted.sort((a, b) => {
            const dateA = new Date(a.published_date || a.scraped_at);
            const dateB = new Date(b.published_date || b.scraped_at);
            return dateA - dateB; // Oldest first
          });
          break;
        case 'title-asc':
          sorted.sort((a, b) => {
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            return titleA.localeCompare(titleB);
          });
          break;
        case 'title-desc':
          sorted.sort((a, b) => {
            const titleA = (a.title || '').toLowerCase();
            const titleB = (b.title || '').toLowerCase();
            return titleB.localeCompare(titleA);
          });
          break;
        default:
          break;
      }
    }

    return sorted;
  }, [articles, searchQuery, sortBy]);

  useEffect(() => {
    loadArticles();
    
    // Listen for article selection from SearchOverlay
    const handleTechNewsSelect = (event) => {
      const { articleId, article } = event.detail;
      if (articleId) {
        loadArticleDetails(articleId);
      } else if (article) {
        setSelectedArticle(article);
      }
    };
    
    window.addEventListener('techNewsSelectArticle', handleTechNewsSelect);
    
    return () => {
      window.removeEventListener('techNewsSelectArticle', handleTechNewsSelect);
    };
  }, []);

  // Reset visible count when articles, search query, or sort order change
  useEffect(() => {
    setVisibleCount(30);
  }, [articles.length, searchQuery, sortBy]);

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

  const clearAllArticles = async () => {
    if (!window.confirm('⚠️ This will permanently delete ALL scraped articles from the database. Are you sure?')) {
      return;
    }
    
    setClearing(true);
    setMessage('');
    
    try {
      const response = await fetch('/api/scraper/articles', {
        method: 'DELETE'
      });
      const result = await response.json();
      
      if (result.success) {
        setMessage(`✓ ${result.message}`);
        setArticles([]);
        setSelectedArticle(null);
        setDebugInfo(null);
      } else {
        setMessage(`✗ ${result.error || 'Failed to clear articles'}`);
      }
    } catch (err) {
      setMessage(`✗ Error: ${err.message}`);
    } finally {
      setClearing(false);
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

  // Extract domain name from URL  
  const getDomainFromUrl = (url) => {
    if (!url) return 'Unknown';
    try {
      const domain = new URL(url).hostname;
      // Clean up common prefixes and make it more readable
      return domain.replace(/^www\./, '').split('.')[0];
    } catch {
      return 'Unknown';
    }
  };

  // Basic HTML sanitizer to allow safe tags
  const sanitizeHTML = (html) => {
    if (!html) return '';
    
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Allow specific safe tags
    const allowedTags = ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
                        'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'img', 'a', 'table', 'tr', 'td', 'th'];
    
    // Remove scripts and dangerous elements
    const scripts = temp.querySelectorAll('script, iframe, object, embed');
    scripts.forEach(el => el.remove());
    
    // Add target="_blank" to links
    const links = temp.querySelectorAll('a[href]');
    links.forEach(link => {
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
    });
    
    // Ensure images have proper styling
    const images = temp.querySelectorAll('img');
    images.forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.margin = '16px 0';
    });
    
    // Style code blocks
    const codeBlocks = temp.querySelectorAll('pre, code');
    codeBlocks.forEach(code => {
      if (code.tagName === 'PRE') {
        code.style.background = 'rgba(255,255,255,0.05)';
        code.style.padding = '16px';
        code.style.borderRadius = '8px';
        code.style.overflow = 'auto';
        code.style.fontSize = '0.9em';
        code.style.lineHeight = '1.5';
      } else if (code.tagName === 'CODE') {
        code.style.background = 'rgba(255,255,255,0.1)';
        code.style.padding = '2px 6px';
        code.style.borderRadius = '4px';
        code.style.fontSize = '0.9em';
      }
    });
    
    return temp.innerHTML;
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
          <button
            onClick={clearAllArticles}
            disabled={clearing || loading || scraping}
            className="save-button"
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              color: '#ef4444'
            }}
            onMouseEnter={(e) => {
              if (!clearing && !loading && !scraping) {
                e.target.style.background = 'rgba(239, 68, 68, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(239, 68, 68, 0.2)';
            }}
          >
            {clearing ? 'Clearing...' : '🗑️ Clear All Articles'}
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
            borderBottom: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px'
            }}>
              <div style={{ fontWeight: '600', color: '#fff' }}>
                Articles ({filteredAndSortedArticles.length}{searchQuery ? ` of ${articles.length}` : ''})
              </div>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              style={{
                width: '100%',
                padding: '8px',
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '0.85em',
                cursor: 'pointer'
              }}
            >
              <option value="latest" style={{ background: '#1a1a1a' }}>Latest First</option>
              <option value="oldest" style={{ background: '#1a1a1a' }}>Oldest First</option>
              <option value="title-asc" style={{ background: '#1a1a1a' }}>Title (A-Z)</option>
              <option value="title-desc" style={{ background: '#1a1a1a' }}>Title (Z-A)</option>
            </select>
          </div>
          <div style={{
            flex: 1,
            overflowY: 'auto',
            overflowX: 'hidden',
            padding: '8px 0'
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
            ) : filteredAndSortedArticles.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.5)' }}>
                <p>No articles match your search.</p>
                <p style={{ fontSize: '0.9em', marginTop: '8px' }}>
                  Try a different search term.
                </p>
              </div>
            ) : (
              <>
              {filteredAndSortedArticles.slice(0, visibleCount).map((article) => (
                <div
                  key={article.id}
                  style={{
                    padding: '24px 20px',
                    marginBottom: '8px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255,255,255,0.08)',
                    cursor: 'pointer',
                    background: selectedArticle?.id === article.id ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.3s ease',
                    boxShadow: selectedArticle?.id === article.id ? '0 4px 12px rgba(59, 130, 246, 0.25)' : 'none'
                  }}
                  onClick={() => loadArticleDetails(article.id)}
                  onMouseEnter={(e) => {
                    if (selectedArticle?.id !== article.id) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedArticle?.id !== article.id) {
                      e.currentTarget.style.background = 'rgba(255,255,255,0.02)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    marginBottom: '16px'
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
                      margin: '0 0 12px 0',
                      fontSize: '1.1em',
                      fontWeight: '600',
                      color: '#fff',
                      lineHeight: '1.5',
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
                      margin: '0 0 16px 0',
                      fontSize: '0.9em',
                      color: 'rgba(255,255,255,0.7)',
                      lineHeight: '1.6',
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
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '0.85em',
                    color: 'rgba(255,255,255,0.6)',
                    marginTop: '8px'
                  }}>
                    <span style={{ 
                      background: 'rgba(255,255,255,0.1)', 
                      padding: '4px 8px', 
                      borderRadius: '6px',
                      fontSize: '0.9em'
                    }}>
                      {getDomainFromUrl(article.url)}
                    </span>
                    <span>
                      {article.published_date
                        ? new Date(article.published_date).toLocaleDateString()
                        : new Date(article.scraped_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {visibleCount < filteredAndSortedArticles.length && (
                <div style={{
                  padding: '24px 20px',
                  textAlign: 'center'
                }}>
                  <button
                    onClick={() => setVisibleCount(prev => prev + 30)}
                    style={{
                      padding: '12px 24px',
                      background: 'rgba(59, 130, 246, 0.15)',
                      border: '1px solid rgba(59, 130, 246, 0.3)',
                      borderRadius: '12px',
                      color: '#60a5fa',
                      cursor: 'pointer',
                      fontSize: '0.9em',
                      fontWeight: '600',
                      transition: 'all 0.3s ease',
                      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)'
                    }}
                    onMouseEnter={(e) => {
                      e.target.style.background = 'rgba(59, 130, 246, 0.25)';
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 8px 25px rgba(59, 130, 246, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.background = 'rgba(59, 130, 246, 0.15)';
                      e.target.style.transform = 'translateY(0)';
                      e.target.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.2)';
                    }}
                  >
                    📰 Load More ({filteredAndSortedArticles.length - visibleCount} remaining)
                  </button>
                </div>
              )}
              </>
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
                  <span>By {selectedArticle.author || getDomainFromUrl(selectedArticle.url)}</span>
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
                <div 
                  className="tech-news-content"
                  style={{
                    fontSize: '1em',
                    lineHeight: '1.8',
                    color: 'rgba(255,255,255,0.9)',
                    wordWrap: 'break-word'
                  }}
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHTML(selectedArticle.content) || '<p style="color: rgba(255,255,255,0.5);">No content available</p>'
                  }}
                />
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
