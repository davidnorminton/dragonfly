import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function PacManPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('pacmanHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef(null);

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Classic Pac-Man maze layout (28x31) - '#' = wall, '.' = dot, 'o' = power pellet, ' ' = empty path
    const mazeLayout = [
      "############################",
      "#............##............#",
      "#.####.#####.##.#####.####.#",
      "#o####.#####.##.#####.####o#",
      "#.####.#####.##.#####.####.#",
      "#..........................#",
      "#.####.##.########.##.####.#",
      "#.####.##.########.##.####.#",
      "#......##....##....##......#",
      "######.##### ## #####.######",
      "######.##### ## #####.######",
      "######.##          ##.######",
      "######.## ###--### ##.######",
      "######.## #      # ##.######",
      "      .   #      #   .      ",
      "######.## #      # ##.######",
      "######.## ######## ##.######",
      "######.##          ##.######",
      "######.## ######## ##.######",
      "######.## ######## ##.######",
      "#............##............#",
      "#.####.#####.##.#####.####.#",
      "#.####.#####.##.#####.####.#",
      "#o..##.......  .......##..o#",
      "###.##.##.########.##.##.###",
      "###.##.##.########.##.##.###",
      "#......##....##....##......#",
      "#.##########.##.##########.#",
      "#.##########.##.##########.#",
      "#..........................#",
      "############################"
    ];

    const gridSize = 20;
    const cols = 28;
    const rows = 31;
    
    canvas.width = cols * gridSize;
    canvas.height = rows * gridSize;

    // Parse maze into tile array
    const maze = [];
    const dots = [];
    const powerPellets = [];
    const walls = [];

    for (let y = 0; y < rows; y++) {
      const row = [];
      for (let x = 0; x < cols; x++) {
        const char = mazeLayout[y]?.[x] || '#';
        if (char === '#') {
          row.push('wall');
          walls.push({ x, y });
        } else if (char === '.') {
          row.push('dot');
          dots.push({ x, y });
        } else if (char === 'o') {
          row.push('power');
          powerPellets.push({ x, y });
        } else {
          row.push('path');
        }
      }
      maze.push(row);
    }

    // Initialize or reuse game state
    if (!gameStateRef.current) {
      gameStateRef.current = {
        pacman: { x: 14, y: 23, direction: { x: 0, y: 0 }, nextDirection: { x: 0, y: 0 }, mouthAngle: 0 },
        ghosts: [
          { x: 13, y: 14, vx: -1, vy: 0, color: '#FF0000', scared: false, name: 'blinky' },
          { x: 14, y: 14, vx: 1, vy: 0, color: '#FFB8FF', scared: false, name: 'pinky' },
          { x: 13, y: 15, vx: 0, vy: 1, color: '#00FFFF', scared: false, name: 'inky' },
          { x: 14, y: 15, vx: -1, vy: 0, color: '#FFB851', scared: false, name: 'clyde' }
        ],
        dots,
        powerPellets,
        walls,
        maze,
        scaredTimer: 0
      };
    }
    const gameState = gameStateRef.current;

    // Check if tile is passable
    const isPassable = (x, y) => {
      if (x < 0 || x >= cols || y < 0 || y >= rows) return false;
      return maze[y][x] !== 'wall';
    };

    // Keyboard handlers
    const handleKeyDown = (e) => {
      const { pacman } = gameState;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        pacman.nextDirection = { x: 0, y: -1 };
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        pacman.nextDirection = { x: 0, y: 1 };
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        pacman.nextDirection = { x: -1, y: 0 };
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        pacman.nextDirection = { x: 1, y: 0 };
      }
    };

    // Touch handlers
    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      touchStartX = touch.clientX - rect.left;
      touchStartY = touch.clientY - rect.top;
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      if (e.changedTouches.length === 0) return;
      const touch = e.changedTouches[0];
      const rect = canvas.getBoundingClientRect();
      const touchEndX = touch.clientX - rect.left;
      const touchEndY = touch.clientY - rect.top;
      
      const dx = touchEndX - touchStartX;
      const dy = touchEndY - touchStartY;
      const minSwipe = 30;
      
      const { pacman } = gameState;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (Math.abs(dx) > minSwipe) {
          pacman.nextDirection = { x: dx > 0 ? 1 : -1, y: 0 };
        }
      } else {
        if (Math.abs(dy) > minSwipe) {
          pacman.nextDirection = { x: 0, y: dy > 0 ? 1 : -1 };
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = performance.now();
    const moveInterval = 150;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      const deltaTime = currentTime - lastTime;

      if (deltaTime > moveInterval) {
        lastTime = currentTime;

        const { pacman, ghosts, dots, powerPellets } = gameState;

        // Update pacman mouth
        pacman.mouthAngle += 0.3;

        // Try to change direction
        const nextX = pacman.x + pacman.nextDirection.x;
        const nextY = pacman.y + pacman.nextDirection.y;
        if (isPassable(nextX, nextY)) {
          pacman.direction = { ...pacman.nextDirection };
        }

        // Move pacman
        const newX = pacman.x + pacman.direction.x;
        const newY = pacman.y + pacman.direction.y;
        if (isPassable(newX, newY)) {
          pacman.x = newX;
          pacman.y = newY;
        }

        // Wrap tunnels
        if (pacman.x < 0) pacman.x = cols - 1;
        if (pacman.x >= cols) pacman.x = 0;

        // Collect dots
        for (let i = dots.length - 1; i >= 0; i--) {
          if (dots[i].x === pacman.x && dots[i].y === pacman.y) {
            dots.splice(i, 1);
            soundManager.playSound('eat');
            setScore(prev => {
              const newScore = prev + 10;
              if (newScore > highScore) {
                setHighScore(newScore);
                localStorage.setItem('pacmanHighScore', newScore.toString());
              }
              return newScore;
            });
          }
        }

        // Collect power pellets
        for (let i = powerPellets.length - 1; i >= 0; i--) {
          if (powerPellets[i].x === pacman.x && powerPellets[i].y === pacman.y) {
            powerPellets.splice(i, 1);
            soundManager.playSound('eatPower');
            gameState.scaredTimer = 10000;
            ghosts.forEach(g => g.scared = true);
            setScore(prev => {
              const newScore = prev + 50;
              if (newScore > highScore) {
                setHighScore(newScore);
                localStorage.setItem('pacmanHighScore', newScore.toString());
              }
              return newScore;
            });
          }
        }

        // Update scared timer
        if (gameState.scaredTimer > 0) {
          gameState.scaredTimer -= deltaTime;
          if (gameState.scaredTimer <= 0) {
            ghosts.forEach(g => g.scared = false);
          }
        }

        // Move ghosts
        ghosts.forEach((ghost, index) => {
          // Simple AI: move towards or away from pacman
          if (Math.random() < 0.4) {
            const dx = pacman.x - ghost.x;
            const dy = pacman.y - ghost.y;
            
            if (ghost.scared) {
              // Run away
              if (Math.abs(dx) > Math.abs(dy)) {
                ghost.vx = dx > 0 ? -1 : 1;
                ghost.vy = 0;
              } else {
                ghost.vx = 0;
                ghost.vy = dy > 0 ? -1 : 1;
              }
            } else {
              // Chase
              if (Math.abs(dx) > Math.abs(dy)) {
                ghost.vx = dx > 0 ? 1 : -1;
                ghost.vy = 0;
              } else {
                ghost.vx = 0;
                ghost.vy = dy > 0 ? 1 : -1;
              }
            }
          }

          const newGhostX = ghost.x + ghost.vx;
          const newGhostY = ghost.y + ghost.vy;

          if (isPassable(newGhostX, newGhostY)) {
            ghost.x = newGhostX;
            ghost.y = newGhostY;
          } else {
            // Random direction if blocked
            const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
            const [vx, vy] = dirs[Math.floor(Math.random() * dirs.length)];
            if (isPassable(ghost.x + vx, ghost.y + vy)) {
              ghost.vx = vx;
              ghost.vy = vy;
              ghost.x += vx;
              ghost.y += vy;
            }
          }

          // Wrap tunnels
          if (ghost.x < 0) ghost.x = cols - 1;
          if (ghost.x >= cols) ghost.x = 0;
        });

        // Check ghost collision
        ghosts.forEach((ghost, index) => {
          if (ghost.x === pacman.x && ghost.y === pacman.y) {
            if (ghost.scared) {
              soundManager.playSound('score');
              ghost.x = 13 + (index % 2);
              ghost.y = 14 + Math.floor(index / 2);
              ghost.scared = false;
              setScore(prev => {
                const newScore = prev + 200;
                if (newScore > highScore) {
                  setHighScore(newScore);
                  localStorage.setItem('pacmanHighScore', newScore.toString());
                }
                return newScore;
              });
            } else {
              // Game over immediately when caught by ghost
              soundManager.playSound('gameOver');
              setGameOver(true);
              return;
            }
          }
        });

        // Check level complete
        if (dots.length === 0 && powerPellets.length === 0) {
          soundManager.playSound('levelUp');
          setLevel(prev => prev + 1);
          setScore(prev => prev + 1000);
          // Reload maze
          window.location.reload();
        }
      }

      // Draw
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw walls
      ctx.fillStyle = '#2121DE';
      gameState.walls.forEach(wall => {
        ctx.fillRect(wall.x * gridSize, wall.y * gridSize, gridSize, gridSize);
      });

      // Draw dots
      ctx.fillStyle = '#FFB897';
      gameState.dots.forEach(dot => {
        ctx.beginPath();
        ctx.arc(
          dot.x * gridSize + gridSize / 2,
          dot.y * gridSize + gridSize / 2,
          2,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });

      // Draw power pellets
      ctx.fillStyle = '#FFB897';
      gameState.powerPellets.forEach(pellet => {
        ctx.beginPath();
        ctx.arc(
          pellet.x * gridSize + gridSize / 2,
          pellet.y * gridSize + gridSize / 2,
          6,
          0,
          Math.PI * 2
        );
        ctx.fill();
      });

      // Draw ghosts
      gameState.ghosts.forEach(ghost => {
        const gx = ghost.x * gridSize + gridSize / 2;
        const gy = ghost.y * gridSize + gridSize / 2;
        const size = gridSize * 0.8;

        // Body
        ctx.fillStyle = ghost.scared ? '#2121DE' : ghost.color;
        ctx.beginPath();
        ctx.arc(gx, gy - size / 6, size / 2, Math.PI, 0, false);
        ctx.lineTo(gx + size / 2, gy + size / 3);
        ctx.lineTo(gx + size / 3, gy + size / 6);
        ctx.lineTo(gx + size / 6, gy + size / 3);
        ctx.lineTo(gx, gy + size / 6);
        ctx.lineTo(gx - size / 6, gy + size / 3);
        ctx.lineTo(gx - size / 3, gy + size / 6);
        ctx.lineTo(gx - size / 2, gy + size / 3);
        ctx.closePath();
        ctx.fill();

        if (!ghost.scared) {
          // Eyes
          ctx.fillStyle = '#FFF';
          ctx.beginPath();
          ctx.arc(gx - size / 5, gy - size / 8, size / 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(gx + size / 5, gy - size / 8, size / 7, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000';
          ctx.beginPath();
          ctx.arc(gx - size / 5 + ghost.vx * 2, gy - size / 8 + ghost.vy * 2, size / 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(gx + size / 5 + ghost.vx * 2, gy - size / 8 + ghost.vy * 2, size / 12, 0, Math.PI * 2);
          ctx.fill();
        }
      });

      // Draw Pac-Man
      const px = gameState.pacman.x * gridSize + gridSize / 2;
      const py = gameState.pacman.y * gridSize + gridSize / 2;
      const pSize = gridSize * 0.8;

      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();

      let angle = 0;
      if (gameState.pacman.direction.x === 1) angle = 0;
      else if (gameState.pacman.direction.x === -1) angle = Math.PI;
      else if (gameState.pacman.direction.y === -1) angle = -Math.PI / 2;
      else if (gameState.pacman.direction.y === 1) angle = Math.PI / 2;

      const mouthOpen = Math.sin(gameState.pacman.mouthAngle) > 0;
      const mouthAngle = mouthOpen ? 0.2 : 0.01;

      ctx.arc(px, py, pSize / 2, angle + mouthAngle * Math.PI, angle + (2 - mouthAngle) * Math.PI);
      ctx.lineTo(px, py);
      ctx.fill();

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStarted, gameOver, level, lives, score, highScore]);

  const handleStartGame = () => {
    gameStateRef.current = null; // Reset game state
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
  };

  const handleRestart = () => {
    gameStateRef.current = null; // Reset game state
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Pac-Man</h1>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Eat all dots to complete the level. Avoid ghosts unless you've eaten a power pellet.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Arrow Keys or W/A/S/D to move
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Swipe in direction to move
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
                • Arrow Keys or W/A/S/D: Move
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Touch: Swipe to move
              </p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={560}
            height={620}
            style={{
              border: '2px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              background: '#000',
              touchAction: 'none',
              userSelect: 'none',
              imageRendering: 'pixelated'
            }}
          />
        </div>
      </div>
    </div>
  );
}
