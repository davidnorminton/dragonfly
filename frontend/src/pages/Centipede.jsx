import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function CentipedePage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('centipedeHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    player: { x: 0, y: 0, width: 30, height: 20 },
    centipede: [],
    bullets: [],
    mushrooms: [],
    spiders: [],
    fleas: [],
    gridSize: 20,
    lastBulletTime: 0,
    lastSpiderSpawn: 0,
    spiderSpawnInterval: 10000,
    lastFleaSpawn: 0,
    fleaSpawnInterval: 15000
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize player
    gameState.player.x = canvas.width / 2 - gameState.player.width / 2;
    gameState.player.y = canvas.height - gameState.player.height - 10;

    // Create mushrooms
    const createMushrooms = () => {
      gameState.mushrooms = [];
      for (let i = 0; i < 20 + level * 5; i++) {
        gameState.mushrooms.push({
          x: Math.floor(Math.random() * (canvas.width / gameState.gridSize)) * gameState.gridSize,
          y: Math.floor(Math.random() * (canvas.height / gameState.gridSize - 5)) * gameState.gridSize + gameState.gridSize * 2,
          health: 4
        });
      }
    };

    // Initialize centipede
    const initCentipede = () => {
      gameState.centipede = [];
      const segments = 10 + level;
      const startX = Math.floor(Math.random() * (canvas.width / gameState.gridSize)) * gameState.gridSize;
      for (let i = 0; i < segments; i++) {
        gameState.centipede.push({
          x: startX,
          y: i * gameState.gridSize,
          vx: 1,
          vy: 0,
          isHead: i === 0
        });
      }
    };

    createMushrooms();
    initCentipede();

    // Shoot function
    const shoot = () => {
      const now = Date.now();
      if (now - gameState.lastBulletTime > 150) {
        gameState.lastBulletTime = now;
        soundManager.playSound('shoot');
        gameState.bullets.push({
          x: gameState.player.x + gameState.player.width / 2,
          y: gameState.player.y,
          width: 4,
          height: 8,
          vy: -8
        });
      }
    };

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        gameState.player.x = Math.max(0, gameState.player.x - 5);
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        gameState.player.x = Math.min(canvas.width - gameState.player.width, gameState.player.x + 5);
      } else if (e.key === ' ') {
        e.preventDefault();
        shoot();
      }
    };

    // Touch handlers
    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      
      if (x < canvas.width / 2) {
        gameState.player.x = Math.max(0, gameState.player.x - 5);
      } else {
        gameState.player.x = Math.min(canvas.width - gameState.player.width, gameState.player.x + 5);
      }
      shoot();
    };

    const handleTouchMove = (e) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const x = touch.clientX - rect.left;
        gameState.player.x = Math.max(0, Math.min(canvas.width - gameState.player.width, x - gameState.player.width / 2));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = 0;
    const moveInterval = 100;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      if (currentTime - lastTime > moveInterval) {
        lastTime = currentTime;

        // Move centipede
        if (gameState.centipede.length > 0) {
          const head = gameState.centipede[0];
          
          // Check if hitting edge
          if (head.x <= 0 || head.x >= canvas.width - gameState.gridSize) {
            head.vx *= -1;
            head.y += gameState.gridSize;
          }
          
          // Check if hitting mushroom
          let hitMushroom = false;
          gameState.mushrooms.forEach(mushroom => {
            if (head.x === mushroom.x && head.y === mushroom.y) {
              hitMushroom = true;
              head.vx *= -1;
              head.y += gameState.gridSize;
            }
          });

          // Move head
          head.x += head.vx * gameState.gridSize;
          
          // Move body segments
          for (let i = 1; i < gameState.centipede.length; i++) {
            const prev = gameState.centipede[i - 1];
            const curr = gameState.centipede[i];
            curr.x = prev.x;
            curr.y = prev.y;
          }

          // Check if centipede reached bottom
          if (head.y >= canvas.height - gameState.gridSize * 3) {
            head.y = gameState.gridSize;
          }
        }

        // Spawn spider
        if (currentTime - gameState.lastSpiderSpawn > gameState.spiderSpawnInterval) {
          gameState.lastSpiderSpawn = currentTime;
          gameState.spiders.push({
            x: Math.random() > 0.5 ? -30 : canvas.width + 30,
            y: canvas.height - 100,
            vx: Math.random() > 0.5 ? 2 : -2,
            vy: (Math.random() - 0.5) * 1,
            width: 30,
            height: 20
          });
        }

        // Spawn flea
        if (currentTime - gameState.lastFleaSpawn > gameState.fleaSpawnInterval) {
          gameState.lastFleaSpawn = currentTime;
          gameState.fleas.push({
            x: Math.random() * canvas.width,
            y: 0,
            vy: 2 + level * 0.3,
            width: 20,
            height: 20
          });
        }

        // Update bullets
        gameState.bullets.forEach((bullet, bi) => {
          bullet.y += bullet.vy;
          
          // Check mushroom collision
          gameState.mushrooms.forEach((mushroom, mi) => {
            if (bullet.x >= mushroom.x && bullet.x <= mushroom.x + gameState.gridSize &&
                bullet.y >= mushroom.y && bullet.y <= mushroom.y + gameState.gridSize) {
              mushroom.health--;
              gameState.bullets.splice(bi, 1);
              if (mushroom.health <= 0) {
                soundManager.playSound('break');
                setScore(prev => {
                  const newScore = prev + 1;
                  if (newScore > highScore) {
                    setHighScore(newScore);
                    localStorage.setItem('centipedeHighScore', newScore.toString());
                  }
                  return newScore;
                });
                gameState.mushrooms.splice(mi, 1);
              }
            }
          });

          // Check centipede collision
          gameState.centipede.forEach((segment, si) => {
            if (bullet.x >= segment.x && bullet.x <= segment.x + gameState.gridSize &&
                bullet.y >= segment.y && bullet.y <= segment.y + gameState.gridSize) {
              gameState.bullets.splice(bi, 1);
              
              // Split centipede
              soundManager.playSound('explosion');
              if (si === 0) {
                // Hit head - create mushroom
                gameState.mushrooms.push({
                  x: segment.x,
                  y: segment.y,
                  health: 4
                });
                setScore(prev => {
                  const newScore = prev + 100;
                  if (newScore > highScore) {
                    setHighScore(newScore);
                    localStorage.setItem('centipedeHighScore', newScore.toString());
                  }
                  return newScore;
                });
              } else {
                // Hit body - split into two
                setScore(prev => {
                  const newScore = prev + 10;
                  if (newScore > highScore) {
                    setHighScore(newScore);
                    localStorage.setItem('centipedeHighScore', newScore.toString());
                  }
                  return newScore;
                });
              }
              
              // Remove hit segment and everything after
              gameState.centipede.splice(si);
              
              // If there are remaining segments, make first one the head
              if (gameState.centipede.length > 0) {
                gameState.centipede[0].isHead = true;
              }
            }
          });

          // Check spider collision
          gameState.spiders.forEach((spider, spi) => {
            if (bullet.x < spider.x + spider.width &&
                bullet.x + bullet.width > spider.x &&
                bullet.y < spider.y + spider.height &&
                bullet.y + bullet.height > spider.y) {
              gameState.bullets.splice(bi, 1);
              soundManager.playSound('explosion');
              setScore(prev => {
                const newScore = prev + 300;
                if (newScore > highScore) {
                  setHighScore(newScore);
                  localStorage.setItem('centipedeHighScore', newScore.toString());
                }
                return newScore;
              });
              gameState.spiders.splice(spi, 1);
            }
          });

          // Check flea collision
          gameState.fleas.forEach((flea, fi) => {
            if (bullet.x < flea.x + flea.width &&
                bullet.x + bullet.width > flea.x &&
                bullet.y < flea.y + flea.height &&
                bullet.y + bullet.height > flea.y) {
              gameState.bullets.splice(bi, 1);
              soundManager.playSound('explosion');
              setScore(prev => {
                const newScore = prev + 200;
                if (newScore > highScore) {
                  setHighScore(newScore);
                  localStorage.setItem('centipedeHighScore', newScore.toString());
                }
                return newScore;
              });
              gameState.fleas.splice(fi, 1);
            }
          });
        });

        // Remove off-screen bullets
        gameState.bullets = gameState.bullets.filter(bullet => bullet.y > 0);

        // Update spiders
        gameState.spiders.forEach(spider => {
          spider.x += spider.vx;
          spider.y += spider.vy;
          
          if (spider.y < canvas.height - 200 || spider.y > canvas.height - 50) {
            spider.vy *= -1;
          }
        });
        gameState.spiders = gameState.spiders.filter(spider => spider.x > -100 && spider.x < canvas.width + 100);

        // Update fleas
        gameState.fleas.forEach(flea => {
          flea.y += flea.vy;
          // Drop mushrooms
          if (Math.random() < 0.01) {
            gameState.mushrooms.push({
              x: flea.x,
              y: flea.y,
              health: 4
            });
          }
        });
        gameState.fleas = gameState.fleas.filter(flea => flea.y < canvas.height);

        // Check centipede collision with player
        gameState.centipede.forEach(segment => {
          if (gameState.player.x < segment.x + gameState.gridSize &&
              gameState.player.x + gameState.player.width > segment.x &&
              gameState.player.y < segment.y + gameState.gridSize &&
              gameState.player.y + gameState.player.height > segment.y) {
            const newLives = lives - 1;
            setLives(newLives);
            if (newLives <= 0) {
              endGame();
              return;
            }
            initCentipede();
            gameState.player.x = canvas.width / 2 - gameState.player.width / 2;
          }
        });

        // Check spider collision with player
        gameState.spiders.forEach(spider => {
          if (gameState.player.x < spider.x + spider.width &&
              gameState.player.x + gameState.player.width > spider.x &&
              gameState.player.y < spider.y + spider.height &&
              gameState.player.y + gameState.player.height > spider.y) {
            const newLives = lives - 1;
            setLives(newLives);
            if (newLives <= 0) {
              endGame();
              return;
            }
            gameState.spiders = gameState.spiders.filter(s => s !== spider);
            gameState.player.x = canvas.width / 2 - gameState.player.width / 2;
          }
        });

        // Check flea collision with player
        gameState.fleas.forEach(flea => {
          if (gameState.player.x < flea.x + flea.width &&
              gameState.player.x + gameState.player.width > flea.x &&
              gameState.player.y < flea.y + flea.height &&
              gameState.player.y + gameState.player.height > flea.y) {
            const newLives = lives - 1;
            setLives(newLives);
            if (newLives <= 0) {
              endGame();
              return;
            }
            gameState.fleas = gameState.fleas.filter(f => f !== flea);
            gameState.player.x = canvas.width / 2 - gameState.player.width / 2;
          }
        });

        // Check level completion
        if (gameState.centipede.length === 0) {
          const newLevel = level + 1;
          setLevel(newLevel);
          soundManager.playSound('levelUp');
          setScore(prev => prev + 1000 * level);
          createMushrooms();
          initCentipede();
          gameState.spiders = [];
          gameState.fleas = [];
        }
      }

      // Draw
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw mushrooms
      gameState.mushrooms.forEach(mushroom => {
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(mushroom.x, mushroom.y, gameState.gridSize, gameState.gridSize);
        ctx.fillStyle = '#fff';
        ctx.fillRect(mushroom.x + 2, mushroom.y + 2, gameState.gridSize - 4, gameState.gridSize - 4);
        // Spots
        ctx.fillStyle = '#8B4513';
        ctx.fillRect(mushroom.x + 5, mushroom.y + 5, 3, 3);
        ctx.fillRect(mushroom.x + 12, mushroom.y + 8, 3, 3);
        ctx.fillRect(mushroom.x + 8, mushroom.y + 12, 3, 3);
      });

      // Draw centipede
      gameState.centipede.forEach((segment, index) => {
        ctx.fillStyle = index === 0 ? '#0f0' : '#0a0';
        ctx.fillRect(segment.x, segment.y, gameState.gridSize, gameState.gridSize);
        if (segment.isHead) {
          // Eyes
          ctx.fillStyle = '#fff';
          ctx.fillRect(segment.x + 3, segment.y + 3, 4, 4);
          ctx.fillRect(segment.x + 13, segment.y + 3, 4, 4);
        }
      });

      // Draw spiders
      gameState.spiders.forEach(spider => {
        ctx.fillStyle = '#f00';
        ctx.fillRect(spider.x, spider.y, spider.width, spider.height);
        // Legs
        ctx.strokeStyle = '#f00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(spider.x, spider.y + 5);
        ctx.lineTo(spider.x - 5, spider.y);
        ctx.moveTo(spider.x + spider.width, spider.y + 5);
        ctx.lineTo(spider.x + spider.width + 5, spider.y);
        ctx.moveTo(spider.x, spider.y + spider.height - 5);
        ctx.lineTo(spider.x - 5, spider.y + spider.height);
        ctx.moveTo(spider.x + spider.width, spider.y + spider.height - 5);
        ctx.lineTo(spider.x + spider.width + 5, spider.y + spider.height);
        ctx.stroke();
      });

      // Draw fleas
      gameState.fleas.forEach(flea => {
        ctx.fillStyle = '#ff0';
        ctx.fillRect(flea.x, flea.y, flea.width, flea.height);
      });

      // Draw bullets
      ctx.fillStyle = '#0ff';
      gameState.bullets.forEach(bullet => {
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
      });

      // Draw player
      ctx.fillStyle = '#0f0';
      ctx.fillRect(gameState.player.x, gameState.player.y, gameState.player.width, gameState.player.height);
      // Cannon
      ctx.fillStyle = '#0a0';
      ctx.fillRect(gameState.player.x + gameState.player.width / 2 - 3, gameState.player.y - 5, 6, 8);

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
      canvas.removeEventListener('touchstart', handleTouchStart);
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
      player: { x: 0, y: 0, width: 30, height: 20 },
      centipede: [],
      bullets: [],
      mushrooms: [],
      spiders: [],
      fleas: [],
      gridSize: 20,
      lastBulletTime: 0,
      lastSpiderSpawn: 0,
      spiderSpawnInterval: 10000,
      lastFleaSpawn: 0,
      fleaSpawnInterval: 15000
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
        <h1>Centipede</h1>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Destroy the centipede before it reaches you. Clear mushrooms to create paths.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Left/Right Arrows to move, Space to shoot
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Tap left/right to move, tap to shoot
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
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Space: Shoot
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Touch: Tap to move/shoot
              </p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={600}
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
