import { useState, useEffect } from 'react';
import { storyAPI } from '../services/api';

export function StoriesPage({ onNavigate, selectedUser }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStories();
  }, [selectedUser?.id]);

  const loadStories = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await storyAPI.getStories(selectedUser?.id);
      console.log('[Stories] Loaded stories:', result);
      if (result && result.success !== false && result.stories) {
        setStories(result.stories);
      } else {
        setStories([]);
      }
    } catch (err) {
      console.error('Error loading stories:', err);
      setError(err.message || 'Failed to load stories');
      setStories([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="stories-page">
      <div className="stories-container">
        <div className="stories-header">
          <h1>Stories</h1>
          <button
            className="create-story-button"
            onClick={() => onNavigate?.('create-story')}
          >
            Create
          </button>
        </div>
        <div className="stories-content">
          {loading ? (
            <div className="stories-loading">Loading stories...</div>
          ) : error ? (
            <div className="stories-error">Error: {error}</div>
          ) : stories.length === 0 ? (
            <div className="stories-empty">
              <p>No stories yet. Click "Create" to create your first story.</p>
            </div>
          ) : (
            <div className="stories-list">
              {stories.map((story) => (
                <div key={story.id} className="story-item">
                  <h3 className="story-title">{story.title}</h3>
                  <div className="story-meta">
                    <span className="story-date">
                      {story.created_at 
                        ? new Date(story.created_at).toLocaleDateString()
                        : 'Unknown date'}
                    </span>
                    {story.cast && story.cast.length > 0 && (
                      <span className="story-cast">
                        {story.cast.length} persona{story.cast.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <button
                    className="story-view-btn"
                    onClick={() => {
                      onNavigate?.('edit-story', { storyId: story.id });
                    }}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
