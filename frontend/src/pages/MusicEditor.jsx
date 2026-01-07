import { useState, useEffect } from 'react';
import { musicAPI } from '../services/api';

export function MusicEditor() {
  const [loading, setLoading] = useState(true);
  const [artists, setArtists] = useState([]);
  const [expandedArtist, setExpandedArtist] = useState(null);
  const [expandedAlbum, setExpandedAlbum] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [saveStatus, setSaveStatus] = useState('');
  const [addingVideoTo, setAddingVideoTo] = useState(null);
  const [newVideo, setNewVideo] = useState({ videoId: '', title: '' });
  const [videoStatus, setVideoStatus] = useState('');
  const [editingVideo, setEditingVideo] = useState(null);
  const [editVideoForm, setEditVideoForm] = useState({ videoId: '', title: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await musicAPI.getEditorData();
      if (res.success) {
        setArtists(res.artists || []);
      }
    } catch (err) {
      console.error('Failed to load editor data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (type, item) => {
    setEditingItem({ type, id: item.id });
    if (type === 'artist') {
      setEditForm({ name: item.name, image_path: item.image_path || '' });
    } else if (type === 'album') {
      setEditForm({ title: item.title, year: item.year || '', genre: item.genre || '', cover_path: item.cover_path || '' });
    } else if (type === 'song') {
      setEditForm({ title: item.title, track_number: item.track_number || '', duration_seconds: item.duration_seconds || '' });
    }
  };

  const handleCancel = () => {
    setEditingItem(null);
    setEditForm({});
    setSaveStatus('');
  };

  const handleSave = async () => {
    if (!editingItem) return;
    
    setSaveStatus('Saving...');
    try {
      let res;
      if (editingItem.type === 'artist') {
        res = await musicAPI.updateArtist(editingItem.id, editForm);
      } else if (editingItem.type === 'album') {
        res = await musicAPI.updateAlbum(editingItem.id, editForm);
      } else if (editingItem.type === 'song') {
        res = await musicAPI.updateSong(editingItem.id, editForm);
      }
      
      if (res.success) {
        setSaveStatus('✓ Saved');
        setTimeout(() => {
          setSaveStatus('');
          setEditingItem(null);
          loadData();
        }, 1000);
      } else {
        setSaveStatus(`Error: ${res.error}`);
      }
    } catch (err) {
      setSaveStatus(`Error: ${err.message}`);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '--:--';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleDeleteVideo = async (artistName, videoId) => {
    if (!confirm('Delete this video?')) return;
    
    setVideoStatus('Deleting...');
    try {
      const res = await musicAPI.deleteArtistVideo(artistName, videoId);
      if (res.success) {
        setVideoStatus('✓ Deleted');
        setTimeout(() => {
          setVideoStatus('');
          loadData();
        }, 1000);
      } else {
        setVideoStatus(`Error: ${res.error}`);
      }
    } catch (err) {
      setVideoStatus(`Error: ${err.message}`);
    }
  };

  const handleAddVideo = async (artistName) => {
    if (!newVideo.videoId || !newVideo.title) {
      setVideoStatus('Video ID and title are required');
      return;
    }

    setVideoStatus('Adding...');
    try {
      const res = await musicAPI.addArtistVideo(artistName, newVideo);
      if (res.success) {
        setVideoStatus('✓ Added');
        setTimeout(() => {
          setVideoStatus('');
          setAddingVideoTo(null);
          setNewVideo({ videoId: '', title: '' });
          loadData();
        }, 1000);
      } else {
        setVideoStatus(`Error: ${res.error}`);
      }
    } catch (err) {
      setVideoStatus(`Error: ${err.message}`);
    }
  };

  const handleEditVideo = (artistId, video) => {
    setEditingVideo({ artistId, originalVideoId: video.videoId });
    setEditVideoForm({ videoId: video.videoId, title: video.title });
  };

  const handleSaveVideo = async (artistName) => {
    if (!editVideoForm.videoId || !editVideoForm.title) {
      setVideoStatus('Video ID and title are required');
      return;
    }

    setVideoStatus('Saving...');
    try {
      const res = await musicAPI.updateArtistVideo(
        artistName,
        editingVideo.originalVideoId,
        editVideoForm
      );
      if (res.success) {
        setVideoStatus('✓ Saved');
        setTimeout(() => {
          setVideoStatus('');
          setEditingVideo(null);
          setEditVideoForm({ videoId: '', title: '' });
          loadData();
        }, 1000);
      } else {
        setVideoStatus(`Error: ${res.error}`);
      }
    } catch (err) {
      setVideoStatus(`Error: ${err.message}`);
    }
  };

  const handleCancelVideoEdit = () => {
    setEditingVideo(null);
    setEditVideoForm({ videoId: '', title: '' });
    setVideoStatus('');
  };

  if (loading) {
    return <div className="music-editor-page"><div className="editor-loading">Loading music library...</div></div>;
  }

  return (
    <div className="music-editor-page">
      <div className="editor-header">
        <h2>Music Library Editor</h2>
        <p>Edit artist, album, and song metadata. Changes are saved to the database.</p>
      </div>

      <div className="editor-content">
        {artists.map((artist) => (
          <div key={artist.id} className="editor-artist">
            <div
              className="editor-item-header artist-header"
              onClick={() => setExpandedArtist(expandedArtist === artist.id ? null : artist.id)}
            >
              <span className="expand-icon">{expandedArtist === artist.id ? '▼' : '▶'}</span>
              <strong>{artist.name}</strong>
              <span className="item-count">({artist.albums.length} albums)</span>
              <button
                className="edit-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit('artist', artist);
                }}
              >
                Edit
              </button>
            </div>

            {editingItem?.type === 'artist' && editingItem.id === artist.id && (
              <div className="editor-form">
                <div className="form-row">
                  <label>Name:</label>
                  <input
                    type="text"
                    value={editForm.name || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <label>Image Path:</label>
                  <input
                    type="text"
                    value={editForm.image_path || ''}
                    onChange={(e) => setEditForm({ ...editForm, image_path: e.target.value })}
                    placeholder="e.g., Artist Name/cover.jpg"
                  />
                </div>
                <div className="form-actions">
                  <button className="save-btn" onClick={handleSave}>Save</button>
                  <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
                  {saveStatus && <span className="save-status">{saveStatus}</span>}
                </div>
              </div>
            )}

            {expandedArtist === artist.id && (
              <div className="editor-albums">
                {artist.albums.map((album) => (
                  <div key={album.id} className="editor-album">
                    <div
                      className="editor-item-header album-header"
                      onClick={() => setExpandedAlbum(expandedAlbum === album.id ? null : album.id)}
                    >
                      <span className="expand-icon">{expandedAlbum === album.id ? '▼' : '▶'}</span>
                      <span>{album.title}</span>
                      <span className="album-meta">({album.year || 'N/A'}) • {album.songs.length} songs</span>
                      <button
                        className="edit-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEdit('album', album);
                        }}
                      >
                        Edit
                      </button>
                    </div>

                    {editingItem?.type === 'album' && editingItem.id === album.id && (
                      <div className="editor-form">
                        <div className="form-row">
                          <label>Title:</label>
                          <input
                            type="text"
                            value={editForm.title || ''}
                            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                          />
                        </div>
                        <div className="form-row">
                          <label>Year:</label>
                          <input
                            type="number"
                            value={editForm.year || ''}
                            onChange={(e) => setEditForm({ ...editForm, year: parseInt(e.target.value) || '' })}
                          />
                        </div>
                        <div className="form-row">
                          <label>Genre:</label>
                          <input
                            type="text"
                            value={editForm.genre || ''}
                            onChange={(e) => setEditForm({ ...editForm, genre: e.target.value })}
                          />
                        </div>
                        <div className="form-row">
                          <label>Cover Path:</label>
                          <input
                            type="text"
                            value={editForm.cover_path || ''}
                            onChange={(e) => setEditForm({ ...editForm, cover_path: e.target.value })}
                            placeholder="e.g., Artist Name/Album Name/cover.jpg"
                          />
                        </div>
                        <div className="form-actions">
                          <button className="save-btn" onClick={handleSave}>Save</button>
                          <button className="cancel-btn" onClick={handleCancel}>Cancel</button>
                          {saveStatus && <span className="save-status">{saveStatus}</span>}
                        </div>
                      </div>
                    )}

                    {expandedAlbum === album.id && (
                      <div className="editor-songs">
                        <div className="songs-header">
                          <span className="song-track">#</span>
                          <span className="song-title">Title</span>
                          <span className="song-duration">Duration</span>
                          <span className="song-actions">Actions</span>
                        </div>
                        {album.songs.map((song) => (
                          <div key={song.id} className="editor-song">
                            {editingItem?.type === 'song' && editingItem.id === song.id ? (
                              <div className="editor-form inline-form">
                                <input
                                  type="number"
                                  className="track-input"
                                  value={editForm.track_number || ''}
                                  onChange={(e) => setEditForm({ ...editForm, track_number: parseInt(e.target.value) || '' })}
                                />
                                <input
                                  type="text"
                                  className="title-input"
                                  value={editForm.title || ''}
                                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                />
                                <input
                                  type="number"
                                  className="duration-input"
                                  value={editForm.duration_seconds || ''}
                                  onChange={(e) => setEditForm({ ...editForm, duration_seconds: parseInt(e.target.value) || '' })}
                                  placeholder="seconds"
                                />
                                <div className="inline-actions">
                                  <button className="save-btn small" onClick={handleSave}>✓</button>
                                  <button className="cancel-btn small" onClick={handleCancel}>✕</button>
                                  {saveStatus && <span className="save-status small">{saveStatus}</span>}
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="song-track">{song.track_number || '-'}</span>
                                <span className="song-title">{song.title}</span>
                                <span className="song-duration">{formatDuration(song.duration_seconds)}</span>
                                <span className="song-actions">
                                  <button
                                    className="edit-btn small"
                                    onClick={() => handleEdit('song', song)}
                                  >
                                    Edit
                                  </button>
                                </span>
                              </>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                
                <div className="editor-videos">
                  <div className="videos-header">
                    <strong>Videos</strong>
                    <button
                      className="add-video-btn"
                      onClick={() => setAddingVideoTo(addingVideoTo === artist.id ? null : artist.id)}
                    >
                      {addingVideoTo === artist.id ? '− Cancel' : '+ Add Video'}
                    </button>
                  </div>

                  {addingVideoTo === artist.id && (
                    <div className="editor-form add-video-form">
                      <div className="form-row">
                        <label>Video ID:</label>
                        <input
                          type="text"
                          value={newVideo.videoId}
                          onChange={(e) => setNewVideo({ ...newVideo, videoId: e.target.value })}
                          placeholder="e.g., dQw4w9WgXcQ (11 characters)"
                        />
                      </div>
                      <div className="form-row">
                        <label>Title:</label>
                        <input
                          type="text"
                          value={newVideo.title}
                          onChange={(e) => setNewVideo({ ...newVideo, title: e.target.value })}
                          placeholder="e.g., Song Name (Official Video)"
                        />
                      </div>
                      <div className="form-actions">
                        <button className="save-btn" onClick={() => handleAddVideo(artist.name)}>Add Video</button>
                        <button className="cancel-btn" onClick={() => {
                          setAddingVideoTo(null);
                          setNewVideo({ videoId: '', title: '' });
                          setVideoStatus('');
                        }}>Cancel</button>
                        {videoStatus && <span className="save-status">{videoStatus}</span>}
                      </div>
                    </div>
                  )}

                  {artist.videos && artist.videos.length > 0 ? (
                    <div className="videos-list">
                      {artist.videos.map((video, idx) => (
                        <div key={idx} className="video-item">
                          {editingVideo?.artistId === artist.id && editingVideo?.originalVideoId === video.videoId ? (
                            <div className="editor-form video-edit-form">
                              <div className="form-row">
                                <label>Video ID:</label>
                                <input
                                  type="text"
                                  value={editVideoForm.videoId}
                                  onChange={(e) => setEditVideoForm({ ...editVideoForm, videoId: e.target.value })}
                                  placeholder="e.g., dQw4w9WgXcQ"
                                />
                              </div>
                              <div className="form-row">
                                <label>Title:</label>
                                <input
                                  type="text"
                                  value={editVideoForm.title}
                                  onChange={(e) => setEditVideoForm({ ...editVideoForm, title: e.target.value })}
                                  placeholder="e.g., Song Name (Official Video)"
                                />
                              </div>
                              <div className="form-actions">
                                <button className="save-btn small" onClick={() => handleSaveVideo(artist.name)}>Save</button>
                                <button className="cancel-btn small" onClick={handleCancelVideoEdit}>Cancel</button>
                                {videoStatus && <span className="save-status small">{videoStatus}</span>}
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="video-info">
                                <strong>{video.title}</strong>
                                <a
                                  href={`https://www.youtube.com/watch?v=${video.videoId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="video-url"
                                >
                                  https://www.youtube.com/watch?v={video.videoId}
                                </a>
                              </div>
                              <div className="video-actions">
                                <button
                                  className="edit-btn small"
                                  onClick={() => handleEditVideo(artist.id, video)}
                                >
                                  Edit
                                </button>
                                <button
                                  className="delete-btn small"
                                  onClick={() => handleDeleteVideo(artist.name, video.videoId)}
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="no-videos">No videos added. Click "Add Video" to add one.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

