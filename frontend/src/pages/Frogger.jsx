import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function FroggerPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('froggerHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    frog: { x: 0, y: 0, width: 30, height: 30 },
    cars: [],
    logs: [],
    turtles: [],
    gridSize: 40,
    lastCarSpawn: 0,
    carSpawnInterval: 2000,
    lastLogSpawn: 0,
    logSpawnInterval: 2500,
    lastTurtleSpawn: 0,
    turtleSpawnInterval: 3000
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize frog
    gameState.frog.x = canvas.width / 2 - gameState.frog.width / 2;
    gameState.frog.y = canvas.height - gameState.frog.height - 10;

    // Spawn car
    const spawnCar = (lane) => {
      const speed = (Math.random() > 0.5 ? 1 : -1) * (2 + level * 0.5);
      gameState.cars.push({
        x: speed > 0 ? -50 : canvas.width,
        y: lane,
        width: 50,
        height: 30,
        vx: speed,
        color: `hsl(${Math.random() * 360}, 70%, 50%)`
      });
    };

    // Spawn log
    const spawnLog = (lane) => {
      gameState.logs.push({
        x: -100,
        y: lane,
        width: 80,
        height: 30,
        vx: 2 + level * 0.3,
        color: '#8B4513'
      });
    };

    // Spawn turtle
    const spawnTurtle = (lane) => {
      gameState.turtles.push({
        x: canvas.width + 100,
        y: lane,
        width: 60,
        height: 30,
        vx: -(2 + level * 0.3),
        color: '#0a5',
        diving: false,
        diveTime: 0
      });
    };

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        gameState.frog.y = Math.max(0, gameState.frog.y - gameState.gridSize);
        soundManager.playSound('hop');
        if (gameState.frog.y < gameState.gridSize * 2) {
          // Reached top - level complete
          const newLevel = level + 1;
          setLevel(newLevel);
          soundManager.playSound('levelUp');
          setScore(prev => {
            const newScore = prev + 100 * level;
            if (newScore > highScore) {
              setHighScore(newScore);
              localStorage.setItem('froggerHighScore', newScore.toString());
            }
            return newScore;
          });
          gameState.frog.y = canvas.height - gameState.frog.height - 10;
          gameState.cars = [];
          gameState.logs = [];
          gameState.turtles = [];
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        gameState.frog.y = Math.min(canvas.height - gameState.frog.height, gameState.frog.y + gameState.gridSize);
        soundManager.playSound('hop');
      } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        gameState.frog.x = Math.max(0, gameState.frog.x - gameState.gridSize);
        soundManager.playSound('hop');
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        gameState.frog.x = Math.min(canvas.width - gameState.frog.width, gameState.frog.x + gameState.gridSize);
        soundManager.playSound('hop');
      }
    };

    // Touch handlers
    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      const frogCenterX = gameState.frog.x + gameState.frog.width / 2;
      const frogCenterY = gameState.frog.y + gameState.frog.height / 2;
      
      const dx = x - frogCenterX;
      const dy = y - frogCenterY;
      
      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal movement
        if (dx > 0) {
          gameState.frog.x = Math.min(canvas.width - gameState.frog.width, gameState.frog.x + gameState.gridSize);
        } else {
          gameState.frog.x = Math.max(0, gameState.frog.x - gameState.gridSize);
        }
      } else {
        // Vertical movement
        if (dy < 0) {
          gameState.frog.y = Math.max(0, gameState.frog.y - gameState.gridSize);
          if (gameState.frog.y < gameState.gridSize * 2) {
            const newLevel = level + 1;
            setLevel(newLevel);
            setScore(prev => {
              const newScore = prev + 100 * level;
              if (newScore > highScore) {
                setHighScore(newScore);
                localStorage.setItem('froggerHighScore', newScore.toString());
              }
              return newScore;
            });
            gameState.frog.y = canvas.height - gameState.frog.height - 10;
            gameState.cars = [];
            gameState.logs = [];
            gameState.turtles = [];
          }
        } else {
          gameState.frog.y = Math.min(canvas.height - gameState.frog.height, gameState.frog.y + gameState.gridSize);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = 0;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      if (!lastTime) lastTime = currentTime;
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Spawn cars (bottom section - roads)
      if (currentTime - gameState.lastCarSpawn > gameState.carSpawnInterval) {
        gameState.lastCarSpawn = currentTime;
        const lanes = [canvas.height - 80, canvas.height - 120, canvas.height - 160];
        spawnCar(lanes[Math.floor(Math.random() * lanes.length)]);
      }

      // Spawn logs (middle section - water)
      if (currentTime - gameState.lastLogSpawn > gameState.logSpawnInterval) {
        gameState.lastLogSpawn = currentTime;
        const lanes = [canvas.height / 2 - 40, canvas.height / 2 - 80, canvas.height / 2 - 120];
        spawnLog(lanes[Math.floor(Math.random() * lanes.length)]);
      }

      // Spawn turtles (middle section - water)
      if (currentTime - gameState.lastTurtleSpawn > gameState.turtleSpawnInterval) {
        gameState.lastTurtleSpawn = currentTime;
        const lanes = [canvas.height / 2 - 40, canvas.height / 2 - 80, canvas.height / 2 - 120];
        spawnTurtle(lanes[Math.floor(Math.random() * lanes.length)]);
      }

      // Update cars
      gameState.cars.forEach(car => {
        car.x += car.vx;
      });
      gameState.cars = gameState.cars.filter(car => car.x > -100 && car.x < canvas.width + 100);

      // Update logs
      gameState.logs.forEach(log => {
        log.x += log.vx;
      });
      gameState.logs = gameState.logs.filter(log => log.x < canvas.width + 200);

      // Update turtles
      gameState.turtles.forEach(turtle => {
        turtle.x += turtle.vx;
        // Turtles dive periodically
        if (Math.random() < 0.001) {
          turtle.diving = true;
          turtle.diveTime = Date.now();
        }
        if (turtle.diving && Date.now() - turtle.diveTime > 2000) {
          turtle.diving = false;
        }
      });
      gameState.turtles = gameState.turtles.filter(turtle => turtle.x > -200);

      // Check if frog is on water
      const inWater = gameState.frog.y < canvas.height / 2 && gameState.frog.y > gameState.gridSize * 2;
      if (inWater) {
        let onLogOrTurtle = false;
        
        // Check if on log
        gameState.logs.forEach(log => {
          if (gameState.frog.x < log.x + log.width &&
              gameState.frog.x + gameState.frog.width > log.x &&
              gameState.frog.y < log.y + log.height &&
              gameState.frog.y + gameState.frog.height > log.y) {
            onLogOrTurtle = true;
            gameState.frog.x += log.vx;
          }
        });

        // Check if on turtle
        gameState.turtles.forEach(turtle => {
          if (!turtle.diving &&
              gameState.frog.x < turtle.x + turtle.width &&
              gameState.frog.x + gameState.frog.width > turtle.x &&
              gameState.frog.y < turtle.y + turtle.height &&
              gameState.frog.y + gameState.frog.height > turtle.y) {
            onLogOrTurtle = true;
            gameState.frog.x += turtle.vx;
          }
        });

        if (!onLogOrTurtle) {
          // Drowned
          soundManager.playSound('splash');
          const newLives = lives - 1;
          setLives(newLives);
          if (newLives <= 0) {
            soundManager.playSound('gameOver');
            endGame();
            return;
          }
          gameState.frog.x = canvas.width / 2 - gameState.frog.width / 2;
          gameState.frog.y = canvas.height - gameState.frog.height - 10;
        }
      }

      // Check car collision
      gameState.cars.forEach(car => {
        if (gameState.frog.x < car.x + car.width &&
            gameState.frog.x + gameState.frog.width > car.x &&
            gameState.frog.y < car.y + car.height &&
            gameState.frog.y + gameState.frog.height > car.y) {
          soundManager.playSound('hit');
          const newLives = lives - 1;
          setLives(newLives);
          if (newLives <= 0) {
            soundManager.playSound('gameOver');
            endGame();
            return;
          }
          gameState.frog.x = canvas.width / 2 - gameState.frog.width / 2;
          gameState.frog.y = canvas.height - gameState.frog.height - 10;
        }
      });

      // Keep frog on screen
      gameState.frog.x = Math.max(0, Math.min(canvas.width - gameState.frog.width, gameState.frog.x));

      // Draw
      // Background - grass
      ctx.fillStyle = '#0a5';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Water section
      ctx.fillStyle = '#0066cc';
      ctx.fillRect(0, gameState.gridSize * 2, canvas.width, canvas.height / 2 - gameState.gridSize * 2);

      // Road section
      ctx.fillStyle = '#333';
      ctx.fillRect(0, canvas.height / 2, canvas.width, canvas.height / 2 - gameState.gridSize * 2);
      
      // Road lines
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 2;
      for (let y = canvas.height / 2 + 20; y < canvas.height - gameState.gridSize * 2; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Draw logs
      gameState.logs.forEach(log => {
        ctx.fillStyle = log.color;
        ctx.fillRect(log.x, log.y, log.width, log.height);
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 2;
        ctx.strokeRect(log.x, log.y, log.width, log.height);
      });

      // Draw turtles
      gameState.turtles.forEach(turtle => {
        if (!turtle.diving) {
          ctx.fillStyle = turtle.color;
          ctx.beginPath();
          ctx.arc(turtle.x + turtle.width / 2, turtle.y + turtle.height / 2, turtle.width / 2, 0, Math.PI * 2);
          ctx.fill();
          // Shell pattern
          ctx.strokeStyle = '#0a3';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(turtle.x + turtle.width / 2, turtle.y + turtle.height / 2, turtle.width / 2, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      // Draw cars
      gameState.cars.forEach(car => {
        ctx.fillStyle = car.color;
        ctx.fillRect(car.x, car.y, car.width, car.height);
        // Windows
        ctx.fillStyle = '#000';
        ctx.fillRect(car.x + 5, car.y + 5, 15, 10);
        ctx.fillRect(car.x + car.width - 20, car.y + 5, 15, 10);
      });

      // Draw frog
      ctx.fillStyle = '#0f0';
      ctx.beginPath();
      ctx.arc(
        gameState.frog.x + gameState.frog.width / 2,
        gameState.frog.y + gameState.frog.height / 2,
        gameState.frog.width / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
      // Eyes
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(gameState.frog.x + gameState.frog.width / 2 - 5, gameState.frog.y + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gameState.frog.x + gameState.frog.width / 2 + 5, gameState.frog.y + 5, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(gameState.frog.x + gameState.frog.width / 2 - 5, gameState.frog.y + 5, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(gameState.frog.x + gameState.frog.width / 2 + 5, gameState.frog.y + 5, 2, 0, Math.PI * 2);
      ctx.fill();

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
      frog: { x: 0, y: 0, width: 30, height: 30 },
      cars: [],
      logs: [],
      turtles: [],
      gridSize: 40,
      lastCarSpawn: 0,
      carSpawnInterval: 2000,
      lastLogSpawn: 0,
      logSpawnInterval: 2500,
      lastTurtleSpawn: 0,
      turtleSpawnInterval: 3000
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
        <h1>Frogger</h1>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Guide the frog to the top of the screen. Avoid cars and don't fall in water!
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Arrow Keys or W/A/S/D to move
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Tap where you want to move
                </p>
                <p style={{ color: '#9da7b8', marginTop: '8px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                  <strong style={{ color: '#fff' }}>Tip:</strong> Stay on logs and turtles in the water section!
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
                • Touch: Tap to move
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
              background: '#0a5',
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
