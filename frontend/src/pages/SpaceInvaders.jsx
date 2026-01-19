import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function SpaceInvadersPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [touchControls, setTouchControls] = useState({ left: false, right: false, shoot: false });
  const gameStateRef = useRef({
    player: { x: 0, y: 0, width: 40, height: 20, speed: 5 },
    bullets: [],
    enemyBullets: [],
    enemies: [],
    shields: [],
    explosions: [],
    stars: [],
    enemyDirection: 1,
    enemySpeed: 2,
    lastEnemyMove: 0,
    keys: {},
    lastBulletTime: 0,
    lastEnemyShot: 0,
    enemyAnimationFrame: 0,
    autoShootInterval: 260, // Auto-shoot every 260ms
    enemyShotInterval: 900,
    enemyMoveInterval: 300,
    baseEnemyMoveInterval: 300,
    maxPlayerBullets: 3
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Function to draw classic Space Invaders alien sprites
    const drawAlien = (ctx, x, y, type, frame) => {
      ctx.save();
      
      // Different colors for different alien types
      if (type === 'squid') {
        ctx.fillStyle = '#ff00ff'; // Magenta for top row
      } else if (type === 'crab') {
        ctx.fillStyle = '#00ffff'; // Cyan for middle rows
      } else {
        ctx.fillStyle = '#ffff00'; // Yellow for bottom row
      }

      const w = 32;
      const h = 24;
      const centerX = x + w / 2;
      const centerY = y + h / 2;

      // Draw alien sprite based on type and frame
      if (type === 'squid') {
        // Squid alien (top rows) - classic design
        // Body (main shape)
        ctx.fillRect(x + 8, y + 2, 16, 4);
        ctx.fillRect(x + 6, y + 6, 20, 6);
        ctx.fillRect(x + 4, y + 12, 24, 4);
        ctx.fillRect(x + 6, y + 16, 20, 4);
        
        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 10, y + 8, 4, 4);
        ctx.fillRect(x + 18, y + 8, 4, 4);
        ctx.fillStyle = type === 'squid' ? '#ff00ff' : type === 'crab' ? '#00ffff' : '#ffff00';
        
        // Tentacles/legs (animated)
        if (frame === 0) {
          ctx.fillRect(x + 2, y + 18, 6, 4);
          ctx.fillRect(x + 24, y + 18, 6, 4);
        } else {
          ctx.fillRect(x + 4, y + 18, 6, 4);
          ctx.fillRect(x + 22, y + 18, 6, 4);
        }
      } else if (type === 'crab') {
        // Crab alien (middle rows) - classic design
        // Top antennae
        if (frame === 0) {
          ctx.fillRect(x + 6, y, 4, 2);
          ctx.fillRect(x + 22, y, 4, 2);
        } else {
          ctx.fillRect(x + 4, y, 4, 2);
          ctx.fillRect(x + 24, y, 4, 2);
        }
        
        // Body
        ctx.fillRect(x + 4, y + 2, 24, 6);
        ctx.fillRect(x + 2, y + 8, 28, 8);
        ctx.fillRect(x + 4, y + 16, 24, 4);
        
        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 10, y + 10, 4, 4);
        ctx.fillRect(x + 18, y + 10, 4, 4);
        ctx.fillStyle = type === 'squid' ? '#ff00ff' : type === 'crab' ? '#00ffff' : '#ffff00';
        
        // Claws/legs (animated)
        if (frame === 0) {
          ctx.fillRect(x, y + 18, 8, 4);
          ctx.fillRect(x + 24, y + 18, 8, 4);
        } else {
          ctx.fillRect(x + 2, y + 18, 8, 4);
          ctx.fillRect(x + 22, y + 18, 8, 4);
        }
      } else {
        // Ray alien (bottom row) - classic design
        // Top
        ctx.fillRect(x + 10, y, 12, 2);
        ctx.fillRect(x + 8, y + 2, 16, 2);
        ctx.fillRect(x + 6, y + 4, 20, 2);
        
        // Main body
        ctx.fillRect(x + 4, y + 6, 24, 8);
        ctx.fillRect(x + 6, y + 14, 20, 4);
        ctx.fillRect(x + 8, y + 18, 16, 4);
        ctx.fillRect(x + 12, y + 22, 8, 2);
        
        // Eyes
        ctx.fillStyle = '#000';
        ctx.fillRect(x + 12, y + 10, 3, 3);
        ctx.fillRect(x + 17, y + 10, 3, 3);
        ctx.fillStyle = type === 'squid' ? '#ff00ff' : type === 'crab' ? '#00ffff' : '#ffff00';
      }
      
      ctx.restore();
    };

    const initStars = () => {
      if (gameState.stars.length > 0) return;
      const starCount = 80;
      for (let i = 0; i < starCount; i++) {
        gameState.stars.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height,
          size: Math.random() * 2 + 1,
          speed: Math.random() * 0.6 + 0.2
        });
      }
    };

    const initShields = () => {
      const shieldCount = 4;
      const shieldWidth = 60;
      const shieldHeight = 40;
      const shieldY = gameState.player.y - 70;
      const spacing = (canvas.width - shieldCount * shieldWidth) / (shieldCount + 1);
      gameState.shields = [];

      for (let i = 0; i < shieldCount; i++) {
        const shieldX = spacing + i * (shieldWidth + spacing);
        const blocks = [];
        const blockSize = 6;
        const cols = Math.floor(shieldWidth / blockSize);
        const rows = Math.floor(shieldHeight / blockSize);
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            const cutout = (row >= rows - 2 && (col < 2 || col > cols - 3));
            if (!cutout) {
              blocks.push({
                x: shieldX + col * blockSize,
                y: shieldY + row * blockSize,
                size: blockSize,
                alive: true
              });
            }
          }
        }
        gameState.shields.push({ blocks });
      }
    };

    // Initialize player
    gameState.player.x = canvas.width / 2 - gameState.player.width / 2;
    gameState.player.y = canvas.height - gameState.player.height - 20;
    initStars();
    initShields();

    // Initialize enemies based on level
    gameState.enemies = [];
    // Increase rows and speed with level
    const baseRows = 5;
    const baseCols = 11;
    const currentLevelValue = level;
    const rows = Math.min(baseRows + Math.floor(currentLevelValue / 3), 8); // Max 8 rows
    const cols = Math.min(baseCols + Math.floor(currentLevelValue / 5), 15); // Max 15 cols
    const enemyWidth = 32;
    const enemyHeight = 24;
    const spacing = 8;
    const startX = (canvas.width - (cols * (enemyWidth + spacing) - spacing)) / 2;
    const startY = 50;

    // Store current level in game state (use ref to avoid dependency issues)
    const currentLevel = level;
    gameState.currentLevel = currentLevel;
    
    // Increase enemy speed with level
    gameState.enemySpeed = 2 + (currentLevel * 0.5);
    // Decrease enemy move interval (faster movement) with level
    gameState.baseEnemyMoveInterval = Math.max(320 - (currentLevel * 22), 120);
    gameState.enemyMoveInterval = gameState.baseEnemyMoveInterval;
    gameState.levelComplete = false; // Reset level complete flag

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        gameState.enemies.push({
          x: startX + col * (enemyWidth + spacing),
          y: startY + row * (enemyHeight + spacing),
          width: enemyWidth,
          height: enemyHeight,
          alive: true,
          type: row < Math.floor(rows * 0.4) ? 'squid' : row < Math.floor(rows * 0.8) ? 'crab' : 'ray',
          row,
          col
        });
      }
    }

    // Shoot function
    const shoot = () => {
      if (gameState.bullets.length >= gameState.maxPlayerBullets) return;
      gameState.bullets.push({
        x: gameState.player.x + gameState.player.width / 2,
        y: gameState.player.y,
        width: 4,
        height: 10,
        speed: 7
      });
      soundManager.playSound('shoot');
    };

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        gameState.keys['ArrowLeft'] = true;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        gameState.keys['ArrowRight'] = true;
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        gameState.keys['ArrowLeft'] = false;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        gameState.keys['ArrowRight'] = false;
      }
    };

    // Touch handlers
    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;

      // Check if touch is in left third of canvas
      if (x < canvas.width / 3) {
        gameState.keys['ArrowLeft'] = true;
      }
      // Check if touch is in right third of canvas
      else if (x > (canvas.width * 2) / 3) {
        gameState.keys['ArrowRight'] = true;
      }
      // Middle third - no action needed (auto-shooting)
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      gameState.keys['ArrowLeft'] = false;
      gameState.keys['ArrowRight'] = false;
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        // Update movement based on touch position
        gameState.keys['ArrowLeft'] = false;
        gameState.keys['ArrowRight'] = false;
        
        if (x < canvas.width / 3) {
          gameState.keys['ArrowLeft'] = true;
        } else if (x > (canvas.width * 2) / 3) {
          gameState.keys['ArrowRight'] = true;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = 0;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Update and draw starfield
      ctx.fillStyle = '#fff';
      gameState.stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvas.height) {
          star.y = -star.size;
          star.x = Math.random() * canvas.width;
        }
        ctx.fillRect(star.x, star.y, star.size, star.size);
      });

      // Move player
      if (gameState.keys['ArrowLeft']) {
        gameState.player.x = Math.max(0, gameState.player.x - gameState.player.speed);
      }
      if (gameState.keys['ArrowRight']) {
        gameState.player.x = Math.min(canvas.width - gameState.player.width, gameState.player.x + gameState.player.speed);
      }

      // Auto-shoot
      const now = Date.now();
      if (now - gameState.lastBulletTime > gameState.autoShootInterval) {
        gameState.lastBulletTime = now;
        shoot();
      }

      // Draw player (classic ship)
      ctx.fillStyle = '#0f0';
      ctx.fillRect(gameState.player.x + 14, gameState.player.y + 6, 12, 8);
      ctx.fillRect(gameState.player.x + 6, gameState.player.y + 12, 28, 6);
      ctx.fillRect(gameState.player.x, gameState.player.y + 16, 40, 4);

      // Update and draw player bullets
      gameState.bullets = gameState.bullets.filter(bullet => {
        bullet.y -= bullet.speed;
        if (bullet.y < 0) return false;

        // Check collision with enemies
        for (let enemy of gameState.enemies) {
          if (!enemy.alive) continue;
          if (bullet.x < enemy.x + enemy.width &&
              bullet.x + bullet.width > enemy.x &&
              bullet.y < enemy.y + enemy.height &&
              bullet.y + bullet.height > enemy.y) {
            enemy.alive = false;
            gameState.explosions.push({ x: enemy.x + enemy.width / 2, y: enemy.y + enemy.height / 2, life: 10 });
            soundManager.playSound('explosion');
            setScore(prev => prev + 10);
            return false;
          }
        }

        return true;
      });

      ctx.fillStyle = '#0ff';
      gameState.bullets.forEach(bullet => {
        ctx.fillRect(bullet.x - bullet.width / 2, bullet.y, bullet.width, bullet.height);
      });

      // Enemy shooting
      const nowShot = Date.now();
      if (nowShot - gameState.lastEnemyShot > gameState.enemyShotInterval) {
        gameState.lastEnemyShot = nowShot;
        const aliveEnemies = gameState.enemies.filter(e => e.alive);
        if (aliveEnemies.length > 0) {
          const shootersByCol = {};
          aliveEnemies.forEach(enemy => {
            const key = enemy.col;
            if (!shootersByCol[key] || enemy.row > shootersByCol[key].row) {
              shootersByCol[key] = enemy;
            }
          });
          const shooterPool = Object.values(shootersByCol);
          const shooter = shooterPool[Math.floor(Math.random() * shooterPool.length)];
          if (shooter) {
            gameState.enemyBullets.push({
              x: shooter.x + shooter.width / 2,
              y: shooter.y + shooter.height,
              width: 4,
              height: 10,
              speed: 5 + level * 0.3
            });
          }
        }
      }

      // Update enemy bullets
      gameState.enemyBullets = gameState.enemyBullets.filter(bullet => {
        bullet.y += bullet.speed;
        if (bullet.y > canvas.height) return false;

        // Hit player
        if (bullet.x < gameState.player.x + gameState.player.width &&
            bullet.x + bullet.width > gameState.player.x &&
            bullet.y < gameState.player.y + gameState.player.height &&
            bullet.y + bullet.height > gameState.player.y) {
          soundManager.playSound('gameOver');
          setGameOver(true);
          return false;
        }

        // Hit shields
        for (const shield of gameState.shields) {
          for (const block of shield.blocks) {
            if (!block.alive) continue;
            if (bullet.x < block.x + block.size &&
                bullet.x + bullet.width > block.x &&
                bullet.y < block.y + block.size &&
                bullet.y + bullet.height > block.y) {
              block.alive = false;
              return false;
            }
          }
        }
        return true;
      });

      ctx.fillStyle = '#ff5d5d';
      gameState.enemyBullets.forEach(bullet => {
        ctx.fillRect(bullet.x - bullet.width / 2, bullet.y, bullet.width, bullet.height);
      });

      // Move enemies - classic Space Invaders style
      if (currentTime - gameState.lastEnemyMove > gameState.enemyMoveInterval) {
        gameState.lastEnemyMove = currentTime;
        gameState.enemyAnimationFrame = (gameState.enemyAnimationFrame + 1) % 2;
        
        // Find the leftmost and rightmost alive enemies
        let leftmostX = canvas.width;
        let rightmostX = 0;
        let hasAliveEnemies = false;
        let aliveCount = 0;

        for (let enemy of gameState.enemies) {
          if (!enemy.alive) continue;
          hasAliveEnemies = true;
          aliveCount += 1;
          if (enemy.x < leftmostX) leftmostX = enemy.x;
          if (enemy.x + enemy.width > rightmostX) rightmostX = enemy.x + enemy.width;
        }

        if (hasAliveEnemies) {
          const totalEnemies = gameState.enemies.length;
          const aliveRatio = aliveCount / totalEnemies;
          gameState.enemyMoveInterval = Math.max(70, gameState.baseEnemyMoveInterval * Math.max(0.35, aliveRatio));

          // Check if we need to move down
          const shouldMoveDown = 
            (leftmostX <= 0 && gameState.enemyDirection === -1) ||
            (rightmostX >= canvas.width && gameState.enemyDirection === 1);

          if (shouldMoveDown) {
            // Reverse direction and move down
            gameState.enemyDirection *= -1;
            gameState.enemies.forEach(enemy => {
              if (enemy.alive) {
                enemy.y += 20; // Move down
              }
            });
          } else {
            // Move horizontally
            gameState.enemies.forEach(enemy => {
              if (enemy.alive) {
                enemy.x += gameState.enemySpeed * gameState.enemyDirection;
              }
            });
          }
        }
      }

      // Draw enemies with classic Space Invaders sprites
      gameState.enemies.forEach(enemy => {
        if (enemy.alive) {
          drawAlien(ctx, enemy.x, enemy.y, enemy.type, gameState.enemyAnimationFrame);
        }
      });

      // Draw shields
      ctx.fillStyle = '#3cff6b';
      gameState.shields.forEach(shield => {
        shield.blocks.forEach(block => {
          if (block.alive) {
            ctx.fillRect(block.x, block.y, block.size, block.size);
          }
        });
      });

      // Draw explosions
      gameState.explosions = gameState.explosions.filter(explosion => explosion.life > 0);
      gameState.explosions.forEach(explosion => {
        explosion.life -= 1;
        ctx.fillStyle = `rgba(255, 200, 50, ${explosion.life / 10})`;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, 12 - explosion.life, 0, Math.PI * 2);
        ctx.fill();
      });

      // Check level completion
      const aliveEnemies = gameState.enemies.filter(e => e.alive);
      if (aliveEnemies.length === 0 && !gameState.levelComplete) {
        // Mark level as complete to prevent multiple triggers
        gameState.levelComplete = true;
        
        // Advance level and add bonus points
        const currentLevelValue = gameState.currentLevel || 1;
        const newLevel = currentLevelValue + 1;
        gameState.currentLevel = newLevel;
        setLevel(newLevel);
        soundManager.playSound('levelUp');
        setScore(prev => prev + 100 * currentLevelValue); // Bonus points for completing level
        
        // Reset game state for next level
        gameState.bullets = [];
        gameState.enemyBullets = [];
        gameState.lastEnemyMove = 0;
        gameState.enemyAnimationFrame = 0;
        gameState.lastBulletTime = 0;
        gameState.enemyDirection = 1;
        initShields();
        
        // Reinitialize enemies for next level
        const rows = Math.min(5 + Math.floor(newLevel / 3), 8);
        const cols = Math.min(11 + Math.floor(newLevel / 5), 15);
        const enemyWidth = 32;
        const enemyHeight = 24;
        const spacing = 8;
        const startX = (canvas.width - (cols * (enemyWidth + spacing) - spacing)) / 2;
        const startY = 50;
        
        gameState.enemySpeed = 2 + (newLevel * 0.5);
        gameState.baseEnemyMoveInterval = Math.max(320 - (newLevel * 22), 120);
        gameState.enemyMoveInterval = gameState.baseEnemyMoveInterval;
        
        gameState.enemies = [];
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < cols; col++) {
            gameState.enemies.push({
              x: startX + col * (enemyWidth + spacing),
              y: startY + row * (enemyHeight + spacing),
              width: enemyWidth,
              height: enemyHeight,
              alive: true,
              type: row < Math.floor(rows * 0.4) ? 'squid' : row < Math.floor(rows * 0.8) ? 'crab' : 'ray',
              row,
              col
            });
          }
        }
        
        return;
      }

      // Check if enemies reached player
      for (let enemy of aliveEnemies) {
        if (enemy.y + enemy.height >= gameState.player.y) {
          soundManager.playSound('gameOver');
          setGameOver(true);
          return;
        }
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      canvas.removeEventListener('touchmove', handleTouchMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStarted, gameOver, level]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLevel(1);
    gameStateRef.current = {
      player: { x: 0, y: 0, width: 40, height: 20, speed: 5 },
      bullets: [],
      enemyBullets: [],
      enemies: [],
      shields: [],
      explosions: [],
      stars: [],
      enemyDirection: 1,
      enemySpeed: 2,
      lastEnemyMove: 0,
      keys: {},
      lastBulletTime: 0,
      lastEnemyShot: 0,
      enemyAnimationFrame: 0,
      autoShootInterval: 260,
      enemyShotInterval: 900,
      enemyMoveInterval: 300,
      baseEnemyMoveInterval: 300,
      levelComplete: false,
      currentLevel: 1,
      maxPlayerBullets: 3
    };
  };

  const handleRestart = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
    setLevel(1);
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Space Invaders</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Score: <strong>{score}</strong>
          </div>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Level: <strong>{level}</strong>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Defend Earth from alien invaders. Destroy all aliens to advance levels.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Left/Right Arrow Keys to move (auto-firing enabled)
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Left side = move left, Right side = move right
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
                • Left/Right Arrows: Move
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Touch sides: Move
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
