import { useState, useEffect, useRef } from 'react';
import { storyAPI } from '../services/api';

export function StoriesPage({ onNavigate, selectedUser }) {
  const [stories, setStories] = useState([]);
  const [completeStories, setCompleteStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingComplete, setLoadingComplete] = useState(true);
  const [error, setError] = useState(null);
  const audioRefs = useRef({}); // {storyId: audioElement}

  useEffect(() => {
    loadStories();
    loadCompleteStories();
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

  const loadCompleteStories = async () => {
    setLoadingComplete(true);
    try {
      const result = await storyAPI.getCompleteStories();
      console.log('[Stories] Loaded complete stories response:', result);
      console.log('[Stories] Response success:', result?.success);
      console.log('[Stories] Response stories:', result?.stories);
      console.log('[Stories] Stories count:', result?.stories?.length);
      
      if (result && result.success !== false) {
        if (result.stories && Array.isArray(result.stories)) {
          setCompleteStories(result.stories);
          console.log('[Stories] Set complete stories:', result.stories.length);
        } else {
          console.warn('[Stories] No stories array in response');
          setCompleteStories([]);
        }
      } else {
        console.warn('[Stories] Response indicates failure or no success flag');
        setCompleteStories([]);
      }
    } catch (err) {
      console.error('[Stories] Error loading complete stories:', err);
      console.error('[Stories] Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText,
        fullError: err
      });
      // Log the full error response if available
      if (err.response?.data) {
        console.error('[Stories] Full error response:', JSON.stringify(err.response.data, null, 2));
      }
      setCompleteStories([]);
    } finally {
      setLoadingComplete(false);
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
          {/* Projects Section */}
          <div className="stories-section">
            <h2 className="stories-section-title">Projects</h2>
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

          {/* Complete Stories Section */}
          <div className="stories-section">
            <h2 className="stories-section-title">Stories</h2>
            {loadingComplete ? (
              <div className="stories-loading">Loading complete stories...</div>
            ) : completeStories.length === 0 ? (
              <div className="stories-empty">
                <p>No complete stories yet. Build a story to see it here.</p>
                <p style={{ fontSize: '0.85rem', color: '#888', marginTop: '10px' }}>
                  Debug: {completeStories.length} stories loaded
                </p>
              </div>
            ) : (
              <div className="stories-list">
                {completeStories.map((story) => {
                  const audioUrl = story.audio?.startsWith('/') ? story.audio : `/${story.audio}`;
                  console.log('[Stories] Rendering complete story:', story.id, story.title, audioUrl);
                  return (
                    <div key={story.id} className="story-item">
                      <h3 className="story-title">{story.title}</h3>
                      <div className="story-meta">
                        <span className="story-date">
                          {story.created_at 
                            ? new Date(story.created_at).toLocaleDateString()
                            : 'Unknown date'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
                        <audio
                          ref={(el) => {
                            if (el) audioRefs.current[story.id] = el;
                          }}
                          src={audioUrl}
                          controls
                          style={{ maxWidth: '300px', height: '32px' }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
