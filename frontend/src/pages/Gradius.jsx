import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function GradiusPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('gradiusHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    ship: { x: 50, y: 0, width: 40, height: 30, speed: 5, vy: 0 },
    bullets: [],
    enemies: [],
    powerUps: [],
    background: { x: 0 },
    keys: {},
    lastBulletTime: 0,
    lastEnemySpawn: 0,
    enemySpawnInterval: 2000,
    invulnerable: false,
    invulnerableTime: 0,
    scrollSpeed: 2,
    levelCompleted: false,
    levelCompleteScore: 1000
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize ship
    gameState.ship.y = canvas.height / 2 - gameState.ship.height / 2;
    gameState.ship.vy = 0;
    gameState.bullets = [];
    gameState.enemies = [];
    gameState.powerUps = [];
    gameState.background.x = 0;
    gameState.invulnerable = true;
    gameState.invulnerableTime = Date.now();
    gameState.enemySpawnInterval = Math.max(2000 - (level * 150), 800);
    gameState.scrollSpeed = 2 + (level * 0.3);
    gameState.levelCompleted = false;
    gameState.levelCompleteScore = level * 1000;

    // Shoot function
    const shoot = () => {
      const now = Date.now();
      if (now - gameState.lastBulletTime > 150) {
        gameState.lastBulletTime = now;
        soundManager.playSound('shoot');
        gameState.bullets.push({
          x: gameState.ship.x + gameState.ship.width,
          y: gameState.ship.y + gameState.ship.height / 2,
          width: 8,
          height: 4,
          vx: 8,
          vy: 0
        });
      }
    };

    // Spawn enemy
    const spawnEnemy = () => {
      const types = ['basic', 'fast', 'tank'];
      const type = types[Math.floor(Math.random() * types.length)];
      let enemy;
      
      if (type === 'basic') {
        enemy = {
          x: canvas.width,
          y: Math.random() * (canvas.height - 40),
          width: 30,
          height: 25,
          vx: -(2 + level * 0.3),
          vy: (Math.random() - 0.5) * 1,
          health: 1,
          type: 'basic',
          color: '#f00'
        };
      } else if (type === 'fast') {
        enemy = {
          x: canvas.width,
          y: Math.random() * (canvas.height - 30),
          width: 25,
          height: 20,
          vx: -(4 + level * 0.5),
          vy: (Math.random() - 0.5) * 2,
          health: 1,
          type: 'fast',
          color: '#ff0'
        };
      } else {
        enemy = {
          x: canvas.width,
          y: Math.random() * (canvas.height - 50),
          width: 40,
          height: 35,
          vx: -(1.5 + level * 0.2),
          vy: 0,
          health: 3,
          type: 'tank',
          color: '#800'
        };
      }
      
      gameState.enemies.push(enemy);
    };

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        gameState.keys['ArrowUp'] = true;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        gameState.keys['ArrowDown'] = true;
      } else if (e.key === ' ') {
        e.preventDefault();
        gameState.keys['Space'] = true;
        shoot();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        gameState.keys['ArrowUp'] = false;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        gameState.keys['ArrowDown'] = false;
      } else if (e.key === ' ') {
        gameState.keys['Space'] = false;
      }
    };

    // Touch handlers
    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const y = touch.clientY - rect.top;
      
      if (y < canvas.height / 2) {
        gameState.keys['ArrowUp'] = true;
      } else {
        gameState.keys['ArrowDown'] = true;
      }
      shoot();
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      gameState.keys['ArrowUp'] = false;
      gameState.keys['ArrowDown'] = false;
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const y = touch.clientY - rect.top;
        
        gameState.keys['ArrowUp'] = false;
        gameState.keys['ArrowDown'] = false;
        
        if (y < canvas.height / 2) {
          gameState.keys['ArrowUp'] = true;
        } else {
          gameState.keys['ArrowDown'] = true;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Auto-shoot
    const autoShoot = () => {
      if (gameState.keys['Space']) {
        shoot();
      }
    };

    // Game loop
    let animationFrameId;
    let lastTime = 0;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Update invulnerability
      if (gameState.invulnerable && Date.now() - gameState.invulnerableTime > 2000) {
        gameState.invulnerable = false;
      }

      // Scroll background
      gameState.background.x -= gameState.scrollSpeed;
      if (gameState.background.x <= -canvas.width) {
        gameState.background.x = 0;
      }

      // Move ship
      if (gameState.keys['ArrowUp']) {
        gameState.ship.y = Math.max(0, gameState.ship.y - gameState.ship.speed);
      }
      if (gameState.keys['ArrowDown']) {
        gameState.ship.y = Math.min(canvas.height - gameState.ship.height, gameState.ship.y + gameState.ship.speed);
      }

      // Auto-shoot
      autoShoot();

      // Spawn enemies
      if (currentTime - gameState.lastEnemySpawn > gameState.enemySpawnInterval) {
        gameState.lastEnemySpawn = currentTime;
        spawnEnemy();
      }

      // Update bullets
      gameState.bullets = gameState.bullets.filter(bullet => {
        bullet.x += bullet.vx;
        return bullet.x < canvas.width;
      });

      // Update enemies
      gameState.enemies.forEach(enemy => {
        enemy.x += enemy.vx;
        enemy.y += enemy.vy;
        
        // Bounce off top/bottom
        if (enemy.y <= 0 || enemy.y + enemy.height >= canvas.height) {
          enemy.vy = -enemy.vy;
        }
      });

      // Remove off-screen enemies
      gameState.enemies = gameState.enemies.filter(enemy => enemy.x + enemy.width > 0);

      // Bullet-enemy collision
      gameState.bullets.forEach((bullet, bi) => {
        gameState.enemies.forEach((enemy, ei) => {
          if (bullet.x < enemy.x + enemy.width &&
              bullet.x + bullet.width > enemy.x &&
              bullet.y < enemy.y + enemy.height &&
              bullet.y + bullet.height > enemy.y) {
            enemy.health--;
            gameState.bullets.splice(bi, 1);
            soundManager.playSound('hit');
            
            if (enemy.health <= 0) {
              soundManager.playSound('explosion');
              const points = enemy.type === 'tank' ? 30 : enemy.type === 'fast' ? 20 : 10;
              setScore(prev => {
                const newScore = prev + points;
                if (newScore > highScore) {
                  setHighScore(newScore);
                  localStorage.setItem('gradiusHighScore', newScore.toString());
                }
                return newScore;
              });
              
              // Chance to drop power-up
              if (Math.random() < 0.2) {
                gameState.powerUps.push({
                  x: enemy.x,
                  y: enemy.y,
                  width: 20,
                  height: 20,
                  vx: -2,
                  type: Math.random() < 0.5 ? 'health' : 'speed',
                  rotation: 0
                });
              }
              
              gameState.enemies.splice(ei, 1);
            }
          }
        });
      });

      // Ship-enemy collision
      if (!gameState.invulnerable) {
        gameState.enemies.forEach(enemy => {
          if (gameState.ship.x < enemy.x + enemy.width &&
              gameState.ship.x + gameState.ship.width > enemy.x &&
              gameState.ship.y < enemy.y + enemy.height &&
              gameState.ship.y + gameState.ship.height > enemy.y) {
            const newLives = lives - 1;
            setLives(newLives);
            if (newLives <= 0) {
              endGame();
              return;
            }
            gameState.invulnerable = true;
            gameState.invulnerableTime = Date.now();
            // Remove colliding enemy
            const index = gameState.enemies.indexOf(enemy);
            if (index > -1) {
              gameState.enemies.splice(index, 1);
            }
          }
        });
      }

      // Update power-ups
      gameState.powerUps.forEach((powerUp, pi) => {
        powerUp.x += powerUp.vx;
        powerUp.rotation += 0.1;
        
        // Check collision with ship
        if (gameState.ship.x < powerUp.x + powerUp.width &&
            gameState.ship.x + gameState.ship.width > powerUp.x &&
            gameState.ship.y < powerUp.y + powerUp.height &&
            gameState.ship.y + gameState.ship.height > powerUp.y) {
          if (powerUp.type === 'health') {
            setLives(prev => Math.min(prev + 1, 5));
          } else if (powerUp.type === 'speed') {
            gameState.ship.speed = Math.min(gameState.ship.speed + 1, 8);
          }
          soundManager.playSound('powerUp');
          gameState.powerUps.splice(pi, 1);
        }
      });

      // Remove off-screen power-ups
      gameState.powerUps = gameState.powerUps.filter(p => p.x + p.width > 0);

      // Check level completion (only when score crosses threshold and no enemies on screen)
      if (!gameState.levelCompleted && score >= gameState.levelCompleteScore && gameState.enemies.length === 0) {
        const newLevel = level + 1;
        setLevel(newLevel);
        soundManager.playSound('levelUp');
        setScore(prev => prev + 500 * level);
        // Don't clear enemies here - they're already gone
        gameState.bullets = [];
        gameState.powerUps = [];
        gameState.invulnerable = true;
        gameState.invulnerableTime = Date.now();
        gameState.enemySpawnInterval = Math.max(2000 - (newLevel * 150), 800);
        gameState.scrollSpeed = 2 + (newLevel * 0.3);
        gameState.levelCompleteScore = newLevel * 1000;
        gameState.levelCompleted = false; // Reset for new level
      }

      // Draw
      // Stars background
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw stars
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 100; i++) {
        const x = (i * 37 + gameState.background.x) % (canvas.width * 2);
        const y = (i * 41) % canvas.height;
        ctx.fillRect(x, y, 1, 1);
      }

      // Draw power-ups with better sprites
      gameState.powerUps.forEach(powerUp => {
        ctx.save();
        const centerX = powerUp.x + powerUp.width / 2;
        const centerY = powerUp.y + powerUp.height / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate(powerUp.rotation);
        
        if (powerUp.type === 'health') {
          // Health power-up (cross/plus symbol)
          ctx.fillStyle = '#0f0';
          ctx.fillRect(-powerUp.width / 2, -powerUp.width / 6, powerUp.width, powerUp.width / 3);
          ctx.fillRect(-powerUp.width / 6, -powerUp.width / 2, powerUp.width / 3, powerUp.width);
          ctx.strokeStyle = '#0a0';
          ctx.lineWidth = 2;
          ctx.strokeRect(-powerUp.width / 2, -powerUp.width / 6, powerUp.width, powerUp.width / 3);
          ctx.strokeRect(-powerUp.width / 6, -powerUp.width / 2, powerUp.width / 3, powerUp.width);
          // Glow effect
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#0f0';
          ctx.fillRect(-powerUp.width / 2, -powerUp.width / 6, powerUp.width, powerUp.width / 3);
          ctx.fillRect(-powerUp.width / 6, -powerUp.width / 2, powerUp.width / 3, powerUp.width);
          ctx.shadowBlur = 0;
        } else {
          // Speed power-up (lightning bolt)
          ctx.fillStyle = '#0ff';
          ctx.beginPath();
          ctx.moveTo(-powerUp.width / 3, -powerUp.height / 2);
          ctx.lineTo(powerUp.width / 6, 0);
          ctx.lineTo(-powerUp.width / 6, 0);
          ctx.lineTo(powerUp.width / 3, powerUp.height / 2);
          ctx.lineTo(0, powerUp.height / 3);
          ctx.lineTo(powerUp.width / 6, powerUp.height / 3);
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = '#0aa';
          ctx.lineWidth = 2;
          ctx.stroke();
          // Glow effect
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#0ff';
          ctx.fill();
          ctx.shadowBlur = 0;
        }
        
        ctx.restore();
      });

      // Draw enemies with better sprites
      gameState.enemies.forEach(enemy => {
        ctx.save();
        
        if (enemy.type === 'basic') {
          // Basic enemy - fighter design
          ctx.fillStyle = '#f44';
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width, enemy.y + enemy.height / 2);
          ctx.lineTo(enemy.x + enemy.width * 0.7, enemy.y);
          ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.3);
          ctx.lineTo(enemy.x + enemy.width * 0.3, enemy.y + enemy.height / 2);
          ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.7);
          ctx.lineTo(enemy.x + enemy.width * 0.7, enemy.y + enemy.height);
          ctx.closePath();
          ctx.fill();
          
          // Cockpit
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width * 0.5, enemy.y + enemy.height / 2, enemy.width * 0.15, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width * 0.5, enemy.y + enemy.height / 2, enemy.width * 0.1, 0, Math.PI * 2);
          ctx.fill();
        } else if (enemy.type === 'fast') {
          // Fast enemy - sleek design
          ctx.fillStyle = '#ff0';
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width, enemy.y + enemy.height / 2);
          ctx.lineTo(enemy.x + enemy.width * 0.6, enemy.y + enemy.height * 0.2);
          ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.4);
          ctx.lineTo(enemy.x + enemy.width * 0.4, enemy.y + enemy.height / 2);
          ctx.lineTo(enemy.x, enemy.y + enemy.height * 0.6);
          ctx.lineTo(enemy.x + enemy.width * 0.6, enemy.y + enemy.height * 0.8);
          ctx.closePath();
          ctx.fill();
          
          // Engine glow
          ctx.fillStyle = '#ffaa00';
          ctx.fillRect(enemy.x + enemy.width * 0.8, enemy.y + enemy.height * 0.3, enemy.width * 0.2, enemy.height * 0.4);
        } else {
          // Tank enemy - heavy design
          ctx.fillStyle = '#800';
          ctx.fillRect(enemy.x, enemy.y, enemy.width, enemy.height);
          
          // Armor plates
          ctx.fillStyle = '#a00';
          ctx.fillRect(enemy.x + 5, enemy.y + 5, enemy.width - 10, 8);
          ctx.fillRect(enemy.x + 5, enemy.y + enemy.height - 13, enemy.width - 10, 8);
          ctx.fillRect(enemy.x + 5, enemy.y + 5, 8, enemy.height - 10);
          ctx.fillRect(enemy.x + enemy.width - 13, enemy.y + 5, 8, enemy.height - 10);
          
          // Cannon
          ctx.fillStyle = '#600';
          ctx.fillRect(enemy.x - 5, enemy.y + enemy.height / 2 - 3, 8, 6);
          
          // Core
          ctx.fillStyle = '#f00';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.width * 0.2, 0, Math.PI * 2);
          ctx.fill();
        }
        
        ctx.restore();
      });

      // Draw bullets with energy effect
      gameState.bullets.forEach(bullet => {
        // Energy core
        ctx.fillStyle = '#0ff';
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        
        // Glow effect
        ctx.shadowBlur = 5;
        ctx.shadowColor = '#0ff';
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
        ctx.shadowBlur = 0;
        
        // Bright center
        ctx.fillStyle = '#fff';
        ctx.fillRect(bullet.x + 1, bullet.y + 1, bullet.width - 2, bullet.height - 2);
      });

      // Draw ship with better sprite
      if (!gameState.invulnerable || Math.floor(Date.now() / 100) % 2) {
        const ship = gameState.ship;
        
        // Main body
        ctx.fillStyle = '#0f0';
        ctx.beginPath();
        ctx.moveTo(ship.x + ship.width, ship.y + ship.height / 2);
        ctx.lineTo(ship.x + ship.width * 0.6, ship.y);
        ctx.lineTo(ship.x + ship.width * 0.3, ship.y + ship.height * 0.2);
        ctx.lineTo(ship.x, ship.y + ship.height * 0.3);
        ctx.lineTo(ship.x + ship.width * 0.2, ship.y + ship.height / 2);
        ctx.lineTo(ship.x, ship.y + ship.height * 0.7);
        ctx.lineTo(ship.x + ship.width * 0.3, ship.y + ship.height * 0.8);
        ctx.lineTo(ship.x + ship.width * 0.6, ship.y + ship.height);
        ctx.closePath();
        ctx.fill();
        
        // Body highlight
        ctx.fillStyle = '#0fa';
        ctx.beginPath();
        ctx.moveTo(ship.x + ship.width * 0.7, ship.y + ship.height * 0.2);
        ctx.lineTo(ship.x + ship.width * 0.5, ship.y + ship.height * 0.4);
        ctx.lineTo(ship.x + ship.width * 0.7, ship.y + ship.height * 0.6);
        ctx.lineTo(ship.x + ship.width * 0.5, ship.y + ship.height * 0.8);
        ctx.closePath();
        ctx.fill();
        
        // Cockpit
        ctx.fillStyle = '#0aa';
        ctx.beginPath();
        ctx.arc(ship.x + ship.width * 0.5, ship.y + ship.height / 2, ship.width * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(ship.x + ship.width * 0.5, ship.y + ship.height / 2, ship.width * 0.1, 0, Math.PI * 2);
        ctx.fill();
        
        // Wing details
        ctx.fillStyle = '#0a0';
        ctx.fillRect(ship.x + ship.width * 0.4, ship.y + ship.height * 0.1, ship.width * 0.15, 4);
        ctx.fillRect(ship.x + ship.width * 0.4, ship.y + ship.height * 0.86, ship.width * 0.15, 4);
        
        // Engine glow
        const glowIntensity = Math.sin(Date.now() / 50) * 0.3 + 0.7;
        ctx.fillStyle = `rgba(0, 255, 255, ${glowIntensity})`;
        ctx.fillRect(ship.x + ship.width * 0.85, ship.y + ship.height * 0.3, ship.width * 0.15, ship.height * 0.4);
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    function endGame() {
      soundManager.playSound('gameOver');
      setGameOver(true);
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStarted, gameOver, level, lives, score, highScore]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
    gameStateRef.current = {
      ship: { x: 50, y: 0, width: 40, height: 30, speed: 5, vy: 0 },
      bullets: [],
      enemies: [],
      powerUps: [],
      background: { x: 0 },
      keys: {},
      lastBulletTime: 0,
      lastEnemySpawn: 0,
      enemySpawnInterval: 2000,
      invulnerable: false,
      invulnerableTime: 0,
      scrollSpeed: 2,
      levelCompleted: false,
      levelCompleteScore: 1000
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
        <h1>Gradius</h1>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Survive enemy waves, collect power-ups, and progress through levels.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Arrow Keys Up/Down to move, Space to shoot
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Top half = move up, Bottom half = move down, Tap to shoot
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
                • Arrow Up/Down: Move
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Space: Shoot
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Touch: Top/Bottom halves + Tap
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
