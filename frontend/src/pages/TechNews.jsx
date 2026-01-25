import { useState, useEffect, useMemo, useRef, useCallback } from 'react';

export default function TechNews({ searchQuery = '' }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState('');
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [totalArticles, setTotalArticles] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const scrollContainerRef = useRef(null);
  const [sortBy, setSortBy] = useState('latest'); // latest, oldest, title-asc, title-desc
  const [selectedDomain, setSelectedDomain] = useState(() => {
    // Initialize from localStorage if available, but clear it on mount to ensure fresh state
    const stored = localStorage.getItem('techNewsSelectedDomain');
    if (stored) {
      // Clear it immediately so it doesn't persist
      localStorage.removeItem('techNewsSelectedDomain');
    }
    return '';
  });
  const [availableDomains, setAvailableDomains] = useState([]);
  const [viewMode, setViewMode] = useState(() => {
    const stored = localStorage.getItem('techNewsViewMode');
    return stored || 'card'; // 'card' or 'list'
  });

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

  // Extract domain from URL helper
  const getDomainFromUrl = (url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  // Filter and sort articles with enhanced search
  const filteredAndSortedArticles = useMemo(() => {
    let filtered = articles;
    
    // Filter by domain if selected
    if (selectedDomain) {
      const beforeCount = filtered.length;
      filtered = filtered.filter(article => {
        if (!article.url) return false;
        const articleDomain = getDomainFromUrl(article.url);
        const matches = articleDomain === selectedDomain;
        // Debug first few mismatches to help troubleshoot
        if (!matches && beforeCount < 20) {
          console.log(`  ❌ Domain mismatch: "${articleDomain}" !== "${selectedDomain}" (URL: ${article.url?.substring(0, 60)}...)`);
        }
        return matches;
      });
      console.log(`🔍 Domain filter "${selectedDomain}": ${beforeCount} → ${filtered.length} articles`);
    }
    
    // Filter and calculate relevance if searching
    if (searchQuery.trim()) {
      const queryTerms = searchQuery.toLowerCase().split(/\s+/).filter(term => term.length > 0);
      
      // Use 'filtered' (already domain-filtered) instead of 'articles'
      filtered = filtered
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
  }, [articles, searchQuery, sortBy, selectedDomain]);

  useEffect(() => {
    // Ensure selectedDomain is cleared on mount (in case of stale state)
    setSelectedDomain('');
    
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
    
    // Listen for scraper completion to reload articles
    const handleScraperCompleted = (event) => {
      const { articlesSaved } = event.detail;
      if (articlesSaved > 0) {
        console.log(`🔄 Reloading articles after scraper saved ${articlesSaved} new articles`);
        loadArticles();
      }
    };
    
    window.addEventListener('techNewsSelectArticle', handleTechNewsSelect);
    window.addEventListener('scraperCompleted', handleScraperCompleted);
    
    return () => {
      window.removeEventListener('techNewsSelectArticle', handleTechNewsSelect);
      window.removeEventListener('scraperCompleted', handleScraperCompleted);
    };
  }, []);

  // Load available domains from sources
  useEffect(() => {
    const loadDomains = async () => {
      try {
        const response = await fetch('/api/scraper/sources');
        const result = await response.json();
        if (result.success && result.sources) {
          // Extract unique domains from source URLs
          const domains = new Set();
          result.sources.forEach(source => {
            try {
              const url = new URL(source.url);
              // Remove www. prefix for cleaner display
              const domain = url.hostname.replace(/^www\./, '');
              domains.add(domain);
              console.log(`Source: ${source.name} -> Domain: ${domain}`);
            } catch (e) {
              // Skip invalid URLs
            }
          });
          const sortedDomains = Array.from(domains).sort();
          console.log('Available domains:', sortedDomains);
          setAvailableDomains(sortedDomains);
        }
      } catch (err) {
        console.error('Failed to load domains:', err);
      }
    };
    loadDomains();
  }, []);


  const loadArticles = async (reset = true) => {
    if (reset) {
      setLoading(true);
      setArticles([]);
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      const offset = reset ? 0 : articles.length;
      const limit = 30;
      const response = await fetch(`/api/scraper/articles?limit=${limit}&offset=${offset}`);
      const result = await response.json();
      
      if (result.success) {
        if (reset) {
          setArticles(result.articles || []);
          setTotalArticles(result.total || 0);
        } else {
          setArticles(prev => [...prev, ...(result.articles || [])]);
        }
        
        // Check if there are more articles to load
        const loadedCount = reset ? (result.articles?.length || 0) : articles.length + (result.articles?.length || 0);
        setHasMore(loadedCount < (result.total || 0));
        
        console.log(`📰 Loaded ${result.articles?.length || 0} articles (${loadedCount}/${result.total || 0} total)`);
      } else {
        setMessage(`Error loading articles: ${result.error}`);
      }
    } catch (err) {
      setMessage(`Failed to load articles: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Lazy load more articles when scrolling near bottom
  const handleScroll = useCallback(() => {
    // Don't lazy load if we're filtering/searching - those should show all matching results
    if (loadingMore || !hasMore || searchQuery || selectedDomain) return;
    
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    
    // Load more when within 200px of bottom
    if (scrollHeight - scrollTop - clientHeight < 200) {
      loadArticles(false);
    }
  }, [articles.length, loadingMore, hasMore, searchQuery, selectedDomain]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      return () => container.removeEventListener('scroll', handleScroll);
    }
  }, [handleScroll]);


  const loadArticleDetails = async (articleId) => {
    setLoadingArticle(true);
    try {
      const response = await fetch(`/api/scraper/articles/${articleId}`);
      const result = await response.json();
      
      if (result.success) {
        setSelectedArticle(result.article);
        // Update the article's read status in the articles list
        setArticles(prevArticles => 
          prevArticles.map(article => 
            article.id === articleId 
              ? { ...article, read: true }
              : article
          )
        );
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
    
    // Style code blocks - preserve language classes and ensure proper display
    const codeBlocks = temp.querySelectorAll('pre, code');
    codeBlocks.forEach(code => {
      if (code.tagName === 'PRE') {
        // Preserve language class if it exists
        const languageClass = code.className.match(/language-[\w-]+/);
        if (languageClass) {
          code.className = `tech-news-code-block ${languageClass[0]}`;
        } else {
          code.className = 'tech-news-code-block';
        }
        code.style.background = 'rgba(255,255,255,0.05)';
        code.style.padding = '16px';
        code.style.borderRadius = '8px';
        code.style.overflow = 'auto';
        code.style.fontSize = '0.9em';
        code.style.lineHeight = '1.5';
        code.style.margin = '16px 0';
        code.style.border = '1px solid rgba(255,255,255,0.1)';
        
        // Ensure code inside pre is styled correctly
        const innerCode = code.querySelector('code');
        if (innerCode) {
          innerCode.style.background = 'transparent';
          innerCode.style.padding = '0';
          innerCode.style.borderRadius = '0';
          innerCode.style.display = 'block';
          innerCode.style.whiteSpace = 'pre';
          innerCode.style.overflow = 'visible';
        }
      } else if (code.tagName === 'CODE') {
        // Check if this code is inside a pre tag
        const parentPre = code.closest('pre');
        if (!parentPre) {
          // Inline code - style it
          code.className = 'tech-news-inline-code';
          code.style.background = 'rgba(255,255,255,0.1)';
          code.style.padding = '2px 6px';
          code.style.borderRadius = '4px';
          code.style.fontSize = '0.9em';
          code.style.fontFamily = "'Monaco', 'Menlo', 'Ubuntu Mono', monospace";
        } else {
          // Code inside pre - preserve language class
          const languageClass = code.className.match(/language-[\w-]+/);
          if (languageClass) {
            code.className = `tech-news-code ${languageClass[0]}`;
          } else {
            code.className = 'tech-news-code';
          }
        }
      }
    });
    
    return temp.innerHTML;
  };

  // Enhanced content formatter for better readability
  const formatArticleContent = (content) => {
    if (!content) return '<p style="color: rgba(255,255,255,0.5); font-style: italic; text-align: center; padding: 40px;">No content available for this article.</p>';
    
    let formatted = content.trim();
    
    // If content looks like plain text (no HTML tags), convert it to proper HTML
    if (!/<[^>]+>/.test(formatted)) {
      // Split by double line breaks to create paragraphs
      const paragraphs = formatted
        .split(/\n\s*\n/)
        .map(paragraph => paragraph.trim())
        .filter(paragraph => paragraph.length > 0)
        .map(paragraph => `<p>${paragraph.replace(/\n/g, '<br>')}</p>`);
      
      formatted = paragraphs.join('');
    }
    
    // Use the existing sanitizeHTML function for security
    const sanitized = sanitizeHTML(formatted);
    
    // Add additional styling to the sanitized content
    const temp = document.createElement('div');
    temp.innerHTML = sanitized;
    
    // Enhanced paragraph styling
    const paragraphs = temp.querySelectorAll('p');
    paragraphs.forEach((p, index) => {
      p.style.marginBottom = '20px';
      p.style.lineHeight = '1.8';
      p.style.color = 'rgba(255,255,255,0.95)';
      if (index === 0) {
        p.style.fontSize = '1.05em'; // Make first paragraph slightly larger
      }
    });
    
    // Enhanced heading styling  
    const headings = temp.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      heading.style.color = '#fff';
      heading.style.marginTop = '32px';
      heading.style.marginBottom = '16px';
      heading.style.fontWeight = '700';
      heading.style.lineHeight = '1.3';
      
      // Different sizes for different heading levels
      const sizes = { 'H1': '1.8em', 'H2': '1.5em', 'H3': '1.3em', 'H4': '1.2em', 'H5': '1.1em', 'H6': '1em' };
      heading.style.fontSize = sizes[heading.tagName] || '1.2em';
    });
    
    // Enhanced blockquote styling
    const blockquotes = temp.querySelectorAll('blockquote');
    blockquotes.forEach(quote => {
      quote.style.borderLeft = '4px solid #3b82f6';
      quote.style.paddingLeft = '20px';
      quote.style.margin = '24px 0';
      quote.style.fontStyle = 'italic';
      quote.style.color = 'rgba(255,255,255,0.85)';
      quote.style.background = 'rgba(59, 130, 246, 0.08)';
      quote.style.padding = '20px 20px 20px 24px';
      quote.style.borderRadius = '8px';
      quote.style.fontSize = '1.05em';
    });
    
    // Ensure all code blocks are properly displayed (re-check after all processing)
    const allCodeBlocks = temp.querySelectorAll('pre code, code[class*="language-"], code.language-python, code.language-javascript, code.language-json, code.language-bash');
    allCodeBlocks.forEach(code => {
      // Ensure code blocks are visible and properly styled
      code.style.display = 'block';
      code.style.whiteSpace = 'pre';
      code.style.overflow = 'auto';
      code.style.fontFamily = "'Monaco', 'Menlo', 'Ubuntu Mono', monospace";
      
      // Preserve language classes
      if (!code.className.includes('language-') && code.getAttribute('class')) {
        const existingClass = code.getAttribute('class');
        if (existingClass.match(/language-[\w-]+/)) {
          code.className = `tech-news-code ${existingClass}`;
        }
      }
    });
    
    // Also check for code tags that might have been missed
    const allCodeTags = temp.querySelectorAll('code');
    allCodeTags.forEach(code => {
      // If code has a language class, ensure it's displayed as a block
      if (code.className && code.className.includes('language-')) {
        const parentPre = code.closest('pre');
        if (!parentPre) {
          // Wrap standalone code with language class in a pre tag
          const pre = document.createElement('pre');
          pre.className = 'tech-news-code-block';
          pre.style.background = 'rgba(255,255,255,0.05)';
          pre.style.padding = '16px';
          pre.style.borderRadius = '8px';
          pre.style.overflow = 'auto';
          pre.style.margin = '16px 0';
          pre.style.border = '1px solid rgba(255,255,255,0.1)';
          code.parentNode.insertBefore(pre, code);
          pre.appendChild(code);
          code.style.display = 'block';
          code.style.whiteSpace = 'pre';
        }
      }
    });
    
    return temp.innerHTML;
  };

  return (
    <div className="page-container" style={{ padding: '12px' }}>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Tech News</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <select
            value={selectedDomain}
            onChange={(e) => setSelectedDomain(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '0.9em',
              cursor: 'pointer',
              minWidth: '200px'
            }}
          >
            <option value="">All Sources</option>
            {availableDomains.map(domain => (
              <option key={domain} value={domain}>
                {domain}
              </option>
            ))}
          </select>
          {selectedDomain && (
            <button
              onClick={() => setSelectedDomain('')}
              style={{
                padding: '8px 16px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: 'rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '0.9em',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.2)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.1)';
              }}
            >
              Reset Filter
            </button>
          )}
        </div>
      </div>


      {/* Header Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        gap: '20px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px'
        }}>
          <div style={{ fontWeight: '600', color: '#fff', fontSize: '1.1em' }}>
            Articles ({totalArticles || 0})
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '0.9em',
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
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <button
            onClick={() => {
              const newMode = viewMode === 'card' ? 'list' : 'card';
              setViewMode(newMode);
              localStorage.setItem('techNewsViewMode', newMode);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: viewMode === 'card' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: '0.9em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (viewMode !== 'card') {
                e.target.style.background = 'rgba(255,255,255,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'card') {
                e.target.style.background = 'rgba(255,255,255,0.05)';
              }
            }}
            title="Card View"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/>
            </svg>
            Cards
          </button>
          <button
            onClick={() => {
              const newMode = viewMode === 'list' ? 'card' : 'list';
              setViewMode(newMode);
              localStorage.setItem('techNewsViewMode', newMode);
            }}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.2)',
              background: viewMode === 'list' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255,255,255,0.05)',
              color: '#fff',
              fontSize: '0.9em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              if (viewMode !== 'list') {
                e.target.style.background = 'rgba(255,255,255,0.1)';
              }
            }}
            onMouseLeave={(e) => {
              if (viewMode !== 'list') {
                e.target.style.background = 'rgba(255,255,255,0.05)';
              }
            }}
            title="List View"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z"/>
            </svg>
            List
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div style={{ 
        position: 'relative',
        height: 'calc(100vh - 180px)'
      }}>
        {/* Article Cards Grid */}
        <div 
          ref={scrollContainerRef}
          style={{
            height: '100%',
            overflowY: 'auto',
            paddingRight: selectedArticle ? '70%' : '0',
            paddingBottom: '60px',
            transition: 'padding-right 0.5s ease'
          }}
        >
          {loading ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              color: 'rgba(255,255,255,0.5)'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '3em', marginBottom: '16px' }}>📰</div>
                <p style={{ fontSize: '1.2em' }}>Loading articles...</p>
              </div>
            </div>
          ) : articles.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              color: 'rgba(255,255,255,0.5)'
            }}>
              <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <div style={{ fontSize: '4em', marginBottom: '24px', opacity: 0.3 }}>📰</div>
                <h3 style={{ fontSize: '1.5em', marginBottom: '16px', color: 'rgba(255,255,255,0.8)' }}>No articles scraped yet</h3>
                <p style={{ fontSize: '1em', lineHeight: '1.6', marginBottom: '24px' }}>
                  Configure sources in Settings → Web Scraper, then click "Run Scraper" above to start collecting articles.
                </p>
              </div>
            </div>
          ) : filteredAndSortedArticles.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '60%',
              color: 'rgba(255,255,255,0.5)'
            }}>
              <div style={{ textAlign: 'center', maxWidth: '400px' }}>
                <div style={{ fontSize: '4em', marginBottom: '24px', opacity: 0.3 }}>🔍</div>
                <h3 style={{ fontSize: '1.5em', marginBottom: '16px', color: 'rgba(255,255,255,0.8)' }}>No articles match your search</h3>
                <p style={{ fontSize: '1em', lineHeight: '1.6' }}>
                  Try a different search term or adjust your filters.
                </p>
              </div>
            </div>
          ) : viewMode === 'list' ? (
            <>
              {/* Articles List View */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '24px'
              }}>
                {filteredAndSortedArticles.map((article) => (
                  <div
                    key={article.id}
                    style={{
                      display: 'flex',
                      gap: '20px',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: selectedArticle?.id === article.id ? '0 8px 32px rgba(59, 130, 246, 0.3)' : '0 2px 8px rgba(0,0,0,0.1)',
                      position: 'relative',
                      padding: '16px'
                    }}
                    onClick={() => loadArticleDetails(article.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateX(4px)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.2)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateX(0)';
                      e.currentTarget.style.boxShadow = selectedArticle?.id === article.id ? '0 8px 32px rgba(59, 130, 246, 0.3)' : '0 2px 8px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  >
                    {/* Read Checkmark */}
                    {article.read && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'rgba(34, 197, 94, 0.9)',
                        borderRadius: '50%',
                        width: '28px',
                        height: '28px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)'
                      }}>
                        <span style={{ color: '#fff', fontSize: '16px' }}>✓</span>
                      </div>
                    )}
                    
                    {/* Article Image - Left Side */}
                    {article.image_url ? (
                      <div style={{
                        width: '200px',
                        minWidth: '200px',
                        height: '150px',
                        background: `url(${article.image_url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        borderRadius: '8px',
                        flexShrink: 0
                      }} />
                    ) : (
                      <div style={{
                        width: '200px',
                        minWidth: '200px',
                        height: '150px',
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {getFaviconUrl(article.url) ? (
                          <img
                            src={getFaviconUrl(article.url)}
                            alt=""
                            style={{ width: '48px', height: '48px', opacity: 0.5 }}
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        ) : (
                          <span style={{ fontSize: '2em', opacity: 0.3 }}>📰</span>
                        )}
                      </div>
                    )}
                    
                    {/* Article Content - Right Side */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {/* Domain Badge */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '4px'
                      }}>
                        {getFaviconUrl(article.url) && (
                          <img
                            src={getFaviconUrl(article.url)}
                            alt=""
                            style={{ width: '14px', height: '14px', opacity: 0.7 }}
                            onError={(e) => e.target.style.display = 'none'}
                          />
                        )}
                        <span style={{
                          background: 'rgba(255,255,255,0.1)',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.75em',
                          color: 'rgba(255,255,255,0.7)'
                        }}>
                          {getDomainFromUrl(article.url)}
                        </span>
                        <span style={{
                          fontSize: '0.8em',
                          color: 'rgba(255,255,255,0.5)',
                          marginLeft: 'auto'
                        }}>
                          {article.published_date
                            ? new Date(article.published_date).toLocaleDateString()
                            : new Date(article.scraped_at).toLocaleDateString()}
                        </span>
                      </div>
                      
                      {/* Title */}
                      <h3 style={{
                        margin: '0',
                        fontSize: '1.3em',
                        fontWeight: '600',
                        color: '#fff',
                        lineHeight: '1.4'
                      }}>
                        {article.title || 'Untitled Article'}
                      </h3>
                      
                      {/* Description */}
                      {article.summary && (
                        <p style={{
                          margin: '0',
                          fontSize: '0.95em',
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
                      
                      {/* Read More Indicator */}
                      <div style={{
                        marginTop: 'auto',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        fontSize: '0.85em',
                        color: '#60a5fa'
                      }}>
                        <span style={{
                          background: 'rgba(59, 130, 246, 0.2)',
                          color: '#60a5fa',
                          padding: '4px 8px',
                          borderRadius: '6px'
                        }}>
                          Read more →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* Articles Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
                gap: '24px',
                padding: '24px 24px 24px 24px'
              }}>
                {filteredAndSortedArticles.map((article) => (
                  <div
                    key={article.id}
                    style={{
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '16px',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      boxShadow: selectedArticle?.id === article.id ? '0 8px 32px rgba(59, 130, 246, 0.3)' : '0 4px 16px rgba(0,0,0,0.1)',
                      position: 'relative'
                    }}
                    onClick={() => loadArticleDetails(article.id)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-4px)';
                      e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,0,0,0.2)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = selectedArticle?.id === article.id ? '0 8px 32px rgba(59, 130, 246, 0.3)' : '0 4px 16px rgba(0,0,0,0.1)';
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }}
                  >
                    {/* Read Checkmark */}
                    {article.read && (
                      <div style={{
                        position: 'absolute',
                        top: '12px',
                        right: '12px',
                        background: 'rgba(34, 197, 94, 0.9)',
                        borderRadius: '50%',
                        width: '32px',
                        height: '32px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 10,
                        boxShadow: '0 2px 8px rgba(34, 197, 94, 0.4)'
                      }}>
                        <span style={{ color: '#fff', fontSize: '18px' }}>✓</span>
                      </div>
                    )}
                    
                    {/* Article Image */}
                    {article.image_url && (
                      <div style={{
                        height: '200px',
                        background: `url(${article.image_url})`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        position: 'relative'
                      }}>
                        <div style={{
                          position: 'absolute',
                          bottom: '12px',
                          left: '12px',
                          background: 'rgba(0,0,0,0.7)',
                          backdropFilter: 'blur(8px)',
                          padding: '6px 10px',
                          borderRadius: '8px',
                          fontSize: '0.8em',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          {getFaviconUrl(article.url) && (
                            <img
                              src={getFaviconUrl(article.url)}
                              alt=""
                              style={{ width: '14px', height: '14px' }}
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          )}
                          {getDomainFromUrl(article.url)}
                        </div>
                      </div>
                    )}
                    
                    {/* Article Content */}
                    <div style={{ padding: '24px' }}>
                      {!article.image_url && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '8px',
                          marginBottom: '12px'
                        }}>
                          {getFaviconUrl(article.url) && (
                            <img
                              src={getFaviconUrl(article.url)}
                              alt=""
                              style={{ width: '16px', height: '16px', opacity: 0.7 }}
                              onError={(e) => e.target.style.display = 'none'}
                            />
                          )}
                          <span style={{
                            background: 'rgba(255,255,255,0.1)',
                            padding: '4px 8px',
                            borderRadius: '6px',
                            fontSize: '0.8em',
                            color: 'rgba(255,255,255,0.7)'
                          }}>
                            {getDomainFromUrl(article.url)}
                          </span>
                        </div>
                      )}
                      
                      <h3 style={{
                        margin: '0 0 12px 0',
                        fontSize: '1.2em',
                        fontWeight: '600',
                        color: '#fff',
                        lineHeight: '1.4',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {article.title || 'Untitled Article'}
                      </h3>
                      
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
                        fontSize: '0.8em',
                        color: 'rgba(255,255,255,0.5)'
                      }}>
                        <span>
                          {article.published_date
                            ? new Date(article.published_date).toLocaleDateString()
                            : new Date(article.scraped_at).toLocaleDateString()}
                        </span>
                        <span style={{
                          background: 'rgba(59, 130, 246, 0.2)',
                          color: '#60a5fa',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          fontSize: '0.85em'
                        }}>
                          Read more →
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Loading More Indicator */}
              {loadingMore && (
                <div style={{ 
                  textAlign: 'center', 
                  marginTop: '32px', 
                  paddingBottom: '60px',
                  color: 'rgba(255,255,255,0.6)'
                }}>
                  <div style={{ fontSize: '1.2em', marginBottom: '8px' }}>📰</div>
                  <div>Loading more articles...</div>
                </div>
              )}
              {!hasMore && articles.length > 0 && !searchQuery && !selectedDomain && (
                <div style={{ 
                  textAlign: 'center', 
                  marginTop: '32px', 
                  paddingBottom: '60px',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '0.9em'
                }}>
                  ✓ All articles loaded ({totalArticles || 0} total)
                </div>
              )}
            </>
          )}
        </div>

        {/* Sliding Article Panel */}
        {selectedArticle && (
          <div style={{
            position: 'fixed',
            top: '0',
            right: '0',
            width: '70%',
            height: '100vh',
            background: 'rgba(10, 10, 15, 0.98)',
            backdropFilter: 'blur(20px)',
            borderLeft: '1px solid rgba(255,255,255,0.1)',
            transform: selectedArticle ? 'translateX(0)' : 'translateX(100%)',
            transition: 'transform 0.5s ease',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Panel Header */}
            <div style={{
              padding: '24px 32px',
              borderBottom: '1px solid rgba(255,255,255,0.1)',
              background: 'rgba(255,255,255,0.02)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between'
            }}>
              <div style={{ flex: 1, paddingRight: '20px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  marginBottom: '12px'
                }}>
                  {getFaviconUrl(selectedArticle.url) && (
                    <img
                      src={getFaviconUrl(selectedArticle.url)}
                      alt=""
                      style={{ width: '20px', height: '20px', opacity: 0.8 }}
                    />
                  )}
                  <span style={{
                    color: 'rgba(255,255,255,0.6)',
                    fontSize: '0.9em'
                  }}>
                    {getDomainFromUrl(selectedArticle.url)}
                  </span>
                </div>
                
                <h1 style={{
                  margin: '0 0 16px 0',
                  fontSize: '1.8em',
                  fontWeight: '700',
                  color: '#fff',
                  lineHeight: '1.3'
                }}>
                  {selectedArticle.title}
                </h1>
                
                <div style={{
                  display: 'flex',
                  gap: '20px',
                  alignItems: 'center',
                  fontSize: '0.9em',
                  color: 'rgba(255,255,255,0.5)',
                  marginBottom: '16px'
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
                    color: '#60a5fa',
                    textDecoration: 'none',
                    fontSize: '0.9em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  Read original article →
                </a>
              </div>
              
              <button
                onClick={() => setSelectedArticle(null)}
                style={{
                  background: 'rgba(255,255,255,0.1)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '40px',
                  height: '40px',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.7)',
                  fontSize: '1.2em',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                onMouseEnter={(e) => {
                  e.target.style.background = 'rgba(255,255,255,0.15)';
                  e.target.style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.target.style.background = 'rgba(255,255,255,0.1)';
                  e.target.style.color = 'rgba(255,255,255,0.7)';
                }}
              >
                ✕
              </button>
            </div>

            {/* Panel Content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '0'
            }}>
              <div style={{
                maxWidth: '800px',
                margin: '0 auto',
                padding: '32px'
              }}>
                {loadingArticle ? (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '200px',
                    color: 'rgba(255,255,255,0.5)'
                  }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '2em', marginBottom: '16px', opacity: 0.5 }}>📰</div>
                      <p>Loading article...</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {selectedArticle.image_url && (
                      <img
                        src={selectedArticle.image_url}
                        alt={selectedArticle.title}
                        style={{
                          width: '100%',
                          maxHeight: '400px',
                          objectFit: 'cover',
                          borderRadius: '16px',
                          marginBottom: '32px',
                          boxShadow: '0 12px 48px rgba(0,0,0,0.4)'
                        }}
                      />
                    )}
                    
                    {selectedArticle.summary && (
                      <div style={{
                        padding: '24px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        borderRadius: '16px',
                        marginBottom: '32px',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        fontSize: '1.1em',
                        lineHeight: '1.7',
                        color: 'rgba(255,255,255,0.9)'
                      }}>
                        <strong style={{ color: '#fff', fontSize: '1em' }}>Summary:</strong>
                        <br /><br />
                        {selectedArticle.summary}
                      </div>
                    )}
                    
                    <div 
                      className="tech-news-content"
                      style={{
                        fontSize: '1.1em',
                        lineHeight: '1.8',
                        color: 'rgba(255,255,255,0.9)'
                      }}
                      dangerouslySetInnerHTML={{
                        __html: formatArticleContent(selectedArticle.content)
                      }}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
