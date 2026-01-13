import { useState, useEffect, useRef, useMemo } from 'react';
import { musicAPI, videoAPI } from '../services/api';
import { chatAPI } from '../services/api';
import { usePersonas } from '../hooks/usePersonas';

export function SearchOverlay({ activePage, onClose, searchQuery: initialQuery = '', onSearchChange, selectedUser }) {
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [results, setResults] = useState([]);
  const [library, setLibrary] = useState(null);
  const [chatSessions, setChatSessions] = useState([]);
  const [sessionTitles, setSessionTitles] = useState({});
  const [sessionPresets, setSessionPresets] = useState({});
  const [promptPresets, setPromptPresets] = useState([]);
  const [messageSearchSessions, setMessageSearchSessions] = useState([]); // Array of {session_id, snippets}
  const inputRef = useRef(null);
  const { currentTitle } = usePersonas();

  // Load data based on active page
  useEffect(() => {
    const loadData = async () => {
      if (activePage === 'music') {
        try {
          const res = await musicAPI.getLibrary();
          if (res?.success) {
            setLibrary(res.artists || []);
          }
        } catch (err) {
          console.error('Error loading music library:', err);
        }
      } else if (activePage === 'chat') {
        try {
          const sessionsRes = await chatAPI.getSessions(selectedUser?.id);
          if (sessionsRes?.success) {
            const sessions = sessionsRes.sessions || [];
            setChatSessions(sessions.map(s => s.session_id));
            const titles = {};
            sessions.forEach(s => {
              if (s.title) titles[s.session_id] = s.title;
            });
            setSessionTitles(titles);
          }
          
          // Load prompt presets
          try {
            const presetsRes = await fetch('/api/prompt-presets');
            const presetsData = await presetsRes.json();
            if (presetsData?.success) {
              setPromptPresets(presetsData.presets || []);
            }
          } catch (err) {
            console.error('Error loading presets:', err);
          }
        } catch (err) {
          console.error('Error loading chat sessions:', err);
        }
      } else if (activePage === 'videos') {
        try {
          const res = await videoAPI.getLibrary();
          if (res?.success) {
            setLibrary({
              movies: res.movies || [],
              tvShows: res.tv_shows || []
            });
          }
        } catch (err) {
          console.error('Error loading video library:', err);
        }
      }
    };
    
    loadData();
  }, [activePage, selectedUser]);

  useEffect(() => {
    // Focus input when overlay opens
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    // Update parent search query
    if (onSearchChange) {
      onSearchChange(searchQuery);
    }
  }, [searchQuery, onSearchChange]);

  // Search messages when on chat page and query changes
  useEffect(() => {
    const searchMessages = async () => {
      if (activePage === 'chat' && searchQuery.trim()) {
        try {
          const result = await chatAPI.searchMessages(searchQuery.trim(), selectedUser?.id, 50);
          if (result?.success) {
            // result.sessions is now an array of {session_id, snippets}
            setMessageSearchSessions(result.sessions || []);
          } else {
            setMessageSearchSessions([]);
          }
        } catch (err) {
          console.error('Error searching messages:', err);
          setMessageSearchSessions([]);
        }
      } else {
        setMessageSearchSessions([]);
      }
    };
    
    // Debounce the search
    const timeoutId = setTimeout(searchMessages, 300);
    return () => clearTimeout(timeoutId);
  }, [activePage, searchQuery, selectedUser]);

  // Helper functions for music
  const getArtistImage = (artist) => {
    if (!artist || !artist.albums || artist.albums.length === 0) return null;
    const firstAlbum = artist.albums[0];
    return firstAlbum.image || firstAlbum.cover_path || firstAlbum.coverPath || firstAlbum.image_path || firstAlbum.imagePath;
  };

  const normalizeMusicPath = (path) => {
    if (!path) return '';
    // Remove leading ./ or .\ if present
    return path.replace(/^[.\/\\]+/, '');
  };

  // Music search results
  const musicResults = useMemo(() => {
    if (activePage !== 'music' || !library || !Array.isArray(library) || !searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    const results = [];
    
    library.forEach(artist => {
      if (artist.name?.toLowerCase().includes(query)) {
        const artistImg = getArtistImage(artist);
        results.push({
          title: artist.name,
          subtitle: 'Artist',
          image: artistImg ? `/api/music/stream?path=${encodeURIComponent(normalizeMusicPath(artistImg))}` : null,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('musicNavigate', { detail: { type: 'artist', name: artist.name } }));
            onClose();
          }
        });
      }
      
      artist.albums?.forEach(album => {
        if (album.name?.toLowerCase().includes(query)) {
          const albumImg = album.image || album.cover_path || album.coverPath || album.image_path || album.imagePath;
          results.push({
            title: album.name,
            subtitle: `Album by ${artist.name}`,
            image: albumImg ? `/api/music/stream?path=${encodeURIComponent(normalizeMusicPath(albumImg))}` : null,
            onClick: () => {
              window.dispatchEvent(new CustomEvent('musicNavigate', { detail: { type: 'album', artist: artist.name, album: album.name } }));
              onClose();
            }
          });
        }
        
        album.songs?.slice(0, 5).forEach(song => {
          if ((song.name?.toLowerCase().includes(query) || song.title?.toLowerCase().includes(query))) {
            const artistImg = getArtistImage(artist);
            results.push({
              title: song.name || song.title,
              subtitle: `${album.name} • ${artist.name}`,
              image: artistImg ? `/api/music/stream?path=${encodeURIComponent(normalizeMusicPath(artistImg))}` : null,
              onClick: () => {
                window.dispatchEvent(new CustomEvent('musicNavigate', { detail: { type: 'song', artist: artist.name, album: album.name, song: song.name || song.title } }));
                onClose();
              }
            });
          }
        });
      });
    });
    
    return results.slice(0, 20);
  }, [activePage, library, searchQuery, onClose]);

  // Chat search results - combines title search and message content search
  const chatResults = useMemo(() => {
    if (activePage !== 'chat' || !chatSessions || !searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    const getSessionDisplayName = (sessionId) => {
      if (sessionTitles?.[sessionId]) {
        return sessionTitles[sessionId];
      }
      if (sessionId.startsWith('chat-')) {
        const timestamp = sessionId.replace('chat-', '');
        return `Chat ${timestamp}`;
      }
      return sessionId;
    };
    
    // Get sessions matching by title
    const titleMatchedSessions = chatSessions.filter((session) => {
      const title = sessionTitles?.[session] || getSessionDisplayName(session) || session;
      return title.toLowerCase().includes(query);
    });
    
    // Get session IDs from message search results
    const messageMatchedSessionIds = new Set(
      messageSearchSessions.map(s => s.session_id || s)
    );
    
    // Combine with message search results (remove duplicates)
    const allMatchingSessions = new Set([
      ...titleMatchedSessions,
      ...Array.from(messageMatchedSessionIds)
    ]);
    
    // Helper function to highlight search term in text
    const highlightText = (text, searchTerm) => {
      if (!text || !searchTerm) return text;
      const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      const parts = text.split(regex);
      return parts.map((part, index) => {
        if (part.toLowerCase() === searchTerm.toLowerCase()) {
          return <mark key={index} style={{ 
            background: 'rgba(102, 126, 234, 0.4)', 
            color: '#fff',
            padding: '2px 4px',
            borderRadius: '3px'
          }}>{part}</mark>;
        }
        return part;
      });
    };
    
    // Convert to array and create results
    return Array.from(allMatchingSessions).slice(0, 20).map(session => {
      const sessionPreset = sessionPresets?.[session];
      let contextInfo = currentTitle || 'System persona';
      
      if (sessionPreset && !sessionPreset.useSystemContext && sessionPreset.presetId) {
        const preset = promptPresets?.find(p => p.id === sessionPreset.presetId);
        if (preset) {
          contextInfo = preset.name;
        }
      }
      
      // Determine if match was from title or message content
      const matchedByTitle = titleMatchedSessions.includes(session);
      const messageSearchData = messageSearchSessions.find(s => (s.session_id || s) === session);
      const matchedByMessage = !!messageSearchData;
      
      // Get snippets if available
      const snippets = messageSearchData?.snippets || [];
      
      return {
        title: sessionTitles?.[session] || getSessionDisplayName(session) || session,
        subtitle: contextInfo,
        snippets: snippets,
        searchTerm: query,
        matchedByMessage: matchedByMessage,
        onClick: () => {
          // Navigate to chat and select session
          window.dispatchEvent(new CustomEvent('chatSelectSession', { detail: { sessionId: session } }));
          onClose();
        }
      };
    });
  }, [activePage, chatSessions, sessionTitles, sessionPresets, promptPresets, currentTitle, searchQuery, messageSearchSessions, onClose]);

  // Video search results (excluding cast/crew - only title and genre)
  const videoResults = useMemo(() => {
    if (activePage !== 'videos' || !library || !searchQuery.trim()) return [];
    
    const query = searchQuery.toLowerCase();
    const results = [];
    
    // Movies by title and genre only (no cast/crew)
    if (library.movies) {
      library.movies.forEach(movie => {
        const titleMatch = movie.title?.toLowerCase().includes(query);
        const genreMatch = movie.extra_metadata?.genres?.some(genre => 
          genre.toLowerCase().includes(query)
        );
        
        if (titleMatch || genreMatch) {
          results.push({
            title: movie.title,
            subtitle: movie.year ? `${movie.year} • Movie` : 'Movie',
            image: movie.poster_path || null,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('videoSelect', { detail: { type: 'movie', movie: movie } }));
            onClose();
          }
          });
        }
      });
    }
    
    // TV shows by title and genre only
    if (library.tvShows) {
      library.tvShows.forEach(show => {
        const titleMatch = show.title?.toLowerCase().includes(query);
        const genreMatch = show.extra_metadata?.genres?.some(genre => 
          genre.toLowerCase().includes(query)
        );
        
        if (titleMatch || genreMatch) {
          results.push({
            title: show.title,
            subtitle: show.year ? `${show.year} • TV Show` : 'TV Show',
            image: show.poster_path || null,
          onClick: () => {
            window.dispatchEvent(new CustomEvent('videoSelect', { detail: { type: 'tvshow', show: show } }));
            onClose();
          }
          });
        }
      });
    }
    
    return results.slice(0, 20);
  }, [activePage, library, searchQuery, onClose]);

  // Combine results based on active page
  useEffect(() => {
    if (activePage === 'music') {
      setResults(musicResults);
    } else if (activePage === 'chat') {
      setResults(chatResults);
    } else if (activePage === 'videos') {
      setResults(videoResults);
    } else {
      setResults([]);
    }
  }, [activePage, musicResults, chatResults, videoResults]);

  const handleKeyDown = (e) => {
    // ESC key closing removed per user request
  };

  return (
    <div 
      style={{
        position: 'fixed',
        left: '60px', // Start after sidebar
        top: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.95)',
        zIndex: 10000,
        display: 'flex',
        flexDirection: 'column',
        padding: '40px'
      }}
    >
      {/* Search Input */}
      <div style={{ marginBottom: '40px' }}>
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Search ${activePage}...`}
          style={{
            width: '100%',
            maxWidth: '800px',
            padding: '12px 0',
            fontSize: '2rem',
            background: 'transparent',
            border: 'none',
            borderBottom: '2px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '0',
            color: '#fff',
            outline: 'none',
            transition: 'border-color 0.2s ease'
          }}
          onFocus={(e) => {
            e.target.style.borderBottomColor = 'rgba(102, 126, 234, 0.8)';
          }}
          onBlur={(e) => {
            e.target.style.borderBottomColor = 'rgba(255, 255, 255, 0.3)';
          }}
        />
        <div style={{ 
          marginTop: '12px', 
          color: '#9da7b8', 
          fontSize: '0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {searchQuery && (
            <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      {/* Results */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        paddingRight: '20px'
      }}>
        {!searchQuery.trim() ? (
          <div style={{
            textAlign: 'center',
            color: '#9da7b8',
            fontSize: '1.1rem',
            marginTop: '100px'
          }}>
            Start typing to search...
          </div>
        ) : results.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#9da7b8',
            fontSize: '1.1rem',
            marginTop: '100px'
          }}>
            No results found
          </div>
        ) : (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px'
          }}>
            {results.map((result, index) => (
              <div
                key={index}
                onClick={result.onClick}
                style={{
                  padding: '16px 20px',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                }}
              >
                {result.image && (
                  <img
                    src={result.image}
                    alt={result.title}
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '8px',
                      objectFit: 'cover',
                      flexShrink: 0
                    }}
                    onError={(e) => {
                      e.target.style.display = 'none';
                    }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: '500',
                    marginBottom: '4px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {result.title}
                  </div>
                  {result.subtitle && (
                    <div style={{
                      color: '#9da7b8',
                      fontSize: '0.85rem',
                      marginBottom: result.snippets && result.snippets.length > 0 ? '8px' : '0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {result.subtitle}
                    </div>
                  )}
                  {result.snippets && result.snippets.length > 0 && result.searchTerm && (
                    <div style={{
                      marginTop: '8px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      {result.snippets.slice(0, 2).map((snippet, snippetIndex) => {
                        // Highlight search term in snippet
                        const parts = snippet.split(new RegExp(`(${result.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
                        return (
                          <div
                            key={snippetIndex}
                            style={{
                              color: '#9da7b8',
                              fontSize: '0.8rem',
                              lineHeight: '1.4',
                              fontStyle: 'italic'
                            }}
                          >
                            {parts.map((part, partIndex) => {
                              if (part.toLowerCase() === result.searchTerm.toLowerCase()) {
                                return (
                                  <mark
                                    key={partIndex}
                                    style={{
                                      background: 'rgba(102, 126, 234, 0.5)',
                                      color: '#fff',
                                      padding: '1px 3px',
                                      borderRadius: '3px',
                                      fontWeight: '500'
                                    }}
                                  >
                                    {part}
                                  </mark>
                                );
                              }
                              return <span key={partIndex}>{part}</span>;
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
