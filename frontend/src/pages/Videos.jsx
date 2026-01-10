import { useEffect, useState, useMemo } from 'react';
import { videoAPI } from '../services/api';
import { VideoPlayer } from '../components/VideoPlayer';
import { useChromecast } from '../hooks/useChromecast';

// Cast and Crew Component
function CastAndCrew({ movieTitle, movieYear }) {
  const [castCrew, setCastCrew] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filmography, setFilmography] = useState(null);
  const [loadingFilmography, setLoadingFilmography] = useState(false);

  // Reset and auto-load cast/crew when movie changes
  useEffect(() => {
    console.log('🎬 [Cast & Crew] Movie changed, auto-loading cast & crew');
    setCastCrew(null);
    setError(null);
    setFilmography(null);
    
    // Auto-load cast & crew
    if (movieTitle && movieYear) {
      loadCastCrew();
    }
  }, [movieTitle, movieYear]);

  const loadCastCrew = async () => {
    console.log('🎬 [Cast & Crew] Generate button clicked');
    console.log('🎬 [Cast & Crew] Movie:', movieTitle, 'Year:', movieYear);
    
    setLoading(true);
    setCastCrew(null);
    setError(null);
    
    try {
      console.log('🎬 [Cast & Crew] Fetching cast and crew data...');
      const data = await videoAPI.getCastCrew(movieTitle, movieYear);
      console.log('🎬 [Cast & Crew] Received data:', data);
      
      // Log each cast member to see if they have profile_path
      if (data.cast && data.cast.length > 0) {
        console.log('🎬 [Cast & Crew] First cast member:', data.cast[0]);
        console.log('🎬 [Cast & Crew] Profile path example:', data.cast[0]?.profile_path);
      }
      
      if (data && (data.cast?.length > 0 || data.director || data.writer || data.producer)) {
        setCastCrew(data);
        console.log('✅ [Cast & Crew] Successfully loaded cast and crew');
        
        // Auto-save filmographies to database
        if (data.cast && data.cast.length > 0) {
          console.log('💾 [Cast & Crew] Auto-saving filmographies...');
          try {
            const result = await videoAPI.generateAllFilmographies(data.cast);
            console.log('✅ [Cast & Crew] Auto-saved:', result.saved_count, 'filmographies');
          } catch (saveError) {
            console.error('⚠️ [Cast & Crew] Error auto-saving filmographies:', saveError);
            // Don't fail the whole operation if saving fails
          }
        }
      } else {
        console.warn('⚠️ [Cast & Crew] No data returned from API');
        setError('No cast and crew information available');
      }
    } catch (error) {
      console.error('❌ [Cast & Crew] Error loading cast/crew:', error);
      setError(error.message || 'Failed to load cast and crew');
    } finally {
      setLoading(false);
      console.log('🎬 [Cast & Crew] Loading complete');
    }
  };

  const handlePersonClick = async (name, role) => {
    console.log('👤 [Filmography] Clicked person:', name, 'Role:', role);
    
    setLoadingFilmography(true);
    setFilmography({ name, role, filmography: 'Loading...', movies: [] });
    
    try {
      // First check if we have saved data
      console.log('👤 [Filmography] Checking database...');
      const savedData = await videoAPI.getSavedFilmography(name);
      console.log('👤 [Filmography] Database result:', savedData);
      
      if (savedData.found && savedData.filmography) {
        console.log('✅ [Filmography] Found in database, filmography data:', savedData.filmography);
        // Parse the filmography data
        const movies = parseSavedFilmography(savedData.filmography, role);
        console.log('👤 [Filmography] Parsed movies:', movies);
        if (movies && movies.length > 0) {
          setFilmography({ name, role, filmography: '', movies });
          setLoadingFilmography(false);
          return;
        } else {
          console.warn('⚠️ [Filmography] No movies parsed from saved data');
        }
      }
      
      console.log('👤 [Filmography] Not in database or no data, fetching from TMDB...');
      const data = await videoAPI.getPersonFilmography(name, role);
      console.log('👤 [Filmography] Received data:', data);
      console.log('👤 [Filmography] Filmography text:', data.filmography);
      
      // Parse text format to movie list
      const movies = parseFilmographyText(data.filmography, role);
      console.log('👤 [Filmography] Parsed movies from text:', movies);
      
      setFilmography({ ...data, movies });
      
      // Save to database by generating filmography for this single person
      if (role === 'actor') {
        try {
          await videoAPI.generateAllFilmographies([{ name, profile_path: null }]);
          console.log('✅ [Filmography] Saved to database');
        } catch (saveError) {
          console.error('⚠️ [Filmography] Error saving:', saveError);
        }
      }
      
      console.log('✅ [Filmography] Successfully loaded');
    } catch (error) {
      console.error('❌ [Filmography] Error loading filmography:', error);
      setFilmography({ name, role, filmography: 'Error loading filmography: ' + error.message, movies: [] });
    } finally {
      setLoadingFilmography(false);
    }
  };

  const parseFilmographyText = (text, role) => {
    if (!text || typeof text !== 'string') {
      console.error('❌ [Filmography] Invalid text format:', text);
      return [];
    }
    
    // Parse text format like "- Movie Title (Year) as Character"
    const lines = text.split('\n').filter(line => line.trim().startsWith('-'));
    console.log('👤 [Filmography] Parsing', lines.length, 'lines');
    
    const movies = lines.map(line => {
      const match = line.match(/- (.+?) \((\d{4})\)(?:\s+as\s+(.+?))?(?:\s+\(([^)]+)\))?$/);
      if (match) {
        return {
          title: match[1].trim(),
          year: match[2],
          character: match[3] ? match[3].trim() : null,
          job: match[4] ? match[4].trim() : null
        };
      }
      return null;
    }).filter(Boolean);
    
    console.log('👤 [Filmography] Parsed', movies.length, 'movies from text');
    return movies;
  };

  const parseSavedFilmography = (filmographyData, role) => {
    // Parse saved JSON filmography data
    if (!filmographyData) {
      console.error('❌ [Filmography] No filmography data');
      return [];
    }
    
    console.log('👤 [Filmography] Parsing saved data, role:', role, 'data:', filmographyData);
    
    try {
      if (role === 'actor') {
        const cast = filmographyData.cast || [];
        console.log('👤 [Filmography] Cast array has', cast.length, 'items');
        
        return cast.slice(0, 12).map(movie => ({
          title: movie.title,
          year: movie.year,
          character: movie.character || null
        })).filter(m => m.title && m.year);
      } else {
        const crew = filmographyData.crew || [];
        console.log('👤 [Filmography] Crew array has', crew.length, 'items');
        
        // Filter by role
        const relevantJobs = {
          'director': ['Director'],
          'writer': ['Writer', 'Screenplay'],
          'producer': ['Producer', 'Executive Producer']
        }[role] || [];
        
        const filtered = crew.filter(movie => 
          relevantJobs.includes(movie.job)
        );
        
        console.log('👤 [Filmography] Filtered to', filtered.length, 'items for role:', role);
        
        return filtered.slice(0, 12).map(movie => ({
          title: movie.title,
          year: movie.year,
          job: movie.job || null
        })).filter(m => m.title && m.year);
      }
    } catch (error) {
      console.error('❌ [Filmography] Error parsing saved data:', error);
      return [];
    }
  };


  return (
    <div className="cast-crew-section">
      {loading && (
        <div className="cast-crew-loading">
          <div className="section-label">Cast & Crew</div>
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Loading cast and crew...</span>
          </div>
        </div>
      )}
      
      {error && !loading && (
        <div className="cast-crew-error">
          <div className="section-label">Cast & Crew</div>
          <div className="error-indicator">
            <span>{error}</span>
            <button 
              className="retry-btn"
              onClick={loadCastCrew}
            >
              Retry
            </button>
          </div>
        </div>
      )}
      
      {!loading && !error && castCrew && (
        <>
          <div className="section-label">Cast & Crew</div>
        </>
      )}

      {!loading && !error && castCrew && (
        <div className="cast-crew-container">
        {/* Cast */}
        {castCrew.cast && castCrew.cast.length > 0 && (
          <div className="crew-section">
            <div className="crew-role-label">Cast</div>
            <div className="cast-horizontal-scroll">
              {castCrew.cast.map((actor, idx) => (
                <div key={idx} className="cast-card">
                  <div className="cast-image-wrapper">
                    {actor.profile_path ? (
                      <img 
                        src={actor.profile_path} 
                        alt={actor.name || actor}
                        className="cast-image"
                      />
                    ) : (
                      <div className="cast-image-placeholder">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                      </div>
                    )}
                    <button 
                      className="filmography-btn-overlay"
                      onClick={() => handlePersonClick(actor.name || actor, 'actor')}
                      title={`View ${actor.name || actor}'s filmography`}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                      </svg>
                    </button>
                  </div>
                  <div className="cast-info">
                    <div className="cast-name">{actor.name || actor}</div>
                    {actor.character && <div className="cast-character">{actor.character}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Crew (Director, Writer, Producer) */}
        <div className="crew-section">
          <div className="crew-role-label">Crew</div>
          <div className="crew-horizontal">
            {castCrew.director && castCrew.director !== 'Unknown' && (
              <div className="crew-item">
                <div className="crew-role">Director</div>
                <div className="crew-name-btn">
                  <span className="crew-name">{castCrew.director}</span>
                  <button 
                    className="filmography-btn-small"
                    onClick={() => handlePersonClick(castCrew.director, 'director')}
                    title={`View ${castCrew.director}'s filmography`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {castCrew.writer && castCrew.writer !== 'Unknown' && (
              <div className="crew-item">
                <div className="crew-role">Writer</div>
                <div className="crew-name-btn">
                  <span className="crew-name">{castCrew.writer}</span>
                  <button 
                    className="filmography-btn-small"
                    onClick={() => handlePersonClick(castCrew.writer, 'writer')}
                    title={`View ${castCrew.writer}'s filmography`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {castCrew.producer && castCrew.producer !== 'Unknown' && (
              <div className="crew-item">
                <div className="crew-role">Producer</div>
                <div className="crew-name-btn">
                  <span className="crew-name">{castCrew.producer}</span>
                  <button 
                    className="filmography-btn-small"
                    onClick={() => handlePersonClick(castCrew.producer, 'producer')}
                    title={`View ${castCrew.producer}'s filmography`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      )}

      {/* Filmography Modal */}
      {filmography && (
        <div className="filmography-modal" onClick={() => setFilmography(null)}>
          <div className="filmography-content" onClick={(e) => e.stopPropagation()}>
            <button className="filmography-close" onClick={() => setFilmography(null)}>✕</button>
            <div className="filmography-header">
              <h3 className="filmography-title">{filmography.name}</h3>
              <div className="filmography-role-badge">{filmography.role.charAt(0).toUpperCase() + filmography.role.slice(1)}</div>
            </div>
            
            {loadingFilmography ? (
              <div className="filmography-loading">
                <div className="spinner"></div>
                <span>Loading filmography...</span>
              </div>
            ) : filmography.movies && filmography.movies.length > 0 ? (
              <div className="filmography-table-container">
                <table className="filmography-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Title</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filmography.movies
                      .sort((a, b) => parseInt(b.year) - parseInt(a.year))
                      .map((movie, idx) => (
                        <tr key={idx}>
                          <td className="year-cell">{movie.year}</td>
                          <td className="title-cell">{movie.title}</td>
                          <td className="role-cell">
                            {movie.character && `${movie.character}`}
                            {movie.job && `${movie.job}`}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="filmography-empty">No filmography available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function VideosPage({ searchQuery = '', onSearchResultsChange }) {
  const [library, setLibrary] = useState({ movies: [], tvShows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('movies'); // 'movies' or 'tvshows'
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null); // { id, title, type }
  
  const { castAvailable, castVideo } = useChromecast();

  const loadLibrary = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await videoAPI.getLibrary();
      if (res?.success) {
        setLibrary({
          movies: res.movies || [],
          tvShows: res.tv_shows || []
        });
      } else {
        setError(res?.error || 'Failed to load video library');
      }
    } catch (err) {
      setError(err?.message || 'Failed to load video library');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  // Filter library based on search query
  const filteredMovies = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return library.movies;
    const query = searchQuery.toLowerCase();
    return library.movies.filter(movie =>
      movie.title?.toLowerCase().includes(query) ||
      movie.description?.toLowerCase().includes(query) ||
      movie.year?.toString().includes(query)
    );
  }, [library.movies, searchQuery]);

  const filteredTVShows = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return library.tvShows;
    const query = searchQuery.toLowerCase();
    return library.tvShows.filter(show =>
      show.title?.toLowerCase().includes(query) ||
      show.description?.toLowerCase().includes(query) ||
      show.year?.toString().includes(query)
    );
  }, [library.tvShows, searchQuery]);

  // Compute search results for dropdown
  useEffect(() => {
    if (!onSearchResultsChange) return;
    
    if (!searchQuery || !searchQuery.trim()) {
      onSearchResultsChange([]);
      return;
    }
    
    const results = [];
    
    // Add matching movies
    filteredMovies.slice(0, 5).forEach(movie => {
      results.push({
        title: movie.title,
        subtitle: `Movie${movie.year ? ` (${movie.year})` : ''}`,
        image: movie.poster_path,
        onClick: () => {
          setViewMode('movies');
          setSelectedMovie(movie);
        }
      });
    });
    
    // Add matching TV shows
    filteredTVShows.slice(0, 5).forEach(show => {
      results.push({
        title: show.title,
        subtitle: `TV Show${show.year ? ` (${show.year})` : ''}`,
        image: show.poster_path,
        onClick: () => {
          setViewMode('tvshows');
          setSelectedShow(show);
        }
      });
    });
    
    onSearchResultsChange(results.slice(0, 10));
  }, [searchQuery, filteredMovies, filteredTVShows, onSearchResultsChange]);

  const formatDuration = (seconds) => {
    if (!seconds) return '';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) {
      return `${gb.toFixed(2)} GB`;
    }
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  };

  const currentShow = useMemo(() => {
    if (!selectedShow) return null;
    return filteredTVShows.find(show => show.id === selectedShow.id);
  }, [selectedShow, filteredTVShows]);

  const currentSeason = useMemo(() => {
    if (!currentShow || !selectedSeason) return null;
    return currentShow.seasons?.find(season => season.id === selectedSeason.id);
  }, [currentShow, selectedSeason]);

  const heroTitle = selectedMovie 
    ? selectedMovie.title 
    : selectedShow 
      ? currentSeason 
        ? `${selectedShow.title} - Season ${currentSeason.season_number}`
        : selectedShow.title
      : viewMode === 'movies' 
        ? 'Movies' 
        : 'TV Shows';

  const heroSub = selectedMovie
    ? `${selectedMovie.year || ''}${selectedMovie.duration ? ` • ${formatDuration(selectedMovie.duration)}` : ''}`
    : selectedShow
      ? currentSeason
        ? `${currentSeason.episodes?.length || 0} episodes`
        : `${selectedShow.year || ''}${selectedShow.seasons?.length ? ` • ${selectedShow.seasons.length} ${selectedShow.seasons.length === 1 ? 'season' : 'seasons'}` : ''}`
      : `${viewMode === 'movies' ? filteredMovies.length : filteredTVShows.length} ${viewMode === 'movies' ? 'movies' : 'shows'}`;

  const heroPoster = selectedMovie
    ? selectedMovie.poster_path
    : selectedShow
      ? currentSeason?.poster_path || selectedShow.poster_path
      : null;

  const heroBgStyle = {
    backgroundImage: heroPoster
      ? [
          'linear-gradient(180deg, rgba(11, 139, 230, 0.82) 0%, rgba(5, 47, 107, 0.92) 100%)',
          `url(${heroPoster})`
        ].join(', ')
      : 'linear-gradient(180deg, rgba(11, 139, 230, 0.82) 0%, rgba(5, 47, 107, 0.92) 100%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  };

  return (
    <div className="music-page video-page">
      {error && <div className="music-error">{error}</div>}

      <div className="music-layout">
        {/* Sidebar */}
        <div className="music-sidebar">
          <div className="music-filters">
            <button
              className={`filter-pill ${viewMode === 'movies' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('movies');
                setSelectedMovie(null);
                setSelectedShow(null);
                setSelectedSeason(null);
              }}
            >
              Movies
            </button>
            <button
              className={`filter-pill ${viewMode === 'tvshows' ? 'active' : ''}`}
              onClick={() => {
                setViewMode('tvshows');
                setSelectedMovie(null);
                setSelectedShow(null);
                setSelectedSeason(null);
              }}
            >
              TV Shows
            </button>
          </div>

          <div className="music-library">
            {loading && <div className="music-empty">Loading...</div>}
            {!loading && viewMode === 'movies' && filteredMovies.length === 0 && (
              <div className="music-empty">{searchQuery ? 'No movies found' : 'No movies in library yet.'}</div>
            )}
            {!loading && viewMode === 'tvshows' && filteredTVShows.length === 0 && (
              <div className="music-empty">{searchQuery ? 'No TV shows found' : 'No TV shows in library yet.'}</div>
            )}

            {/* Movies List */}
            {viewMode === 'movies' &&
              filteredMovies.map((movie) => (
                <div
                  key={movie.id}
                  className={`music-row artist-only ${selectedMovie?.id === movie.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedMovie(movie);
                    setSelectedShow(null);
                    setSelectedSeason(null);
                  }}
                >
                  {movie.poster_path && (
                    <img
                      src={movie.poster_path}
                      alt={movie.title}
                      className="artist-thumb"
                      style={{ borderRadius: '4px' }}
                    />
                  )}
                  <div>
                    <strong>{movie.title}</strong>
                    {movie.year && <div className="music-row-sub">{movie.year}</div>}
                  </div>
                </div>
              ))}

            {/* TV Shows List */}
            {viewMode === 'tvshows' &&
              filteredTVShows.map((show) => (
                <div
                  key={show.id}
                  className={`music-row artist-only ${selectedShow?.id === show.id ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedShow(show);
                    setSelectedMovie(null);
                    setSelectedSeason(null);
                  }}
                >
                  {show.poster_path && (
                    <img
                      src={show.poster_path}
                      alt={show.title}
                      className="artist-thumb"
                      style={{ borderRadius: '4px' }}
                    />
                  )}
                  <div>
                    <strong>{show.title}</strong>
                    {show.seasons && <div className="music-row-sub">{show.seasons.length} {show.seasons.length === 1 ? 'season' : 'seasons'}</div>}
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="music-main">
          {/* Hero Section */}
          <div className="music-hero" style={heroBgStyle}>
            {heroPoster ? (
              <img
                src={heroPoster}
                alt={heroTitle}
                className="album-hero"
                style={{ borderRadius: '8px' }}
              />
            ) : (
              <div className="album-hero" style={{ background: 'rgba(0, 0, 0, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999', borderRadius: '8px' }}>
                <svg width="64" height="64" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 12l3 3.72L15 12l4 5H5l4-5z"/>
                </svg>
              </div>
            )}
            <div className="hero-text">
              <div className="album-label">{selectedMovie ? 'Movie' : selectedShow ? (currentSeason ? 'Season' : 'TV Show') : viewMode === 'movies' ? 'Movies' : 'TV Shows'}</div>
              <h1 className="hero-title">{heroTitle}</h1>
              <div className="album-artist">{heroSub}</div>
              
              {/* Genres under title */}
              {selectedMovie && (
                (selectedMovie.metadata?.genres && selectedMovie.metadata.genres.length > 0) || 
                (selectedMovie.extra_metadata?.genres && selectedMovie.extra_metadata.genres.length > 0)
              ) && (
                <div className="hero-genres">
                  {(selectedMovie.metadata?.genres || selectedMovie.extra_metadata?.genres || []).map((genre, idx) => (
                    <span key={idx} className="hero-genre-pill">{genre.name || genre}</span>
                  ))}
                </div>
              )}

              {/* IMDB Score */}
              {selectedMovie && (selectedMovie.metadata?.vote_average || selectedMovie.extra_metadata?.vote_average) && (
                <div className="hero-rating">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="#f5c518">
                    <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
                  </svg>
                  <span className="rating-value">{(selectedMovie.metadata?.vote_average || selectedMovie.extra_metadata?.vote_average).toFixed(1)}</span>
                  <span className="rating-max">/10</span>
                </div>
              )}
              {(selectedMovie || (selectedShow && currentSeason)) && (
                <div className="hero-actions" style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {selectedMovie && (
                    <>
                      <button
                        className="hero-play-btn"
                        onClick={() => setPlayingVideo({ 
                          id: selectedMovie.id, 
                          title: selectedMovie.title,
                          type: 'movie'
                        })}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        Play
                      </button>
                      {castAvailable && (
                        <button
                          className="hero-cast-btn"
                          onClick={async () => {
                            window.__justCastFromList = true;
                            const response = await fetch('/api/system/network-info');
                            const networkInfo = await response.json();
                            const protocol = window.location.protocol;
                            const host = `${networkInfo.network_ip}:${networkInfo.port}`;
                            const movieUrl = `${protocol}//${host}/api/video/stream/${selectedMovie.id}`;
                            castVideo(movieUrl, selectedMovie.title, null, 0);
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                          </svg>
                          Cast
                        </button>
                      )}
                    </>
                  )}
                  {selectedShow && currentSeason && currentSeason.episodes?.length > 0 && (
                    <>
                      <button
                        className="hero-play-btn"
                        onClick={() => {
                          const firstEpisode = currentSeason.episodes
                            .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))[0];
                          if (firstEpisode) {
                            setPlayingVideo({
                              id: firstEpisode.id,
                              title: `${selectedShow.title} - S${currentSeason.season_number}E${firstEpisode.episode_number} - ${firstEpisode.title || 'Episode ' + firstEpisode.episode_number}`,
                              type: 'episode'
                            });
                          }
                        }}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                        Play Episode 1
                      </button>
                      {castAvailable && (
                        <button
                          className="hero-cast-btn"
                          onClick={async () => {
                            window.__justCastFromList = true;
                            const firstEpisode = currentSeason.episodes
                              .sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))[0];
                            if (firstEpisode) {
                              const response = await fetch('/api/system/network-info');
                              const networkInfo = await response.json();
                              const protocol = window.location.protocol;
                              const host = `${networkInfo.network_ip}:${networkInfo.port}`;
                              const episodeUrl = `${protocol}//${host}/api/video/stream/${firstEpisode.id}`;
                              const episodeTitle = `${selectedShow.title} - S${currentSeason.season_number}E${firstEpisode.episode_number} - ${firstEpisode.title || 'Episode ' + firstEpisode.episode_number}`;
                              castVideo(episodeUrl, episodeTitle, null, 0);
                            }
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                          </svg>
                          Cast
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Content Area */}
          <div className="music-tracklist">
            <div className="tracklist-body">
              {/* Movie Details - Description and Cast */}
              {selectedMovie && (
                <div className="album-section">
                  {selectedMovie.description && (
                    <div className="video-overview">
                      <div className="section-label">Overview</div>
                      <p className="overview-text">{selectedMovie.description}</p>
                    </div>
                  )}
                  
                  {/* Cast and Crew Section */}
                  <CastAndCrew 
                    movieTitle={selectedMovie.title} 
                    movieYear={selectedMovie.year} 
                  />
                </div>
              )}

              {/* TV Show - Seasons Grid */}
              {selectedShow && !selectedSeason && (
                <div className="album-section">
                  <div className="album-section-title">
                    Seasons
                    {selectedShow.description && (
                      <button 
                        onClick={() => setSelectedSeason(null)}
                        style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4a9eff', cursor: 'pointer', fontSize: '14px' }}
                      >
                        ← Back to Show
                      </button>
                    )}
                  </div>
                  {selectedShow.description && (
                    <div className="video-description" style={{ marginBottom: '24px' }}>{selectedShow.description}</div>
                  )}
                  <div className="album-grid">
                    {currentShow?.seasons?.map((season) => (
                      <div
                        key={season.id}
                        className="album-card"
                        onClick={() => setSelectedSeason(season)}
                      >
                        {season.poster_path || selectedShow.poster_path ? (
                          <img
                            src={season.poster_path || selectedShow.poster_path}
                            alt={`Season ${season.season_number}`}
                            className="album-card-img"
                          />
                        ) : (
                          <div className="album-card-placeholder">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 12l3 3.72L15 12l4 5H5l4-5z"/>
                            </svg>
                          </div>
                        )}
                        <div className="album-card-title">Season {season.season_number}</div>
                        <div className="album-card-meta">{season.episodes?.length || 0} episodes</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TV Show - Episodes List */}
              {selectedShow && selectedSeason && (
                <div className="album-section">
                  <div className="album-section-title">
                    Episodes
                    <button 
                      onClick={() => setSelectedSeason(null)}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#4a9eff', cursor: 'pointer', fontSize: '14px' }}
                    >
                      ← Back to Seasons
                    </button>
                  </div>
                  <div className="tracklist-header" style={{ display: 'grid', gridTemplateColumns: '40px 60px 1fr 140px', gap: '15px' }}>
                    <span className="col-cast-btn"></span>
                    <span className="col-index">#</span>
                    <span className="col-title">Title</span>
                    <span className="col-length-wide">Duration</span>
                  </div>
                  {currentSeason?.episodes
                    ?.sort((a, b) => (a.episode_number || 0) - (b.episode_number || 0))
                    .map((episode, idx) => (
                    <div
                      key={episode.id}
                      className="track-row episode-row-item"
                      style={{ display: 'grid', gridTemplateColumns: '40px 60px 1fr 140px', gap: '15px', alignItems: 'center' }}
                    >
                      {castAvailable && (
                        <span className="col-cast-btn">
                          <button
                            className="cast-episode-btn"
                            onClick={async (e) => {
                              e.stopPropagation();
                              window.__justCastFromList = true;
                              const response = await fetch('/api/system/network-info');
                              const networkInfo = await response.json();
                              const protocol = window.location.protocol;
                              const host = `${networkInfo.network_ip}:${networkInfo.port}`;
                              const episodeUrl = `${protocol}//${host}/api/video/stream/${episode.id}`;
                              const episodeTitle = `${selectedShow.title} - S${currentSeason.season_number}E${episode.episode_number} - ${episode.title || 'Episode ' + episode.episode_number}`;
                              castVideo(episodeUrl, episodeTitle, null, 0);
                            }}
                            title="Cast this episode"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                            </svg>
                          </button>
                        </span>
                      )}
                      <span 
                        className="col-index"
                        onClick={() => setPlayingVideo({
                          id: episode.id,
                          title: `${selectedShow.title} - S${currentSeason.season_number}E${episode.episode_number} - ${episode.title || 'Episode ' + episode.episode_number}`,
                          type: 'episode'
                        })}
                        style={{ cursor: 'pointer' }}
                      >
                        <span className="play-btn-inline">▶</span>
                        {episode.episode_number}
                      </span>
                      <span 
                        className="col-title"
                        onClick={() => setPlayingVideo({
                          id: episode.id,
                          title: `${selectedShow.title} - S${currentSeason.season_number}E${episode.episode_number} - ${episode.title || 'Episode ' + episode.episode_number}`,
                          type: 'episode'
                        })}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="title-main">{episode.title || `Episode ${episode.episode_number}`}</div>
                      </span>
                      <span className="col-length-wide">{episode.duration ? formatDuration(episode.duration) : '-'}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty State */}
              {!selectedMovie && !selectedShow && (
                <div className="music-empty">
                  {viewMode === 'movies' 
                    ? filteredMovies.length > 0 
                      ? 'Select a movie to view details' 
                      : 'No movies in library. Scan your video directory in Settings.'
                    : filteredTVShows.length > 0
                      ? 'Select a TV show to view details'
                      : 'No TV shows in library. Scan your video directory in Settings.'
                  }
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="music-bottom-spacer" />

      {/* Video Player */}
      {playingVideo && (
        <VideoPlayer
          videoId={playingVideo.id}
          title={playingVideo.title}
          type={playingVideo.type}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </div>
  );
}
