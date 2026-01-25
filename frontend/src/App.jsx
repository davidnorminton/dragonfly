import { useState, useEffect, useRef } from 'react';
import { SideNav } from './components/SideNav';
import { LeftPanel } from './components/LeftPanel';
import { OctopusEnergy } from './components/OctopusEnergy';
import { ApiHealth } from './components/ApiHealth';
import { usePersonas } from './hooks/usePersonas';
import { useAudioQueue } from './hooks/useAudioQueue';
import { routerAPI, aiAPI, chatAPI } from './services/api';
import { getProfileImageUrl } from './utils/profileImageHelper';
import { MusicPage } from './pages/Music';
import { MusicEditor } from './pages/MusicEditor';
import { VideosPage } from './pages/Videos';
import { AnalyticsPage } from './pages/Analytics';
import { ChatPage } from './pages/Chat';
import { NewsPage } from './pages/News';
import TechNews from './pages/TechNews';
import { StoriesPage } from './pages/Stories';
import { CreateStoryPage } from './pages/CreateStory';
import { StoryViewPage } from './pages/StoryView';
import { CoursesPage } from './pages/Courses';
import { CourseContentsPage } from './pages/CourseContents';
import { LessonViewPage } from './pages/LessonView';
import { SettingsPage } from './pages/Settings';
import { AlertsPage } from './pages/Alerts';
import { UsersPage } from './pages/Users';
import { PersonalPage } from './pages/Personal';
import { PersonalSummariesPage } from './pages/PersonalSummaries';
import { AddUserPage } from './pages/AddUser';
import { EditUserPage } from './pages/EditUser';
import { AIFocusPage } from './pages/AIFocus';
import { GamesPage } from './pages/Games';
import { SpaceInvadersPage } from './pages/SpaceInvaders';
import { PongPage } from './pages/Pong';
import { BreakoutPage } from './pages/Breakout';
import { SnakePage } from './pages/Snake';
import { FlappyBirdPage } from './pages/FlappyBird';
import { TetrisPage } from './pages/Tetris';
import { AsteroidsPage } from './pages/Asteroids';
import { GradiusPage } from './pages/Gradius';
import { PacManPage } from './pages/PacMan';
import { FroggerPage } from './pages/Frogger';
import { CentipedePage } from './pages/Centipede';
import { MissileCommandPage } from './pages/MissileCommand';
import { GoldenAxePage } from './pages/GoldenAxe';
import { SearchOverlay } from './components/SearchOverlay';
import { WaveformMic } from './components/WaveformMic';
import { NightModeButton } from './components/NightModeButton';
import './styles/index.css';

function App() {
  const [sessionId, setSessionId] = useState(() => {
    const stored = localStorage.getItem('chatSessionId');
    if (stored) return stored;
    const newId = `session-${Date.now()}`;
    localStorage.setItem('chatSessionId', newId);
    return newId;
  });
  // Initialize activePage from URL or localStorage
  const [activePage, setActivePage] = useState(() => {
    // Check URL hash first
    const hash = window.location.hash.slice(1);
    if (hash && ['dashboard', 'chat', 'music', 'videos', 'news', 'stories', 'create-story', 'edit-story', 'story-view', 'courses', 'course-contents', 'lesson-view', 'settings', 'alerts', 'personal', 'personal-summaries', 'users', 'add-user', 'edit-user', 'analytics', 'music-editor', 'ai-focus', 'games'].includes(hash)) {
    } else if (hash && hash.startsWith('games/')) {
      return hash;
    } else if (hash && hash.startsWith('games/')) {
      // Handle nested game routes
      return hash;
    }
    // Fallback to localStorage
    const stored = localStorage.getItem('activePage');
    return stored || 'dashboard';
  });
  const [pageData, setPageData] = useState(null); // For passing data to pages like edit-user
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [showLeft, setShowLeft] = useState(true);
  const [selectedUser, setSelectedUser] = useState(() => {
    // Load selected user from localStorage if available
    const stored = localStorage.getItem('selectedUser');
    return stored ? JSON.parse(stored) : null;
  });
  
  // Persist selected user to localStorage
  useEffect(() => {
    if (selectedUser) {
      localStorage.setItem('selectedUser', JSON.stringify(selectedUser));
    } else {
      localStorage.removeItem('selectedUser');
    }
  }, [selectedUser]);

  // Listen for user updates and refresh selectedUser if it's the same user
  useEffect(() => {
    const handleUserUpdate = (event) => {
      const updatedUser = event.detail;
      if (selectedUser && selectedUser.id === updatedUser.id) {
        console.log('Updating selected user with new data:', updatedUser);
        setSelectedUser(updatedUser);
      }
    };
    
    window.addEventListener('userUpdated', handleUserUpdate);
    return () => window.removeEventListener('userUpdated', handleUserUpdate);
  }, [selectedUser]);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      // Check for exact matches first
      if (hash && ['dashboard', 'chat', 'music', 'videos', 'news', 'settings', 'alerts', 'personal', 'personal-summaries', 'users', 'add-user', 'edit-user', 'analytics', 'music-editor', 'ai-focus', 'games', 'stories', 'create-story', 'edit-story', 'story-view', 'courses', 'course-contents', 'lesson-view', 'tech-news'].includes(hash)) {
        setActivePage(hash);
        localStorage.setItem('activePage', hash);
        setSearchOverlayOpen(false);
      } else if (hash && hash.startsWith('games/')) {
        setActivePage(hash);
        localStorage.setItem('activePage', hash);
        setSearchOverlayOpen(false);
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);
  const [musicSearchQuery, setMusicSearchQuery] = useState('');
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [videoSearchQuery, setVideoSearchQuery] = useState('');
  const [techNewsSearchQuery, setTechNewsSearchQuery] = useState('');
  const [musicSearchResults, setMusicSearchResults] = useState([]);
  const [chatSearchResults, setChatSearchResults] = useState([]);
  const [videoSearchResults, setVideoSearchResults] = useState([]);
  const { selectPersona, currentTitle, personas, currentPersona, reload: reloadPersonas } = usePersonas(selectedUser?.id);
  const audioQueue = useAudioQueue();

  // Reload personas when selected user changes
  useEffect(() => {
    if (selectedUser?.id) {
      reloadPersonas();
    }
  }, [selectedUser?.id, reloadPersonas]);

  useEffect(() => {
    // Initialize session ID in localStorage if not present
    if (!localStorage.getItem('chatSessionId')) {
      localStorage.setItem('chatSessionId', sessionId);
    }
  }, [sessionId]);


  return (
    <div className="app-shell">
      <SideNav
        activePage={activePage}
        onNavigate={(page) => {
          setActivePage(page);
          // Update URL hash
          window.location.hash = page;
          // Save to localStorage
          localStorage.setItem('activePage', page);
          // Close search overlay when navigating
          setSearchOverlayOpen(false);
        }}
        onSettingsClick={() => {
          setActivePage('settings');
          window.location.hash = 'settings';
          localStorage.setItem('activePage', 'settings');
          setSearchOverlayOpen(false);
        }}
        selectedUser={selectedUser}
        onSearchClick={() => setSearchOverlayOpen(true)}
      />
      {activePage === 'music' ? (
        <MusicPage 
          sessionId={sessionId}
          audioQueue={audioQueue}
          onMicClick={() => {
            setActivePage('ai-focus');
            window.location.hash = 'ai-focus';
            localStorage.setItem('activePage', 'ai-focus');
          }}
          searchQuery={musicSearchQuery}
          onSearchResultsChange={setMusicSearchResults}
          selectedUser={selectedUser}
        />
      ) : activePage === 'music-editor' ? (
        <MusicEditor />
      ) : activePage === 'videos' ? (
        <VideosPage
          searchQuery={videoSearchQuery}
          onSearchResultsChange={setVideoSearchResults}
          onGenreClick={(genre) => {
            setVideoSearchQuery(genre);
            setSearchOverlayOpen(true);
          }}
        />
      ) : activePage === 'analytics' ? (
        <AnalyticsPage />
      ) : activePage === 'chat' ? (
        <ChatPage 
          sessionId={sessionId}
          onMicClick={() => {
            setActivePage('ai-focus');
            window.location.hash = 'ai-focus';
            localStorage.setItem('activePage', 'ai-focus');
          }}
          searchQuery={chatSearchQuery}
          onSearchResultsChange={setChatSearchResults}
          selectedUser={selectedUser}
        />
      ) : activePage === 'news' ? (
        <NewsPage />
      ) : activePage === 'tech-news' ? (
        <TechNews 
          searchQuery={techNewsSearchQuery}
        />
      ) : activePage === 'stories' ? (
        <StoriesPage
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            if (data) {
              setPageData(data);
            }
          }}
          selectedUser={selectedUser}
        />
      ) : activePage === 'courses' ? (
        <CoursesPage
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            if (data) {
              setPageData(data);
            }
          }}
          selectedUser={selectedUser}
        />
      ) : activePage === 'create-story' ? (
        <CreateStoryPage 
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            if (data) {
              setPageData(data);
            }
          }}
          selectedUser={selectedUser}
        />
      ) : activePage === 'edit-story' ? (
        <CreateStoryPage 
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            if (data) {
              setPageData(data);
            }
          }}
          selectedUser={selectedUser}
          storyId={pageData?.storyId}
          editMode={true}
        />
      ) : activePage === 'story-view' ? (
        <StoryViewPage
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            if (data) {
              setPageData(data);
            }
          }}
          pageData={pageData}
          selectedUser={selectedUser}
        />
      ) : activePage === 'course-contents' ? (
        <CourseContentsPage
          courseId={pageData?.courseId}
          courseData={pageData?.courseData}
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            if (data) {
              setPageData(data);
            }
          }}
          selectedUser={selectedUser}
        />
      ) : activePage === 'lesson-view' ? (
        <LessonViewPage
          lessonId={pageData?.lessonId}
          sectionId={pageData?.sectionId}
          courseId={pageData?.courseId}
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            if (data) {
              setPageData(data);
            }
          }}
        />
      ) : activePage === 'settings' ? (
        <SettingsPage onNavigate={(page) => {
          setActivePage(page);
          window.location.hash = page;
          localStorage.setItem('activePage', page);
          setSearchOverlayOpen(false);
        }} />
      ) : activePage === 'alerts' ? (
        <AlertsPage />
      ) : activePage === 'personal' ? (
        <PersonalPage />
      ) : activePage === 'users' ? (
        <UsersPage 
          key={`users-${Date.now()}`}
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setPageData(data);
            setSearchOverlayOpen(false);
          }}
          selectedUser={selectedUser}
          onSelectUser={setSelectedUser}
        />
      ) : activePage === 'add-user' ? (
        <AddUserPage onNavigate={(page, data) => {
          setActivePage(page);
          window.location.hash = page;
          localStorage.setItem('activePage', page);
          setPageData(data);
          setSearchOverlayOpen(false);
        }} />
      ) : activePage === 'edit-user' ? (
        <EditUserPage 
          onNavigate={(page, data) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setPageData(data);
            setSearchOverlayOpen(false);
          }} 
          user={pageData}
          selectedUser={selectedUser}
        />
      ) : activePage === 'ai-focus' ? (
        <AIFocusPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games' ? (
        <GamesPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/space-invaders' ? (
        <SpaceInvadersPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/pong' ? (
        <PongPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/breakout' ? (
        <BreakoutPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/snake' ? (
        <SnakePage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/flappy-bird' ? (
        <FlappyBirdPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/tetris' ? (
        <TetrisPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/asteroids' ? (
        <AsteroidsPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/gradius' ? (
        <GradiusPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/pac-man' ? (
        <PacManPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/frogger' ? (
        <FroggerPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/centipede' ? (
        <CentipedePage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/missile-command' ? (
        <MissileCommandPage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : activePage === 'games/golden-axe' ? (
        <GoldenAxePage 
          selectedUser={selectedUser}
          onNavigate={(page) => {
            setActivePage(page);
            window.location.hash = page;
            localStorage.setItem('activePage', page);
            setSearchOverlayOpen(false);
          }}
        />
      ) : (
        <div className="main-container">
          {showLeft && (
            <div className="left-section">
              <LeftPanel />
            </div>
          )}
          <div className="right-section">
            <OctopusEnergy />
            <ApiHealth />
          </div>
        </div>
      )}
      {!showLeft && (
        <div
          className="collapse-toggle collapse-left"
          onClick={() => setShowLeft(true)}
          title="Show news and widgets"
        >
          ▶
        </div>
      )}
      {/* Search Overlay */}
      {searchOverlayOpen && (activePage === 'chat' || activePage === 'music' || activePage === 'videos' || activePage === 'tech-news') && (
        <SearchOverlay
          activePage={activePage}
          onClose={() => {
            setSearchOverlayOpen(false);
            // Clear search query when closing
            if (activePage === 'music') setMusicSearchQuery('');
            if (activePage === 'chat') setChatSearchQuery('');
            if (activePage === 'videos') setVideoSearchQuery('');
            if (activePage === 'tech-news') setTechNewsSearchQuery('');
          }}
          searchQuery={
            activePage === 'music' ? musicSearchQuery :
            activePage === 'chat' ? chatSearchQuery :
            activePage === 'videos' ? videoSearchQuery :
            activePage === 'tech-news' ? techNewsSearchQuery : ''
          }
          onSearchChange={(query) => {
            if (activePage === 'music') setMusicSearchQuery(query);
            if (activePage === 'chat') setChatSearchQuery(query);
            if (activePage === 'videos') setVideoSearchQuery(query);
            if (activePage === 'tech-news') setTechNewsSearchQuery(query);
          }}
          selectedUser={selectedUser}
        />
      )}
      {/* Night mode button - fixed bottom right */}
      <NightModeButton />
    </div>
  );
}

export default App;
