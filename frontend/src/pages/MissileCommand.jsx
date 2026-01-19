import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function MissileCommandPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('missileCommandHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    cities: [],
    missiles: [],
    enemyMissiles: [],
    explosions: [],
    bases: [],
    lastEnemyMissile: 0,
    enemyMissileInterval: 2000
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize cities and bases
    const initCities = () => {
      gameState.cities = [];
      gameState.bases = [];
      const cityCount = 6 - Math.min(level - 1, 3);
      
      for (let i = 0; i < cityCount; i++) {
        gameState.cities.push({
          x: (canvas.width / (cityCount + 1)) * (i + 1),
          y: canvas.height - 40,
          width: 30,
          height: 20,
          destroyed: false
        });
      }
      
      // Bases (can launch missiles)
      for (let i = 0; i < 3; i++) {
        gameState.bases.push({
          x: (canvas.width / 4) * (i + 1),
          y: canvas.height - 20,
          width: 20,
          height: 15,
          destroyed: false
        });
      }
    };

    initCities();

    // Launch missile
    const launchMissile = (targetX, targetY) => {
      if (gameState.bases.filter(b => !b.destroyed).length === 0) return;
      
      const base = gameState.bases.find(b => !b.destroyed);
      if (!base) return;
      
      const dx = targetX - base.x;
      const dy = targetY - base.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const speed = 5;
      
      soundManager.playSound('shoot');
      gameState.missiles.push({
        x: base.x,
        y: base.y,
        vx: (dx / distance) * speed,
        vy: (dy / distance) * speed,
        targetX,
        targetY,
        exploded: false
      });
    };

    // Mouse/touch handlers
    const handleClick = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      launchMissile(x, y);
    };

    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      launchMissile(x, y);
    };

    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = 0;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      if (!lastTime) lastTime = currentTime;
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Spawn enemy missiles
      if (currentTime - gameState.lastEnemyMissile > gameState.enemyMissileInterval) {
        gameState.lastEnemyMissile = currentTime;
        const target = gameState.cities[Math.floor(Math.random() * gameState.cities.length)] || 
                      gameState.bases[Math.floor(Math.random() * gameState.bases.length)];
        if (target && !target.destroyed) {
          const dx = target.x - Math.random() * canvas.width;
          const dy = target.y - 0;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const speed = 1 + level * 0.2;
          
          gameState.enemyMissiles.push({
            x: Math.random() * canvas.width,
            y: 0,
            vx: (dx / distance) * speed,
            vy: (dy / distance) * speed,
            targetX: target.x,
            targetY: target.y
          });
        }
      }

      // Update player missiles
      gameState.missiles.forEach((missile, mi) => {
        missile.x += missile.vx;
        missile.y += missile.vy;
        
        // Check if reached target
        const dx = missile.targetX - missile.x;
        const dy = missile.targetY - missile.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        if (distance < 5 || missile.y < 0) {
          // Explode
          soundManager.playSound('explosion');
          gameState.explosions.push({
            x: missile.x,
            y: missile.y,
            radius: 0,
            maxRadius: 50,
            life: 30
          });
          gameState.missiles.splice(mi, 1);
        }
      });

      // Update enemy missiles
      gameState.enemyMissiles.forEach((missile, mi) => {
        missile.x += missile.vx;
        missile.y += missile.vy;
        
        // Check if hit ground
        if (missile.y >= canvas.height - 20) {
          // Explode
          const explosionRadius = 30;
          
          // Check city damage
          gameState.cities.forEach(city => {
            if (!city.destroyed) {
              const dx = city.x - missile.x;
              const dy = city.y - missile.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < explosionRadius) {
                city.destroyed = true;
              }
            }
          });
          
          // Check base damage
          gameState.bases.forEach(base => {
            if (!base.destroyed) {
              const dx = base.x - missile.x;
              const dy = base.y - missile.y;
              const distance = Math.sqrt(dx * dx + dy * dy);
              if (distance < explosionRadius) {
                base.destroyed = true;
              }
            }
          });
          
          soundManager.playSound('explosion2');
          gameState.explosions.push({
            x: missile.x,
            y: missile.y,
            radius: 0,
            maxRadius: explosionRadius,
            life: 30
          });
          
          gameState.enemyMissiles.splice(mi, 1);
        }
      });

      // Update explosions
      gameState.explosions.forEach((explosion, ei) => {
        explosion.radius = explosion.maxRadius * (1 - explosion.life / 30);
        explosion.life--;
        
        if (explosion.life <= 0) {
          gameState.explosions.splice(ei, 1);
        }
      });

      // Check missile-enemy missile collision
      gameState.missiles.forEach((missile, mi) => {
        gameState.enemyMissiles.forEach((enemyMissile, emi) => {
          const dx = missile.x - enemyMissile.x;
          const dy = missile.y - enemyMissile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < 10) {
            // Destroy both
            soundManager.playSound('explosion');
            setScore(prev => {
              const newScore = prev + 25;
              if (newScore > highScore) {
                setHighScore(newScore);
                localStorage.setItem('missileCommandHighScore', newScore.toString());
              }
              return newScore;
            });
            
            gameState.explosions.push({
              x: missile.x,
              y: missile.y,
              radius: 0,
              maxRadius: 40,
              life: 30
            });
            
            gameState.missiles.splice(mi, 1);
            gameState.enemyMissiles.splice(emi, 1);
          }
        });
      });

      // Check explosion-enemy missile collision
      gameState.explosions.forEach(explosion => {
        gameState.enemyMissiles.forEach((enemyMissile, emi) => {
          const dx = explosion.x - enemyMissile.x;
          const dy = explosion.y - enemyMissile.y;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance < explosion.radius) {
            soundManager.playSound('explosion');
            setScore(prev => {
              const newScore = prev + 25;
              if (newScore > highScore) {
                setHighScore(newScore);
                localStorage.setItem('missileCommandHighScore', newScore.toString());
              }
              return newScore;
            });
            gameState.enemyMissiles.splice(emi, 1);
          }
        });
      });

      // Check game over
      const citiesLeft = gameState.cities.filter(c => !c.destroyed).length;
      const basesLeft = gameState.bases.filter(b => !b.destroyed).length;
      
      if (citiesLeft === 0 && basesLeft === 0) {
        soundManager.playSound('gameOver');
        endGame();
        return;
      }

      // Check level completion
      if (gameState.enemyMissiles.length === 0 && currentTime - gameState.lastEnemyMissile > 3000) {
        const newLevel = level + 1;
        setLevel(newLevel);
        soundManager.playSound('levelUp');
        setScore(prev => prev + 1000 * level);
        gameState.enemyMissileInterval = Math.max(2000 - (newLevel * 100), 800);
        initCities();
        gameState.missiles = [];
        gameState.explosions = [];
      }

      // Draw
      // Sky gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#000033');
      gradient.addColorStop(1, '#000066');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Ground
      ctx.fillStyle = '#654321';
      ctx.fillRect(0, canvas.height - 20, canvas.width, 20);

      // Draw cities
      gameState.cities.forEach(city => {
        if (!city.destroyed) {
          ctx.fillStyle = '#0a0';
          ctx.fillRect(city.x, city.y, city.width, city.height);
          // Windows
          ctx.fillStyle = '#ff0';
          ctx.fillRect(city.x + 5, city.y + 5, 5, 5);
          ctx.fillRect(city.x + 20, city.y + 5, 5, 5);
        }
      });

      // Draw bases
      gameState.bases.forEach(base => {
        if (!base.destroyed) {
          ctx.fillStyle = '#666';
          ctx.fillRect(base.x, base.y, base.width, base.height);
          // Launcher
          ctx.fillStyle = '#888';
          ctx.fillRect(base.x + base.width / 2 - 2, base.y - 5, 4, 8);
        }
      });

      // Draw explosions
      gameState.explosions.forEach(explosion => {
        const alpha = explosion.life / 30;
        ctx.fillStyle = `rgba(255, ${255 * alpha}, 0, ${alpha})`;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
        ctx.beginPath();
        ctx.arc(explosion.x, explosion.y, explosion.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      });

      // Draw player missiles
      ctx.strokeStyle = '#0ff';
      ctx.lineWidth = 2;
      gameState.missiles.forEach(missile => {
        ctx.beginPath();
        ctx.moveTo(missile.x, missile.y);
        ctx.lineTo(missile.x - missile.vx * 2, missile.y - missile.vy * 2);
        ctx.stroke();
      });

      // Draw enemy missiles
      ctx.strokeStyle = '#f00';
      ctx.lineWidth = 2;
      gameState.enemyMissiles.forEach(missile => {
        ctx.beginPath();
        ctx.moveTo(missile.x, missile.y);
        ctx.lineTo(missile.x - missile.vx * 2, missile.y - missile.vy * 2);
        ctx.stroke();
      });

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    function endGame() {
      soundManager.playSound('gameOver');
      setGameOver(true);
      cancelAnimationFrame(animationFrameId);
    }

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      canvas.removeEventListener('click', handleClick);
      canvas.removeEventListener('touchstart', handleTouchStart);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStarted, gameOver, level, score, highScore]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLevel(1);
    gameStateRef.current = {
      cities: [],
      missiles: [],
      enemyMissiles: [],
      explosions: [],
      bases: [],
      lastEnemyMissile: 0,
      enemyMissileInterval: 2000
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
        <h1>Missile Command</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Score: <strong>{score}</strong> | Level: <strong>{level}</strong> | High: <strong>{highScore}</strong>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Defend your cities from enemy missiles. Click/tap to launch defensive missiles.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Mouse:</strong> Click to launch missile at that location
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Tap to launch missile at that location
                </p>
                <p style={{ color: '#9da7b8', marginTop: '8px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                  <strong style={{ color: '#fff' }}>Tip:</strong> Intercept enemy missiles before they hit your cities!
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
                • Click/Tap: Launch missile
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Protect cities and bases
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
              background: '#000033',
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
