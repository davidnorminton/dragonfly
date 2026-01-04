import { useState, useEffect } from 'react';
import { newsAPI } from '../services/api';

export function useNews(feedType = 'top_stories', limit = 50, interval = 900000) {
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await newsAPI.getNews(feedType, limit);
        if (data.success && data.data) {
          setNews(data.data);
        } else {
          setError(data.error || 'Failed to load news');
        }
        setLoading(false);
      } catch (err) {
        console.error('Error fetching news:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    fetchNews();
    const intervalId = setInterval(fetchNews, interval);

    return () => clearInterval(intervalId);
  }, [feedType, limit, interval]);

  return { news, loading, error };
}

