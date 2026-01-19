import { useState, useEffect, useRef } from 'react';
import { storyAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';
import { getPersonaImageUrl } from '../utils/personaImageHelper';

export function StoryViewPage({ onNavigate, pageData, selectedUser }) {
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showRawData, setShowRawData] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const audioRef = useRef(null);
  const fileInputRef = useRef(null);
  const { personas } = usePersonas(selectedUser?.id);

  useEffect(() => {
    if (pageData?.storyId) {
      loadStory();
    }
  }, [pageData?.storyId]);

  const loadStory = async () => {
    if (!pageData?.storyId) return;
    
    setLoading(true);
    setError(null);
    try {
      const result = await storyAPI.getCompleteStories();
      console.log('[StoryView] Loaded complete stories:', result);
      
      if (result && result.success && result.stories) {
        const foundStory = result.stories.find(s => s.id === pageData.storyId);
        if (foundStory) {
          setStory(foundStory);
        } else {
          setError('Story not found');
        }
      } else {
        setError('Failed to load story');
      }
    } catch (err) {
      console.error('[StoryView] Error loading story:', err);
      setError(err.message || 'Failed to load story');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="story-view-page">
        <div className="story-view-container">
          <div className="story-view-loading">Loading story...</div>
        </div>
      </div>
    );
  }

  if (error || !story) {
    return (
      <div className="story-view-page">
        <div className="story-view-container">
          <div className="story-view-error">
            <p>Error: {error || 'Story not found'}</p>
            <button onClick={() => onNavigate?.('stories')}>Back to Stories</button>
          </div>
        </div>
      </div>
    );
  }

  const audioUrl = story.audio?.startsWith('/') ? story.audio : `/${story.audio}`;
  
  // Parse screenplay JSON if available
  let screenplayData = null;
  if (story.screenplay || story.full_screenplay) {
    try {
      const screenplayText = story.full_screenplay || story.screenplay;
      screenplayData = typeof screenplayText === 'string' ? JSON.parse(screenplayText) : screenplayText;
    } catch (e) {
      console.error('[StoryView] Error parsing screenplay:', e);
    }
  }

  // Get persona images
  const narratorPersona = personas?.find(p => p.name === story.narrator);
  const narratorImageUrl = narratorPersona ? getPersonaImageUrl(narratorPersona.image_path, narratorPersona.name) : null;
  
  const castPersonas = story.cast?.map(member => {
    const persona = personas?.find(p => p.name === member.persona_name);
    return {
      ...member,
      persona,
      imageUrl: persona ? getPersonaImageUrl(persona.image_path, persona.name) : null
    };
  }) || [];

  const handleDelete = async () => {
    if (!story || !selectedUser?.is_admin) return;
    
    if (!confirm(`Are you sure you want to delete "${story.title}"? This will permanently delete the story, all its data, and the audio file.`)) {
      return;
    }

    setDeleting(true);
    try {
      const result = await storyAPI.deleteCompleteStory(story.id, selectedUser?.id);
      if (result && result.success) {
        // Navigate back to stories page
        onNavigate?.('stories');
      } else {
        throw new Error(result?.error || 'Failed to delete story');
      }
    } catch (error) {
      console.error('[StoryView] Error deleting story:', error);
      alert(`Error deleting story: ${error.message || 'Unknown error'}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleImageUpload = async (file) => {
    if (!story || !file) return;
    
    setUploadingImage(true);
    try {
      const result = await storyAPI.uploadStoryImage(story.id, file);
      if (result && result.success) {
        // Reload story to get updated image
        await loadStory();
      } else {
        throw new Error(result?.error || 'Failed to upload image');
      }
    } catch (error) {
      console.error('[StoryView] Error uploading image:', error);
      alert(`Error uploading image: ${error.message || 'Unknown error'}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    } else {
      alert('Please select an image file');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleImageUpload(file);
    } else {
      alert('Please drop an image file');
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  return (
    <div className="story-view-page">
      {/* Fixed Back Button */}
      <button
        className="story-view-back-btn-fixed"
        onClick={() => onNavigate?.('stories')}
      >
        ← Back
      </button>

      <div className="story-view-container">
        <div className="story-view-content">
          {/* Left Column - Details */}
          <div className="story-view-left-column">
            <div className="story-view-metadata-section">
              <h2>{story.title}</h2>
              <div className="story-view-metadata">
                <div className="story-view-metadata-item">
                  <strong>Created:</strong> {story.created_at ? new Date(story.created_at).toLocaleString() : 'Unknown'}
                </div>
                {story.updated_at && (
                  <div className="story-view-metadata-item">
                    <strong>Updated:</strong> {new Date(story.updated_at).toLocaleString()}
                  </div>
                )}
                {story.narrator && (
                  <div className="story-view-metadata-item">
                    <strong>Narrator:</strong>
                    <div className="story-view-persona-item">
                      {narratorImageUrl ? (
                        <img 
                          src={narratorImageUrl} 
                          alt={story.narrator}
                          className="story-view-persona-image"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextElementSibling) {
                              e.target.nextElementSibling.style.display = 'flex';
                            }
                          }}
                        />
                      ) : null}
                      <div 
                        className="story-view-persona-placeholder"
                        style={{ display: narratorImageUrl ? 'none' : 'flex' }}
                      >
                        {story.narrator.charAt(0).toUpperCase()}
                      </div>
                      <span className="story-view-persona-name">{story.narrator}</span>
                    </div>
                  </div>
                )}
                {story.cast && story.cast.length > 0 && (
                  <div className="story-view-metadata-item">
                    <strong>Cast:</strong>
                    <ul className="story-view-cast-list">
                      {castPersonas.map((member, index) => (
                        <li key={index} className="story-view-cast-item">
                          {member.imageUrl ? (
                            <img 
                              src={member.imageUrl} 
                              alt={member.persona_name}
                              className="story-view-persona-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                if (e.target.nextElementSibling) {
                                  e.target.nextElementSibling.style.display = 'flex';
                                }
                              }}
                            />
                          ) : null}
                          <div 
                            className="story-view-persona-placeholder"
                            style={{ display: member.imageUrl ? 'none' : 'flex' }}
                          >
                            {member.persona_name.charAt(0).toUpperCase()}
                          </div>
                          <span className="story-view-persona-name">{member.persona_name}</span>
                          {member.custom_context && (
                            <span className="story-view-cast-context"> ({member.custom_context.substring(0, 50)}{member.custom_context.length > 50 ? '...' : ''})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {story.audio && (
                  <div className="story-view-metadata-item">
                    <strong>Audio File:</strong> {story.audio}
                  </div>
                )}
                
                {/* Image Upload Section */}
                <div className="story-view-metadata-item">
                  <strong>Story Image:</strong>
                  <div 
                    className={`story-view-image-upload ${isDragging ? 'dragging' : ''}`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {story.image ? (
                      <div className="story-view-image-preview">
                        <img 
                          src={story.image.startsWith('/') ? story.image : `/${story.image}`}
                          alt={story.title}
                          className="story-view-image"
                        />
                        <button
                          className="story-view-image-remove"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm('Remove this image?')) {
                              try {
                                const result = await storyAPI.removeStoryImage(story.id);
                                if (result && result.success) {
                                  await loadStory();
                                } else {
                                  throw new Error(result?.error || 'Failed to remove image');
                                }
                              } catch (error) {
                                console.error('[StoryView] Error removing image:', error);
                                alert(`Error removing image: ${error.message || 'Unknown error'}`);
                              }
                            }
                          }}
                          title="Remove image"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <div className="story-view-image-placeholder">
                        {uploadingImage ? (
                          <div className="story-view-image-uploading">
                            <div className="story-view-image-spinner"></div>
                            <p>Uploading...</p>
                          </div>
                        ) : (
                          <>
                            <div className="story-view-image-upload-icon">📷</div>
                            <p>Upload or drag and drop an image</p>
                          </>
                        )}
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={handleFileSelect}
                    />
                  </div>
                </div>
              </div>
              
              {/* Delete Button - Admin Only */}
              {selectedUser?.is_admin && (
                <div className="story-view-delete-section">
                  <button
                    className="story-view-delete-btn"
                    onClick={handleDelete}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting...' : '🗑️ Delete Story'}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Screenplay/Raw Data */}
          <div className="story-view-right-column">
            {screenplayData && screenplayData.script && (
              <div className="story-view-screenplay-section">
                <div className="story-view-screenplay-header">
                  <h2>Screenplay</h2>
                  <button
                    className={`story-view-toggle-btn ${showRawData ? 'active' : ''}`}
                    onClick={() => setShowRawData(!showRawData)}
                  >
                    as data
                  </button>
                </div>
                {showRawData ? (
                  <div className="story-view-raw-content">
                    <pre className="story-view-raw-json">
                      {JSON.stringify(story, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div className="story-view-screenplay">
                    {screenplayData.script.map((item, index) => (
                      <div key={index} className="story-view-screenplay-item">
                        <strong className="story-view-screenplay-speaker">{item.speaker}:</strong>
                        <span className="story-view-screenplay-text">{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Fixed Audio Player at Bottom */}
        <div className="story-view-audio-player-fixed">
          <audio
            ref={audioRef}
            src={audioUrl}
            controls
            className="story-view-audio-player"
            onEnded={() => setIsPlaying(false)}
            onPause={() => setIsPlaying(false)}
            onPlay={() => setIsPlaying(true)}
          />
        </div>
      </div>
    </div>
  );
}
