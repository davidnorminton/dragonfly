import { useEffect, useState, useMemo, useRef } from 'react';
import { videoAPI } from '../services/api';
import { VideoPlayer } from '../components/VideoPlayer';
import { useChromecast } from '../hooks/useChromecast';

// Cast and Crew Component
function CastAndCrew({ movieTitle, movieYear, showTitle, showYear, isMovie = true }) {
  const [castCrew, setCastCrew] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filmography, setFilmography] = useState(null);
  const [loadingFilmography, setLoadingFilmography] = useState(false);

  const title = isMovie ? movieTitle : showTitle;
  const year = isMovie ? movieYear : showYear;

  // Reset and auto-load cast/crew when movie/show changes
  useEffect(() => {
    console.log(`🎬 [Cast & Crew] ${isMovie ? 'Movie' : 'TV Show'} changed, auto-loading cast & crew`);
    setCastCrew(null);
    setError(null);
    setFilmography(null);
    
    // Auto-load cast & crew
    if (title && year) {
      loadCastCrew();
    }
  }, [title, year, isMovie]);

  const loadCastCrew = async () => {
    console.log('🎬 [Cast & Crew] Generate button clicked');
    console.log(`🎬 [Cast & Crew] ${isMovie ? 'Movie' : 'TV Show'}:`, title, 'Year:', year);
    
    setLoading(true);
    setCastCrew(null);
    setError(null);
    
    try {
      console.log('🎬 [Cast & Crew] Fetching cast and crew data...');
      const data = isMovie 
        ? await videoAPI.getCastCrew(title, year)
        : await videoAPI.getTVCastCrew(title, year);
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
          <div className="loading-indicator">
            <div className="spinner"></div>
            <span>Loading cast and crew...</span>
          </div>
        </div>
      )}
      
      {error && !loading && (
        <div className="cast-crew-error">
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

        {/* Crew (Director/Creator, Writer, Producer) */}
        <div className="crew-section">
          <div className="crew-role-label">Crew</div>
          <div className="crew-horizontal">
            {/* Director (for movies) or Creator (for TV shows) */}
            {((isMovie && castCrew.director) || (!isMovie && castCrew.creator)) && (
              (() => {
                const person = isMovie ? castCrew.director : castCrew.creator;
                const roleText = isMovie ? 'Director' : 'Creator';
                const roleKey = isMovie ? 'director' : 'creator';
                
                if (!person || !person.name || person.name === 'Unknown') return null;
                
                return (
                  <div className="crew-card">
                    <div className="crew-image-wrapper">
                      {person.profile_path ? (
                        <img 
                          src={person.profile_path} 
                          alt={person.name}
                          className="crew-image"
                        />
                      ) : (
                        <div className="crew-image-placeholder">
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                          </svg>
                        </div>
                      )}
                      <button 
                        className="filmography-btn-overlay"
                        onClick={() => handlePersonClick(person.name, roleKey)}
                        title={`View ${person.name}'s filmography`}
                      >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                        </svg>
                      </button>
                    </div>
                    <div className="crew-info">
                      <div className="crew-name">{person.name}</div>
                      <div className="crew-role">{roleText}</div>
                    </div>
                  </div>
                );
              })()
            )}

            {castCrew.writer && castCrew.writer?.name && castCrew.writer.name !== 'Unknown' && (
              <div className="crew-card">
                <div className="crew-image-wrapper">
                  {castCrew.writer.profile_path ? (
                    <img 
                      src={castCrew.writer.profile_path} 
                      alt={castCrew.writer.name}
                      className="crew-image"
                    />
                  ) : (
                    <div className="crew-image-placeholder">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    </div>
                  )}
                  <button 
                    className="filmography-btn-overlay"
                    onClick={() => handlePersonClick(castCrew.writer.name, 'writer')}
                    title={`View ${castCrew.writer.name}'s filmography`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                  </button>
                </div>
                <div className="crew-info">
                  <div className="crew-name">{castCrew.writer.name}</div>
                  <div className="crew-role">Writer</div>
                </div>
              </div>
            )}

            {castCrew.producer && castCrew.producer?.name && castCrew.producer.name !== 'Unknown' && (
              <div className="crew-card">
                <div className="crew-image-wrapper">
                  {castCrew.producer.profile_path ? (
                    <img 
                      src={castCrew.producer.profile_path} 
                      alt={castCrew.producer.name}
                      className="crew-image"
                    />
                  ) : (
                    <div className="crew-image-placeholder">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    </div>
                  )}
                  <button 
                    className="filmography-btn-overlay"
                    onClick={() => handlePersonClick(castCrew.producer.name, 'producer')}
                    title={`View ${castCrew.producer.name}'s filmography`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                    </svg>
                  </button>
                </div>
                <div className="crew-info">
                  <div className="crew-name">{castCrew.producer.name}</div>
                  <div className="crew-role">Producer</div>
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

// Similar Content Component
function SimilarContent({ contentType, contentId, title, year, description, genres, isMovie = true }) {
  const [similarItems, setSimilarItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generating, setGenerating] = useState(false);

  // Load similar content on mount and when contentId/contentType changes
  useEffect(() => {
    // Reset state when content changes
    setSimilarItems([]);
    setError(null);
    setLoading(false);
    setGenerating(false);
    
    if (contentId) {
      loadSimilarContent();
    }
  }, [contentId, contentType]);

  const loadSimilarContent = async () => {
    if (!contentId) {
      setSimilarItems([]);
      return;
    }
    
    setLoading(true);
    setError(null);
    setSimilarItems([]); // Clear previous items
    
    try {
      const result = await videoAPI.getSimilarContent(contentType, contentId);
      if (result.success && result.similar_items) {
        // Always set the items, even if empty array
        setSimilarItems(result.similar_items);
      } else {
        setSimilarItems([]);
      }
    } catch (err) {
      console.error('Error loading similar content:', err);
      setError(err.message);
      setSimilarItems([]);
    } finally {
      setLoading(false);
    }
  };

  const generateSimilar = async () => {
    if (!contentId || !title) return;
    
    setGenerating(true);
    setError(null);
    setSimilarItems([]); // Clear previous items before generating
    
    try {
      const result = await videoAPI.generateSimilarContent(
        contentType,
        contentId,
        title,
        year,
        description || '',
        genres || []
      );
      
      if (result.success && result.similar_items) {
        setSimilarItems(result.similar_items);
      } else {
        setSimilarItems([]);
      }
    } catch (err) {
      console.error('Error generating similar content:', err);
      setError(err.message);
      setSimilarItems([]);
    } finally {
      setGenerating(false);
    }
  };

  // Don't show if no content selected
  if (!contentId) return null;

  return (
    <div className="cast-crew-section">
      <div className="crew-section">
        <div className="crew-role-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Similar {isMovie ? 'Movies' : 'TV Shows'}</span>
          {similarItems.length === 0 && !loading && !generating && (
            <button
              className="retry-btn"
              onClick={generateSimilar}
              style={{ fontSize: '0.9em', padding: '6px 12px' }}
            >
              Generate
            </button>
          )}
        </div>

        {loading && (
          <div className="cast-crew-loading">
            <div className="loading-indicator">
              <div className="spinner"></div>
              <span>Loading similar {isMovie ? 'movies' : 'shows'}...</span>
            </div>
          </div>
        )}

        {generating && (
          <div className="cast-crew-loading">
            <div className="loading-indicator">
              <div className="spinner"></div>
              <span>Generating similar {isMovie ? 'movies' : 'shows'}...</span>
            </div>
          </div>
        )}

        {error && !loading && !generating && (
          <div className="cast-crew-error">
            <div className="error-indicator">
              <span>{error}</span>
              <button className="retry-btn" onClick={generateSimilar}>
                Retry
              </button>
            </div>
          </div>
        )}

        {!loading && !generating && similarItems.length > 0 && (
          <div className="similar-content-list">
            {similarItems.map((item, idx) => (
              <div key={idx} className="similar-item">
                <div className="similar-item-content">
                  {item.poster_path && (
                    <div className="similar-item-poster">
                      <img 
                        src={item.poster_path} 
                        alt={item.db_title || item.title}
                        className="similar-item-poster-img"
                      />
                    </div>
                  )}
                  <div className="similar-item-info">
                    <div className="similar-item-title">
                      <strong>{item.db_title || item.title}</strong>
                      {item.year && <span className="similar-item-year"> ({item.year})</span>}
                      {item.in_library && (
                        <span className="similar-item-badge" title="Available in your library">✓</span>
                      )}
                    </div>
                    {item.description && (
                      <div className="similar-item-description">{item.description}</div>
                    )}
                    {item.reason && (
                      <div className="similar-item-reason">{item.reason}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && !generating && similarItems.length === 0 && !error && (
          <div className="cast-crew-error">
            <div className="error-indicator">
              <span>No similar {isMovie ? 'movies' : 'shows'} found. Click Generate to create recommendations.</span>
            </div>
          </div>
        )}
      </div>
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
  const [isScrolled, setIsScrolled] = useState(false);
  
  const { castAvailable, castVideo } = useChromecast();
  
  const heroRef = useRef(null);
  const mainContentRef = useRef(null);

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

  // Listen for video selection from search overlay
  useEffect(() => {
    const handleVideoSelect = (e) => {
      const { type, movie, show } = e.detail;
      if (type === 'movie' && movie) {
        setSelectedMovie(movie);
        setSelectedShow(null);
        setSelectedSeason(null);
      } else if (type === 'tvshow' && show) {
        setSelectedShow(show);
        setSelectedSeason(null);
        setSelectedMovie(null);
      }
    };
    
    window.addEventListener('videoSelect', handleVideoSelect);
    return () => window.removeEventListener('videoSelect', handleVideoSelect);
  }, []);

  // Filter library based on search query
  // Actor search results state
  const [actorSearchResults, setActorSearchResults] = useState([]);

  // Fetch actor search results when query changes
  useEffect(() => {
    const fetchActorResults = async () => {
      if (!searchQuery || !searchQuery.trim() || searchQuery.length < 2) {
        setActorSearchResults([]);
        return;
      }
      
      try {
        const res = await videoAPI.searchByActor(searchQuery);
        if (res?.success && res.movies) {
          setActorSearchResults(res.movies);
        }
      } catch (error) {
        console.error('Error searching by actor:', error);
        setActorSearchResults([]);
      }
    };
    
    const debounce = setTimeout(fetchActorResults, 300);
    return () => clearTimeout(debounce);
  }, [searchQuery]);

  const filteredMovies = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return library.movies;
    const query = searchQuery.toLowerCase();
    
    // Priority 1: Movies matching by title
    const titleMatches = library.movies.filter(movie =>
      movie.title?.toLowerCase().includes(query)
    );
    
    // Priority 4: Movies matching by genre
    const genreMatches = library.movies.filter(movie => {
      if (movie.extra_metadata?.genres) {
        const genres = Array.isArray(movie.extra_metadata.genres) 
          ? movie.extra_metadata.genres 
          : [];
        return genres.some(genre => genre.toLowerCase().includes(query));
      }
      return false;
    });
    
    // Priority 5: Movies matching by actor
    const actorMovieTitles = new Set(actorSearchResults.map(m => `${m.title}-${m.year}`));
    const actorMatches = library.movies.filter(movie => 
      actorMovieTitles.has(`${movie.title}-${movie.year}`)
    );
    
    // Combine with priority order and deduplicate
    const seen = new Set();
    const allMovies = [];
    
    [titleMatches, genreMatches, actorMatches].forEach(group => {
      group.forEach(movie => {
        if (!seen.has(movie.id)) {
          seen.add(movie.id);
          allMovies.push(movie);
        }
      });
    });
    
    return allMovies;
  }, [library.movies, searchQuery, actorSearchResults]);

  const filteredTVShows = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return library.tvShows;
    const query = searchQuery.toLowerCase();
    
    // Priority 2: TV shows matching by title
    const titleMatches = library.tvShows.filter(show =>
      show.title?.toLowerCase().includes(query)
    );
    
    // Priority 4: TV shows matching by genre (same priority as movie genres)
    const genreMatches = library.tvShows.filter(show => {
      if (show.extra_metadata?.genres) {
        const genres = Array.isArray(show.extra_metadata.genres) 
          ? show.extra_metadata.genres 
          : [];
        return genres.some(genre => genre.toLowerCase().includes(query));
      }
      return false;
    });
    
    // Combine with priority order and deduplicate
    const seen = new Set();
    const allShows = [];
    
    [titleMatches, genreMatches].forEach(group => {
      group.forEach(show => {
        if (!seen.has(show.id)) {
          seen.add(show.id);
          allShows.push(show);
        }
      });
    });
    
    return allShows;
  }, [library.tvShows, searchQuery]);

  // Filter episodes across all TV shows
  const filteredEpisodes = useMemo(() => {
    if (!searchQuery || !searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    const episodes = [];
    
    library.tvShows.forEach(show => {
      show.seasons?.forEach(season => {
        season.episodes?.forEach(episode => {
          // Search in episode title and description
          if (episode.title?.toLowerCase().includes(query) ||
              episode.description?.toLowerCase().includes(query) ||
              episode.episode_number?.toString().includes(query)) {
            episodes.push({
              ...episode,
              showTitle: show.title,
              showId: show.id,
              seasonNumber: season.season_number,
              seasonId: season.id,
              showPoster: show.poster_path
            });
          }
        });
      });
    });
    
    return episodes;
  }, [library.tvShows, searchQuery]);

  // Compute search results for dropdown with separate sections
  useEffect(() => {
    if (!onSearchResultsChange) return;

    if (!searchQuery || !searchQuery.trim()) {
      onSearchResultsChange([]);
      return;
    }

    const results = [];

    // Add movies section if there are movie results
    const movieResults = filteredMovies.slice(0, 5);
    if (movieResults.length > 0) {
      results.push({
        type: 'section',
        title: 'Movies'
      });
      
      movieResults.forEach(movie => {
        results.push({
          type: 'item',
          title: movie.title,
          subtitle: movie.year ? `${movie.year}` : '',
          image: movie.poster_path,
          onClick: () => {
            setViewMode('movies');
            setSelectedMovie(movie);
          }
        });
      });
    }

    // Add TV shows section if there are TV show results
    const tvResults = filteredTVShows.slice(0, 5);
    if (tvResults.length > 0) {
      results.push({
        type: 'section',
        title: 'TV Shows'
      });
      
      tvResults.forEach(show => {
        results.push({
          type: 'item',
          title: show.title,
          subtitle: show.year ? `${show.year}` : '',
          image: show.poster_path,
          onClick: () => {
            setViewMode('tvshows');
            setSelectedShow(show);
            setSelectedSeason(null);
            setSelectedMovie(null);
          }
        });
      });
    }

    // Add episodes section if there are episode results
    const episodeResults = filteredEpisodes.slice(0, 8);
    if (episodeResults.length > 0) {
      results.push({
        type: 'section',
        title: 'Episodes'
      });
      
      episodeResults.forEach(episode => {
        results.push({
          type: 'item',
          title: episode.title || `Episode ${episode.episode_number}`,
          subtitle: `${episode.showTitle} - S${episode.seasonNumber}E${episode.episode_number}`,
          image: episode.showPoster,
          onClick: () => {
            // Find the show and season
            const show = library.tvShows.find(s => s.id === episode.showId);
            const season = show?.seasons?.find(s => s.id === episode.seasonId);
            
            if (show && season) {
              setViewMode('tvshows');
              setSelectedShow(show);
              setSelectedSeason(season);
              setSelectedMovie(null);
              
              // Scroll to episode or highlight it
              setTimeout(() => {
                const episodeElement = document.querySelector(`[data-episode-id="${episode.id}"]`);
                if (episodeElement) {
                  episodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 100);
            }
          }
        });
      });
    }

    onSearchResultsChange(results);
  }, [searchQuery, filteredMovies, filteredTVShows, filteredEpisodes, library.tvShows, onSearchResultsChange]);

  // Scroll detection for showing minimal hero
  useEffect(() => {
    if (!heroRef.current || !mainContentRef.current) return;

    // Show minimal hero when main hero's play button reaches the top
    // Main hero height: ~280px, minimal hero height: 64px
    // Threshold: when scrolled ~220px
    const stickThreshold = 220; // Show minimal hero
    const unstickThreshold = 200; // Hide minimal hero

    const handleScroll = () => {
      if (!mainContentRef.current) return;
      
      const scrollTop = mainContentRef.current.scrollTop;
      
      // Use hysteresis to prevent flickering at the boundary
      setIsScrolled((prevScrolled) => {
        if (scrollTop >= stickThreshold) {
          return true; // Show minimal hero
        } else if (scrollTop <= unstickThreshold) {
          return false; // Hide minimal hero
        }
        // Between thresholds: maintain current state
        return prevScrolled;
      });
    };

    const mainContent = mainContentRef.current;
    mainContent.addEventListener('scroll', handleScroll, { passive: true });
    
    return () => {
      mainContent.removeEventListener('scroll', handleScroll);
    };
  }, [selectedMovie, selectedShow, selectedSeason]);

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
        <div className="music-main" ref={mainContentRef}>
          {/* Minimal sticky hero - shows when scrolled */}
          {(selectedMovie || (selectedShow && currentSeason)) && (
            <div className={`music-hero-minimal ${isScrolled ? 'visible' : ''}`}>
              {selectedMovie && (
                <>
                  <button
                    className="hero-play-minimal"
                    onClick={() => setPlayingVideo({ 
                      id: selectedMovie.id, 
                      title: selectedMovie.title,
                      type: 'movie'
                    })}
                    title="Play Movie"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                  {castAvailable && (
                    <button
                      className="hero-cast-minimal"
                      onClick={async () => {
                        window.__justCastFromList = true;
                        const response = await fetch('/api/system/network-info');
                        const networkInfo = await response.json();
                        const protocol = window.location.protocol;
                        const host = `${networkInfo.network_ip}:${networkInfo.port}`;
                        const movieUrl = `${protocol}//${host}/api/video/stream/${selectedMovie.id}`;
                        castVideo(movieUrl, selectedMovie.title, null, 0);
                      }}
                      title="Cast Movie"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                      </svg>
                    </button>
                  )}
                  <h2 className="hero-title-minimal">{heroTitle}</h2>
                </>
              )}
              {selectedShow && currentSeason && currentSeason.episodes?.length > 0 && (
                <>
                  <button
                    className="hero-play-minimal"
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
                    title="Play Episode 1"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </button>
                  {castAvailable && (
                    <button
                      className="hero-cast-minimal"
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
                      title="Cast Episode 1"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/>
                      </svg>
                    </button>
                  )}
                  <h2 className="hero-title-minimal">{heroTitle}</h2>
                </>
              )}
            </div>
          )}

          {/* Main full-size hero - scrolls normally */}
          <div ref={heroRef} className="music-hero" style={heroBgStyle}>
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
                  
                  {/* Similar Movies Section */}
                  <SimilarContent
                    contentType="movie"
                    contentId={selectedMovie.id}
                    title={selectedMovie.title}
                    year={selectedMovie.year}
                    description={selectedMovie.description || selectedMovie.metadata?.description || selectedMovie.extra_metadata?.description || ''}
                    genres={selectedMovie.metadata?.genres || selectedMovie.extra_metadata?.genres || []}
                    isMovie={true}
                  />
                </div>
              )}

              {/* TV Show - Seasons Grid */}
              {selectedShow && !selectedSeason && (
                <>
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
                  
                  {/* TV Show Cast & Crew */}
                  <CastAndCrew
                    showTitle={selectedShow.title}
                    showYear={selectedShow.year}
                    isMovie={false}
                  />
                  
                  {/* Similar TV Shows Section */}
                  <SimilarContent
                    contentType="tv_show"
                    contentId={selectedShow.id}
                    title={selectedShow.title}
                    year={selectedShow.year}
                    description={selectedShow.description || selectedShow.extra_metadata?.description || ''}
                    genres={selectedShow.extra_metadata?.genres || []}
                    isMovie={false}
                  />
                </>
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
                      data-episode-id={episode.id}
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
