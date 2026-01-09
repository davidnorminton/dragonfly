import { useState, useEffect } from 'react';
import { musicAPI } from '../services/api';

export function AnalyticsPage() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [songsPage, setSongsPage] = useState(1);
  const [artistsPage, setArtistsPage] = useState(1);
  const [albumsPage, setAlbumsPage] = useState(1);
  const itemsPerPage = 10;

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
  const songsTotalPages = Math.ceil(analytics.most_played.length / itemsPerPage);
  const songsStartIdx = (songsPage - 1) * itemsPerPage;
  const paginatedSongs = analytics.most_played.slice(songsStartIdx, songsStartIdx + itemsPerPage);

  // Pagination for top artists
  const artistsTotalPages = Math.ceil(analytics.top_artists.length / itemsPerPage);
  const artistsStartIdx = (artistsPage - 1) * itemsPerPage;
  const paginatedArtists = analytics.top_artists.slice(artistsStartIdx, artistsStartIdx + itemsPerPage);

  // Pagination for top albums
  const albumsTotalPages = Math.ceil(analytics.top_albums.length / itemsPerPage);
  const albumsStartIdx = (albumsPage - 1) * itemsPerPage;
  const paginatedAlbums = analytics.top_albums.slice(albumsStartIdx, albumsStartIdx + itemsPerPage);

  const renderPagination = (currentPage, totalPages, setPage) => {
    if (totalPages <= 1) return null;
    
    return (
      <div className="analytics-pagination">
        <button
          onClick={() => setPage(p => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="pagination-button"
        >
          ←
        </button>
        <span className="pagination-info">
          {currentPage} / {totalPages}
        </span>
        <button
          onClick={() => setPage(p => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="pagination-button"
        >
          →
        </button>
      </div>
    );
  };

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
          <div className="stat-icon">🎵</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.total_plays.toLocaleString()}</div>
            <div className="stat-label">Total Plays</div>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="stat-icon">🎶</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.songs_played.toLocaleString()}</div>
            <div className="stat-label">Songs Played</div>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="stat-icon">🎤</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.top_artists.length}</div>
            <div className="stat-label">Active Artists</div>
          </div>
        </div>
        <div className="analytics-stat-card">
          <div className="stat-icon">💿</div>
          <div className="stat-content">
            <div className="stat-value">{analytics.top_albums.length}</div>
            <div className="stat-label">Albums Played</div>
          </div>
        </div>
      </div>

      {/* Most Played Songs */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <h2>🎵 Most Played Songs</h2>
          {renderPagination(songsPage, songsTotalPages, setSongsPage)}
        </div>
        <div className="analytics-chart">
          {paginatedSongs.map((song, idx) => (
            <div key={song.id} className="chart-row">
              <div className="chart-rank">
                <span className="rank-number">{songsStartIdx + idx + 1}</span>
              </div>
              <div className="chart-info">
                <div className="chart-song-title">{song.title}</div>
                <div className="chart-song-meta">
                  {song.artist} • {song.album}
                </div>
              </div>
              <div className="chart-bar-container">
                <div 
                  className="chart-bar" 
                  style={{ 
                    width: `${(song.play_count / maxPlays) * 100}%`,
                    background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)'
                  }}
                >
                  <span className="chart-bar-label">{song.play_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Artists */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <h2>🎤 Top Artists</h2>
          {renderPagination(artistsPage, artistsTotalPages, setArtistsPage)}
        </div>
        <div className="analytics-chart">
          {paginatedArtists.map((artist, idx) => (
            <div key={idx} className="chart-row">
              <div className="chart-rank">
                <span className="rank-number">{artistsStartIdx + idx + 1}</span>
              </div>
              <div className="chart-info">
                <div className="chart-song-title">{artist.name}</div>
                <div className="chart-song-meta">{artist.play_count} {artist.play_count === 1 ? 'play' : 'plays'}</div>
              </div>
              <div className="chart-bar-container">
                <div 
                  className="chart-bar artist-bar" 
                  style={{ 
                    width: `${(artist.play_count / maxArtistPlays) * 100}%`,
                    background: 'linear-gradient(90deg, #10b981, #3b82f6)'
                  }}
                >
                  <span className="chart-bar-label">{artist.play_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Top Albums */}
      <div className="analytics-section">
        <div className="analytics-section-header">
          <h2>💿 Top Albums</h2>
          {renderPagination(albumsPage, albumsTotalPages, setAlbumsPage)}
        </div>
        <div className="analytics-chart">
          {paginatedAlbums.map((album, idx) => (
            <div key={idx} className="chart-row">
              <div className="chart-rank">
                <span className="rank-number">{albumsStartIdx + idx + 1}</span>
              </div>
              <div className="chart-info">
                <div className="chart-song-title">{album.title}</div>
                <div className="chart-song-meta">{album.artist}</div>
              </div>
              <div className="chart-bar-container">
                <div 
                  className="chart-bar album-bar" 
                  style={{ 
                    width: `${(album.play_count / maxAlbumPlays) * 100}%`,
                    background: 'linear-gradient(90deg, #f59e0b, #ef4444)'
                  }}
                >
                  <span className="chart-bar-label">{album.play_count}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

