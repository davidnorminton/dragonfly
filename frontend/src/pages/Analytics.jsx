import { useState, useEffect } from 'react';
import { musicAPI } from '../services/api';

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const songsPerPage = 25;

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const data = await musicAPI.getAnalytics();
      setAnalytics(data);
      setError('');
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError('Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-header">
          <h1>Music Analytics</h1>
        </div>
        <div className="analytics-loading">Loading analytics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="analytics-page">
        <div className="analytics-header">
          <h1>Music Analytics</h1>
        </div>
        <div className="analytics-error">{error}</div>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const maxPlays = Math.max(...analytics.most_played.map(s => s.play_count), 1);
  const maxArtistPlays = Math.max(...analytics.top_artists.map(a => a.play_count), 1);
  const maxAlbumPlays = Math.max(...analytics.top_albums.map(a => a.play_count), 1);
  
  // Pagination for most played songs
  const totalPages = Math.ceil(analytics.most_played.length / songsPerPage);
  const startIdx = (currentPage - 1) * songsPerPage;
  const endIdx = startIdx + songsPerPage;
  const paginatedSongs = analytics.most_played.slice(startIdx, endIdx);

  return (
    <div className="analytics-page">
      <div className="analytics-header">
        <h1>Music Analytics</h1>
        <button onClick={loadAnalytics} className="analytics-refresh">
          ↻ Refresh
        </button>
      </div>

      {/* Summary Stats */}
      <div className="analytics-summary">
        <div className="analytics-stat-card">
          <div className="stat-value">{analytics.total_plays}</div>
          <div className="stat-label">Total Plays</div>
        </div>
        <div className="analytics-stat-card">
          <div className="stat-value">{analytics.songs_played}</div>
          <div className="stat-label">Songs Played</div>
        </div>
        <div className="analytics-stat-card">
          <div className="stat-value">{analytics.top_artists.length}</div>
          <div className="stat-label">Active Artists</div>
        </div>
      </div>

      {/* Most Played Songs */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <h2>Most Played Songs</h2>
          {totalPages > 1 && (
            <div className="analytics-pagination">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="pagination-button"
              >
                ← Previous
              </button>
              <span className="pagination-info">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="pagination-button"
              >
                Next →
              </button>
            </div>
          )}
        </div>
        <div className="analytics-chart">
          {paginatedSongs.map((song, idx) => (
            <div key={song.id} className="chart-row">
              <div className="chart-rank">{startIdx + idx + 1}</div>
              <div className="chart-info">
                <div className="chart-song-title">{song.title}</div>
                <div className="chart-song-meta">
                  {song.artist} • {song.album}
                </div>
              </div>
              <div className="chart-bar-container">
                <div 
                  className="chart-bar" 
                  style={{ width: `${(song.play_count / maxPlays) * 100}%` }}
                >
                  <span className="chart-bar-label">{song.play_count} plays</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Artists */}
      <div className="analytics-section">
        <h2>Top Artists</h2>
        <div className="analytics-chart">
          {analytics.top_artists.map((artist, idx) => (
            <div key={idx} className="chart-row">
              <div className="chart-rank">{idx + 1}</div>
              <div className="chart-info">
                <div className="chart-song-title">{artist.name}</div>
              </div>
              <div className="chart-bar-container">
                <div 
                  className="chart-bar artist-bar" 
                  style={{ width: `${(artist.play_count / maxArtistPlays) * 100}%` }}
                >
                  <span className="chart-bar-label">{artist.play_count} plays</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Albums */}
      <div className="analytics-section">
        <h2>Top Albums</h2>
        <div className="analytics-chart">
          {analytics.top_albums.map((album, idx) => (
            <div key={idx} className="chart-row">
              <div className="chart-rank">{idx + 1}</div>
              <div className="chart-info">
                <div className="chart-song-title">{album.title}</div>
                <div className="chart-song-meta">{album.artist}</div>
              </div>
              <div className="chart-bar-container">
                <div 
                  className="chart-bar album-bar" 
                  style={{ width: `${(album.play_count / maxAlbumPlays) * 100}%` }}
                >
                  <span className="chart-bar-label">{album.play_count} plays</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

