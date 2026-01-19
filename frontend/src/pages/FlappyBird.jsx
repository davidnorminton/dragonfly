import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function FlappyBirdPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('flappyHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    bird: { x: 0, y: 0, width: 30, height: 30, vy: 0 },
    pipes: [],
    gravity: 0.5,
    jumpPower: -8,
    pipeSpeed: 3,
    pipeGap: 150,
    lastPipeTime: 0,
    pipeInterval: 2000
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize bird
    gameState.bird.x = canvas.width / 4;
    gameState.bird.y = canvas.height / 2;
    gameState.bird.vy = 0;
    gameState.pipes = [];
    gameState.lastPipeTime = 0;

    // Jump function
    const jump = () => {
      if (gameOver) return;
      gameState.bird.vy = gameState.jumpPower;
      soundManager.playSound('flap');
    };

    // Keyboard handler
    const handleKeyDown = (e) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        jump();
      }
    };

    // Touch handler
    const handleTouchStart = (e) => {
      e.preventDefault();
      jump();
    };

    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = 0;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Update bird
      gameState.bird.vy += gameState.gravity;
      gameState.bird.y += gameState.bird.vy;

      // Check bird boundaries
      if (gameState.bird.y < 0) {
        gameState.bird.y = 0;
        gameState.bird.vy = 0;
      }
      if (gameState.bird.y + gameState.bird.height > canvas.height) {
        endGame();
        return;
      }

      // Generate pipes
      if (currentTime - gameState.lastPipeTime > gameState.pipeInterval) {
        gameState.lastPipeTime = currentTime;
        const gapY = Math.random() * (canvas.height - gameState.pipeGap - 100) + 50;
        gameState.pipes.push({
          x: canvas.width,
          topHeight: gapY,
          bottomY: gapY + gameState.pipeGap,
          bottomHeight: canvas.height - (gapY + gameState.pipeGap),
          passed: false
        });
      }

      // Update pipes
      gameState.pipes.forEach(pipe => {
        pipe.x -= gameState.pipeSpeed;

        // Check collision
        if (gameState.bird.x < pipe.x + 50 &&
            gameState.bird.x + gameState.bird.width > pipe.x &&
            (gameState.bird.y < pipe.topHeight || gameState.bird.y + gameState.bird.height > pipe.bottomY)) {
          endGame();
          return;
        }

        // Score point
        if (!pipe.passed && gameState.bird.x > pipe.x + 50) {
          pipe.passed = true;
          soundManager.playSound('score');
          setScore(prev => {
            const newScore = prev + 1;
            if (newScore > highScore) {
              setHighScore(newScore);
              localStorage.setItem('flappyHighScore', newScore.toString());
            }
            return newScore;
          });
        }
      });

      // Remove off-screen pipes
      gameState.pipes = gameState.pipes.filter(pipe => pipe.x + 50 > 0);

      // Draw
      // Sky gradient
      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#87CEEB');
      gradient.addColorStop(1, '#98D8E8');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw pipes with better detail
      gameState.pipes.forEach(pipe => {
        const pipeWidth = 60;
        
        // Top pipe body
        ctx.fillStyle = '#0a5';
        ctx.fillRect(pipe.x, 0, pipeWidth, pipe.topHeight);
        
        // Top pipe highlight
        ctx.fillStyle = '#0c7';
        ctx.fillRect(pipe.x, 0, 5, pipe.topHeight);
        
        // Top pipe shadow
        ctx.fillStyle = '#083';
        ctx.fillRect(pipe.x + pipeWidth - 5, 0, 5, pipe.topHeight);
        
        // Top pipe cap
        ctx.fillStyle = '#0f0';
        ctx.fillRect(pipe.x - 8, pipe.topHeight - 30, pipeWidth + 16, 30);
        ctx.fillStyle = '#0c7';
        ctx.fillRect(pipe.x - 8, pipe.topHeight - 30, 5, 30);
        ctx.fillStyle = '#083';
        ctx.fillRect(pipe.x + pipeWidth + 11, pipe.topHeight - 30, 5, 30);
        
        // Bottom pipe body
        ctx.fillStyle = '#0a5';
        ctx.fillRect(pipe.x, pipe.bottomY, pipeWidth, pipe.bottomHeight);
        
        // Bottom pipe highlight
        ctx.fillStyle = '#0c7';
        ctx.fillRect(pipe.x, pipe.bottomY, 5, pipe.bottomHeight);
        
        // Bottom pipe shadow
        ctx.fillStyle = '#083';
        ctx.fillRect(pipe.x + pipeWidth - 5, pipe.bottomY, 5, pipe.bottomHeight);
        
        // Bottom pipe cap
        ctx.fillStyle = '#0f0';
        ctx.fillRect(pipe.x - 8, pipe.bottomY, pipeWidth + 16, 30);
        ctx.fillStyle = '#0c7';
        ctx.fillRect(pipe.x - 8, pipe.bottomY, 5, 30);
        ctx.fillStyle = '#083';
        ctx.fillRect(pipe.x + pipeWidth + 11, pipe.bottomY, 5, 30);
      });

      // Draw bird with better sprite
      const birdX = gameState.bird.x + gameState.bird.width / 2;
      const birdY = gameState.bird.y + gameState.bird.height / 2;
      const birdSize = gameState.bird.width / 2;
      
      // Wing animation based on velocity
      const wingAngle = Math.sin(Date.now() / 100) * 0.3 * (gameState.bird.vy < 0 ? 1 : 0.5);
      
      ctx.save();
      ctx.translate(birdX, birdY);
      ctx.rotate(wingAngle);
      
      // Bird body (ellipse)
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.ellipse(0, 0, birdSize * 0.7, birdSize * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Bird body highlight
      ctx.fillStyle = '#fff700';
      ctx.beginPath();
      ctx.ellipse(-birdSize * 0.2, -birdSize * 0.3, birdSize * 0.3, birdSize * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Wing (animated)
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.ellipse(-birdSize * 0.3, 0, birdSize * 0.4, birdSize * 0.6, wingAngle, 0, Math.PI * 2);
      ctx.fill();
      
      // Wing detail
      ctx.fillStyle = '#ff8800';
      ctx.beginPath();
      ctx.ellipse(-birdSize * 0.4, birdSize * 0.1, birdSize * 0.2, birdSize * 0.3, wingAngle, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.restore();
      
      // Beak
      ctx.fillStyle = '#ff6600';
      ctx.beginPath();
      ctx.moveTo(birdX + birdSize * 0.5, birdY);
      ctx.lineTo(birdX + birdSize * 0.9, birdY - birdSize * 0.2);
      ctx.lineTo(birdX + birdSize * 0.9, birdY + birdSize * 0.2);
      ctx.closePath();
      ctx.fill();
      
      // Eye
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(birdX + birdSize * 0.2, birdY - birdSize * 0.3, birdSize * 0.15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(birdX + birdSize * 0.25, birdY - birdSize * 0.3, birdSize * 0.1, 0, Math.PI * 2);
      ctx.fill();
      
      // Eye shine
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(birdX + birdSize * 0.27, birdY - birdSize * 0.32, birdSize * 0.04, 0, Math.PI * 2);
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
  }, [gameStarted, gameOver, highScore]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    gameStateRef.current = {
      bird: { x: 0, y: 0, width: 30, height: 30, vy: 0 },
      pipes: [],
      gravity: 0.5,
      jumpPower: -8,
      pipeSpeed: 3,
      pipeGap: 150,
      lastPipeTime: 0,
      pipeInterval: 2000
    };
  };

  const handleRestart = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Flappy Bird</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Score: <strong>{score}</strong> | High: <strong>{highScore}</strong>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Navigate the bird through pipes without hitting them.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Press Space, Arrow Up, or W to flap.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Tap anywhere on the screen to flap.
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Scoring:</strong> Pass through pipes to earn points.
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
                • Space/Arrow Up/W: Flap
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Tap screen: Flap
              </p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={400}
            height={600}
            style={{
              border: '2px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              background: '#87CEEB',
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
