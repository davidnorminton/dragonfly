import { useState, useEffect } from 'react';
import { useNews } from '../hooks/useNews';
import { newsAPI } from '../services/api';

export function NewsPage() {
  const { news, loading, error } = useNews('top_stories', 50);
  const [summaries, setSummaries] = useState({});
  const [loadingSummaries, setLoadingSummaries] = useState({});

  // Hydrate summaries from backend data when news changes
  useEffect(() => {
    if (news && news.articles && news.articles.length > 0) {
      const fromBackend = {};
      news.articles.forEach((article, idx) => {
        if (article.summary) {
          fromBackend[idx] = article.summary;
        }
      });
      if (Object.keys(fromBackend).length > 0) {
        setSummaries(prev => ({ ...fromBackend, ...prev }));
      }
    }
  }, [news]);

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        hour: 'numeric', 
        minute: '2-digit' 
      });
    } catch (e) {
      return dateString;
    }
  };

  const handleSummarize = async (articleLink, articleIndex) => {
    if (!articleLink || summaries[articleIndex] || loadingSummaries[articleIndex]) {
      return;
    }

    setLoadingSummaries(prev => ({ ...prev, [articleIndex]: true }));

    try {
      const result = await newsAPI.summarizeArticle(articleLink);
      if (result.success && result.summary) {
        setSummaries(prev => ({ ...prev, [articleIndex]: result.summary }));
      } else {
        console.error('Error summarizing article:', result.error);
        setSummaries(prev => ({ ...prev, [articleIndex]: `Error: ${result.error || 'Failed to generate summary'}` }));
      }
    } catch (err) {
      console.error('Error summarizing article:', err);
      setSummaries(prev => ({ ...prev, [articleIndex]: `Error: ${err.message || 'Failed to generate summary'}` }));
    } finally {
      setLoadingSummaries(prev => {
        const newState = { ...prev };
        delete newState[articleIndex];
        return newState;
      });
    }
  };

  return (
    <div className="news-page">
      <div className="news-container">
        <div className="news-header">
          <div className="news-title">News</div>
        </div>
        <div className="news-content">
          {loading && (
            <div className="news-placeholder">Loading news...</div>
          )}
          {error && (
            <div className="news-error">Error loading news: {error}</div>
          )}
          {!loading && !error && news && news.articles && news.articles.length > 0 ? (
            <div className="news-articles">
              {news.articles.map((article, index) => {
                const existingSummary = summaries[index] || article.summary;
                const isSummarizing = !!loadingSummaries[index];
                const showButton = article.link && !existingSummary && !isSummarizing;
                return (
                <div key={index} className="news-article">
                  {article.image_url && (
                    <div className="news-article-image">
                      <img 
                        src={article.image_url} 
                        alt={article.title}
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <div className="news-article-content">
                    <div className="news-article-header">
                      <h3 className="news-article-title">
                        <a 
                          href={article.link} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="news-article-link"
                        >
                          {article.title}
                        </a>
                      </h3>
                      {article.published_date && (
                        <div className="news-article-date">
                          {formatDate(article.published_date)}
                        </div>
                      )}
                    </div>
                    {article.description && (
                      <div className="news-article-description">
                        {article.description.replace(/<[^>]*>/g, '').substring(0, 200)}
                        {article.description.length > 200 ? '...' : ''}
                      </div>
                    )}
                    {showButton && (
                      <button
                        className="news-summarize-button"
                        onClick={() => handleSummarize(article.link, index)}
                        disabled={isSummarizing}
                      >
                        {isSummarizing ? 'Summarizing...' : 'Summarize Article'}
                      </button>
                    )}
                    {isSummarizing && (
                      <div className="news-article-summary">Summarizing...</div>
                    )}
                    {existingSummary && !isSummarizing && (
                      <div className="news-article-summary">
                        {existingSummary}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          ) : !loading && !error && (
            <div className="news-placeholder">
              No news available
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
