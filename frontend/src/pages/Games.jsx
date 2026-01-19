import { useState } from 'react';

export function GamesPage({ selectedUser, onNavigate }) {
  const handleGameClick = (gamePath) => {
    if (onNavigate) {
      onNavigate(gamePath);
    }
  };

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <div className="page-header" style={{ flexShrink: 0 }}>
        <h1>Games</h1>
      </div>
      <div className="page-content" style={{ overflowY: 'auto', flex: 1, minHeight: 0 }}>
        <div style={{ 
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '20px',
          padding: '40px',
          minHeight: 'fit-content'
        }}>
          <div
            onClick={() => handleGameClick('games/space-invaders')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                <path d="M8 10h2v2H8zm6 0h2v2h-2zm-3 4h2v2h-2z"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Space Invaders</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Defend Earth from alien invaders in this classic arcade shooter
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1978</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/pong')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <rect x="2" y="6" width="4" height="12" rx="2"/>
                <rect x="18" y="6" width="4" height="12" rx="2"/>
                <circle cx="12" cy="12" r="3"/>
                <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="2" strokeDasharray="4,4"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Pong</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              The original video game - bounce the ball past your opponent
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1972</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/breakout')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <rect x="4" y="4" width="16" height="3" rx="1"/>
                <rect x="4" y="9" width="16" height="3" rx="1"/>
                <rect x="4" y="14" width="16" height="3" rx="1"/>
                <rect x="8" y="20" width="8" height="2" rx="1"/>
                <circle cx="12" cy="18" r="2"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Breakout</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Break all the blocks with your paddle and ball
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1976</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/snake')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
                <circle cx="8" cy="8" r="1.5"/>
                <circle cx="12" cy="8" r="1.5"/>
                <circle cx="16" cy="8" r="1.5"/>
                <circle cx="8" cy="12" r="1.5"/>
                <circle cx="12" cy="12" r="1.5"/>
                <circle cx="16" cy="12" r="1.5"/>
                <circle cx="8" cy="16" r="1.5"/>
                <circle cx="12" cy="16" r="1.5"/>
                <circle cx="16" cy="16" r="1.5"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Snake</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Guide the snake to eat food and grow longer without hitting yourself
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1976</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/flappy-bird')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2"/>
                <circle cx="10" cy="10" r="1.5" fill="currentColor"/>
                <path d="M8 14 Q12 12 16 14" stroke="currentColor" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Flappy Bird</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Tap to flap and navigate through pipes in this addictive side-scroller
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>2013</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/tetris')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <rect x="4" y="4" width="4" height="4"/>
                <rect x="8" y="4" width="4" height="4"/>
                <rect x="12" y="4" width="4" height="4"/>
                <rect x="16" y="4" width="4" height="4"/>
                <rect x="8" y="8" width="4" height="4"/>
                <rect x="12" y="8" width="4" height="4"/>
                <rect x="4" y="12" width="4" height="4"/>
                <rect x="8" y="12" width="4" height="4"/>
                <rect x="12" y="12" width="4" height="4"/>
                <rect x="16" y="12" width="4" height="4"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Tetris</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Arrange falling blocks to clear lines in this iconic puzzle game
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1984</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/asteroids')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <circle cx="12" cy="12" r="3"/>
                <circle cx="4" cy="6" r="2"/>
                <circle cx="20" cy="8" r="2"/>
                <circle cx="6" cy="18" r="2"/>
                <circle cx="18" cy="16" r="2"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Asteroids</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Navigate your ship and destroy all asteroids to survive
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1979</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/gradius')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#fff', opacity: 0.8 }}>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                <circle cx="12" cy="12" r="2"/>
              </svg>
            </div>
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Gradius</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Classic horizontal scrolling shooter with power-ups and enemy waves
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1985</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/pac-man')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#ff0', opacity: 0.8 }}>
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                <path d="M12 2 L12 12 L8 8" fill="currentColor"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Pac-Man</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Navigate the maze, eat dots, and avoid ghosts in this classic arcade game
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1980</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/frogger')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0f0', opacity: 0.8 }}>
                <circle cx="12" cy="18" r="4"/>
                <ellipse cx="12" cy="12" rx="6" ry="4"/>
                <circle cx="10" cy="10" r="1"/>
                <circle cx="14" cy="10" r="1"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Frogger</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Guide the frog across roads and rivers to reach safety
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1981</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/centipede')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0f0', opacity: 0.8 }}>
                <circle cx="4" cy="12" r="3"/>
                <circle cx="8" cy="12" r="3"/>
                <circle cx="12" cy="12" r="3"/>
                <circle cx="16" cy="12" r="3"/>
                <circle cx="20" cy="12" r="3"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Centipede</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Destroy the centipede before it reaches you in this vertical shooter
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1980</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/missile-command')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#f00', opacity: 0.8 }}>
                <path d="M12 2 L12 8 M8 6 L12 2 L16 6 M12 22 L12 16 M8 18 L12 22 L16 18"/>
                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Missile Command</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Defend your cities from incoming enemy missiles
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1980</p>
          </div>
          
          <div
            onClick={() => handleGameClick('games/golden-axe')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '12px',
              padding: '24px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              position: 'relative'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#0ff', opacity: 0.9 }}>
                <path d="M9 11.24V7.5a2.5 2.5 0 0 1 5 0v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63l-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z"/>
              </svg>
            </div>
            <div style={{
              width: '100%',
              height: '150px',
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid rgba(255, 255, 255, 0.1)'
            }}>
              <svg width="80" height="80" viewBox="0 0 24 24" fill="currentColor" style={{ color: '#FFD700', opacity: 0.8 }}>
                <path d="M12 2 L14 8 L20 8 L15 12 L17 18 L12 14 L7 18 L9 12 L4 8 L10 8 Z"/>
                <rect x="10" y="18" width="4" height="4"/>
              </svg>
            </div>
            <h3 style={{ margin: '0 0 8px 0', color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>Golden Axe</h3>
            <p style={{ margin: '0 0 4px 0', color: '#9da7b8', fontSize: '0.85rem', lineHeight: '1.4' }}>
              Classic side-scrolling hack-and-slash with multiple characters
            </p>
            <p style={{ margin: 0, color: '#666', fontSize: '0.75rem' }}>1989</p>
          </div>
        </div>
      </div>
    </div>
  );
}
