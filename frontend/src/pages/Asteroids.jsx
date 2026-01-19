import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function AsteroidsPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('asteroidsHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    ship: { x: 0, y: 0, angle: 0, vx: 0, vy: 0, speed: 0.1, rotationSpeed: 0.05 },
    bullets: [],
    asteroids: [],
    keys: {},
    lastBulletTime: 0,
    invulnerable: false,
    invulnerableTime: 0
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize ship
    gameState.ship.x = canvas.width / 2;
    gameState.ship.y = canvas.height / 2;
    gameState.ship.angle = -Math.PI / 2;
    gameState.ship.vx = 0;
    gameState.ship.vy = 0;
    gameState.bullets = [];
    gameState.asteroids = [];
    gameState.invulnerable = true;
    gameState.invulnerableTime = Date.now();

    // Create asteroids
    const createAsteroids = (count) => {
      for (let i = 0; i < count; i++) {
        let x, y;
        do {
          x = Math.random() * canvas.width;
          y = Math.random() * canvas.height;
        } while (Math.abs(x - gameState.ship.x) < 100 && Math.abs(y - gameState.ship.y) < 100);

        const size = 30 + Math.random() * 20;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + level * 0.2;
        gameState.asteroids.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size,
          rotation: 0,
          rotationSpeed: (Math.random() - 0.5) * 0.1
        });
      }
    };

    createAsteroids(3 + level);

    // Shoot function
    const shoot = () => {
      const now = Date.now();
      if (now - gameState.lastBulletTime > 200) {
        gameState.lastBulletTime = now;
        gameState.bullets.push({
          x: gameState.ship.x,
          y: gameState.ship.y,
          vx: Math.cos(gameState.ship.angle) * 8,
          vy: Math.sin(gameState.ship.angle) * 8,
          life: 60
        });
      }
    };

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        gameState.keys['ArrowLeft'] = true;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        gameState.keys['ArrowRight'] = true;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        gameState.keys['ArrowUp'] = true;
      } else if (e.key === ' ') {
        e.preventDefault();
        gameState.keys['Space'] = true;
        shoot();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        gameState.keys['ArrowLeft'] = false;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        gameState.keys['ArrowRight'] = false;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        gameState.keys['ArrowUp'] = false;
      } else if (e.key === ' ') {
        gameState.keys['Space'] = false;
      }
    };

    // Touch handlers
    let touchStartX = 0;
    let touchStartY = 0;
    let touchAngle = 0;

    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      touchStartX = touch.clientX - rect.left;
      touchStartY = touch.clientY - rect.top;
      touchAngle = Math.atan2(touchStartY - gameState.ship.y, touchStartX - gameState.ship.x);
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        const angle = Math.atan2(y - gameState.ship.y, x - gameState.ship.x);
        gameState.ship.angle = angle;
      }
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      shoot();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = 0;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Update ship rotation
      if (gameState.keys['ArrowLeft']) {
        gameState.ship.angle -= gameState.ship.rotationSpeed;
      }
      if (gameState.keys['ArrowRight']) {
        gameState.ship.angle += gameState.ship.rotationSpeed;
      }

      // Update ship thrust
      if (gameState.keys['ArrowUp']) {
        gameState.ship.vx += Math.cos(gameState.ship.angle) * gameState.ship.speed;
        gameState.ship.vy += Math.sin(gameState.ship.angle) * gameState.ship.speed;
      }

      // Apply friction
      gameState.ship.vx *= 0.98;
      gameState.ship.vy *= 0.98;

      // Update ship position (wrap around)
      gameState.ship.x += gameState.ship.vx;
      gameState.ship.y += gameState.ship.vy;
      if (gameState.ship.x < 0) gameState.ship.x = canvas.width;
      if (gameState.ship.x > canvas.width) gameState.ship.x = 0;
      if (gameState.ship.y < 0) gameState.ship.y = canvas.height;
      if (gameState.ship.y > canvas.height) gameState.ship.y = 0;

      // Update invulnerability
      if (gameState.invulnerable && Date.now() - gameState.invulnerableTime > 2000) {
        gameState.invulnerable = false;
      }

      // Update bullets
      gameState.bullets = gameState.bullets.filter(bullet => {
        bullet.x += bullet.vx;
        bullet.y += bullet.vy;
        bullet.life--;

        // Wrap around
        if (bullet.x < 0) bullet.x = canvas.width;
        if (bullet.x > canvas.width) bullet.x = 0;
        if (bullet.y < 0) bullet.y = canvas.height;
        if (bullet.y > canvas.height) bullet.y = 0;

        return bullet.life > 0;
      });

      // Update asteroids
      gameState.asteroids.forEach(asteroid => {
        asteroid.x += asteroid.vx;
        asteroid.y += asteroid.vy;
        asteroid.rotation += asteroid.rotationSpeed;

        // Wrap around
        if (asteroid.x < -asteroid.size) asteroid.x = canvas.width + asteroid.size;
        if (asteroid.x > canvas.width + asteroid.size) asteroid.x = -asteroid.size;
        if (asteroid.y < -asteroid.size) asteroid.y = canvas.height + asteroid.size;
        if (asteroid.y > canvas.height + asteroid.size) asteroid.y = -asteroid.size;
      });

      // Bullet-asteroid collision (iterate backwards to safely modify arrays)
      for (let bi = gameState.bullets.length - 1; bi >= 0; bi--) {
        const bullet = gameState.bullets[bi];
        let bulletHit = false;
        
        for (let ai = gameState.asteroids.length - 1; ai >= 0; ai--) {
          const asteroid = gameState.asteroids[ai];
          const dx = bullet.x - asteroid.x;
          const dy = bullet.y - asteroid.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < asteroid.size) {
            // Split asteroid
            soundManager.playSound('explosion');
            setScore(prev => {
              const points = Math.floor(asteroid.size / 10) * 10;
              const newScore = prev + points;
              if (newScore > highScore) {
                setHighScore(newScore);
                localStorage.setItem('asteroidsHighScore', newScore.toString());
              }
              return newScore;
            });

            // Remove bullet (only once per bullet)
            if (!bulletHit) {
              gameState.bullets.splice(bi, 1);
              bulletHit = true;
            }
            
            // Split or remove asteroid
            if (asteroid.size > 15) {
              // Split into smaller asteroids
              for (let i = 0; i < 2; i++) {
                const angle = Math.random() * Math.PI * 2;
                gameState.asteroids.push({
                  x: asteroid.x,
                  y: asteroid.y,
                  vx: Math.cos(angle) * (1 + level * 0.2),
                  vy: Math.sin(angle) * (1 + level * 0.2),
                  size: asteroid.size / 2,
                  rotation: 0,
                  rotationSpeed: (Math.random() - 0.5) * 0.1
                });
              }
            }
            gameState.asteroids.splice(ai, 1);
            
            // One bullet can only hit one asteroid
            break;
          }
        }
      }

      // Ship-asteroid collision
      if (!gameState.invulnerable) {
        gameState.asteroids.forEach(asteroid => {
          const dx = gameState.ship.x - asteroid.x;
          const dy = gameState.ship.y - asteroid.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          if (distance < asteroid.size + 10) {
            const newLives = lives - 1;
            setLives(newLives);
            if (newLives <= 0) {
              soundManager.playSound('gameOver');
              endGame();
              return;
            }
            gameState.invulnerable = true;
            gameState.invulnerableTime = Date.now();
            gameState.ship.vx = 0;
            gameState.ship.vy = 0;
          }
        });
      }

      // Check level completion (only when all asteroids are destroyed)
      // Only advance level if there are truly no asteroids left (not just cleared in collision)
      if (gameState.asteroids.length === 0) {
        const newLevel = level + 1;
        setLevel(newLevel);
        soundManager.playSound('levelUp');
        setScore(prev => prev + 1000 * level);
        gameState.ship.x = canvas.width / 2;
        gameState.ship.y = canvas.height / 2;
        gameState.ship.vx = 0;
        gameState.ship.vy = 0;
        gameState.invulnerable = true;
        gameState.invulnerableTime = Date.now();
        createAsteroids(3 + newLevel);
      }

      // Draw
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw stars
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 50; i++) {
        const x = (i * 37) % canvas.width;
        const y = (i * 41) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
      }

      // Draw asteroids
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      gameState.asteroids.forEach(asteroid => {
        ctx.save();
        ctx.translate(asteroid.x, asteroid.y);
        ctx.rotate(asteroid.rotation);
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const radius = asteroid.size + Math.sin(angle * 3) * 5;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;
          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      });

      // Draw bullets
      ctx.fillStyle = '#fff';
      gameState.bullets.forEach(bullet => {
        ctx.fillRect(bullet.x - 2, bullet.y - 2, 4, 4);
      });

      // Draw ship
      if (!gameState.invulnerable || Math.floor(Date.now() / 100) % 2) {
        ctx.save();
        ctx.translate(gameState.ship.x, gameState.ship.y);
        ctx.rotate(gameState.ship.angle);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-10, -8);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-10, 8);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    function endGame() {
      setGameOver(true);
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchmove', handleTouchMove);
      canvas.removeEventListener('touchend', handleTouchEnd);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStarted, gameOver, level, lives, highScore]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
    gameStateRef.current = {
      ship: { x: 0, y: 0, angle: 0, vx: 0, vy: 0, speed: 0.1, rotationSpeed: 0.05 },
      bullets: [],
      asteroids: [],
      keys: {},
      lastBulletTime: 0,
      invulnerable: false,
      invulnerableTime: 0
    };
  };

  const handleRestart = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Asteroids</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Score: <strong>{score}</strong> | Lives: <strong>{lives}</strong> | Level: <strong>{level}</strong> | High: <strong>{highScore}</strong>
          </div>
          <GameMuteButton />
          <button
            onClick={() => onNavigate?.('games')}
            style={{
              padding: '8px 16px',
              background: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '0.9rem'
            }}
          >
            Back to Games
          </button>
        </div>
      </div>
      <div className="page-content" style={{ display: 'flex', gap: '30px', padding: '20px', alignItems: 'flex-start' }}>
        <div style={{ 
          minWidth: '250px', 
          maxWidth: '300px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '12px',
          padding: '20px'
        }}>
          <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '16px', fontSize: '1.3rem' }}>How to Play</h3>
          {!gameStarted && !gameOver && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <p style={{ color: '#9da7b8', marginBottom: '12px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Objective:</strong> Destroy all asteroids to advance levels. Avoid collisions to survive.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Arrow Keys to rotate/thrust, Space to shoot
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Drag to aim, Release to shoot
                </p>
              </div>
              <button
                onClick={handleStartGame}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  background: 'rgba(0, 255, 0, 0.2)',
                  border: '2px solid #0f0',
                  borderRadius: '8px',
                  color: '#0f0',
                  cursor: 'pointer',
                  fontSize: '1.1rem',
                  fontWeight: 'bold'
                }}
              >
                Start Game
              </button>
            </>
          )}
          {gameOver && (
            <>
              <div style={{ marginBottom: '20px' }}>
                <h2 style={{ color: '#f00', marginBottom: '16px', fontSize: '1.5rem' }}>Game Over!</h2>
                <p style={{ color: '#fff', marginBottom: '8px', fontSize: '1.2rem' }}>
                  Final Score: <strong>{score}</strong>
                </p>
                <p style={{ color: '#fff', marginBottom: '8px', fontSize: '1.2rem' }}>
                  Reached Level: <strong>{level}</strong>
                </p>
              </div>
              <button
                onClick={handleRestart}
                style={{
                  width: '100%',
                  padding: '12px 24px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '2px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '8px',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '1.1rem'
                }}
              >
                Play Again
              </button>
            </>
          )}
          {gameStarted && !gameOver && (
            <div>
              <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                <strong style={{ color: '#fff' }}>Controls:</strong>
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Arrow Keys: Rotate/Thrust
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Space: Shoot
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Touch: Drag & Release
              </p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={600}
            style={{
              border: '2px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              background: '#000',
              touchAction: 'none',
              userSelect: 'none',
              maxWidth: '100%',
              height: 'auto'
            }}
          />
        </div>
      </div>
    </div>
  );
}
