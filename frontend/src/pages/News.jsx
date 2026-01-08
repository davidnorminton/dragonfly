import { useState, useEffect } from 'react';
import { useNews } from '../hooks/useNews';
import { newsAPI } from '../services/api';
import { FiExternalLink } from 'react-icons/fi';

export function NewsPage() {
  const { news, loading, error } = useNews('top_stories', 50);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [selectedTitle, setSelectedTitle] = useState(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  // When an article is clicked, load or fetch its summary
  const handleArticleClick = async (article, index) => {
    setSelectedArticle(article);
    setSelectedTitle(article.title);
    
    // Check if summary already exists
    if (article.summary) {
      setSelectedSummary(article.summary);
      setSelectedTitle(article.summary_title || article.title);
      return;
    }

    // Fetch summary
    setLoadingSummary(true);
    try {
      const result = await newsAPI.summarizeArticle(article.link, article.title);
      if (result.success && result.summary) {
        setSelectedSummary(result.summary);
        setSelectedTitle(result.title || article.title);
      } else {
        console.error('Error summarizing article:', result.error);
        setSelectedSummary(`Error: ${result.error || 'Failed to generate summary'}`);
      }
    } catch (err) {
      console.error('Error summarizing article:', err);
      setSelectedSummary(`Error: ${err.message || 'Failed to generate summary'}`);
    } finally {
      setLoadingSummary(false);
    }
  };

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

  return (
    <div className="news-page">
      <div className="news-container">
        <div className="news-content-split">
          {/* Left pane: News articles list */}
          <div className="news-articles-pane">
            {loading && (
              <div className="news-placeholder">Loading news...</div>
            )}
            {error && (
              <div className="news-error">Error loading news: {error}</div>
            )}
            {!loading && !error && news && news.articles && news.articles.length > 0 ? (
              <div className="news-articles">
                {news.articles.map((article, index) => {
                  const isSelected = selectedArticle?.link === article.link;
                  return (
                    <div 
                      key={index} 
                      className={`news-article ${isSelected ? 'news-article-selected' : ''}`}
                      onClick={() => handleArticleClick(article, index)}
                    >
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
                            {article.title}
                          </h3>
                          {article.link && (
                            <a 
                              href={article.link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="news-article-external-link"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <FiExternalLink />
                            </a>
                          )}
                        </div>
                        {article.published_date && (
                          <div className="news-article-date">
                            {formatDate(article.published_date)}
                          </div>
                        )}
                        {article.description && (
                          <div className="news-article-description">
                            {article.description.replace(/<[^>]*>/g, '').substring(0, 200)}
                            {article.description.length > 200 ? '...' : ''}
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

          {/* Right pane: Summary display */}
          <div className="news-summary-pane">
            {selectedArticle ? (
              <div className="news-summary-content">
                <h2 className="news-summary-title">{selectedTitle}</h2>
                {loadingSummary ? (
                  <div className="news-summary-loading">Generating summary...</div>
                ) : selectedSummary ? (
                  <div className="news-summary-text">{selectedSummary}</div>
                ) : (
                  <div className="news-summary-placeholder">Click an article to view its summary</div>
                )}
              </div>
            ) : (
              <div className="news-summary-placeholder">
                Select an article to view its summary
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
