import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function PongPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState({ player: 0, ai: 0 });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    playerPaddle: { x: 0, y: 0, width: 10, height: 80, speed: 5 },
    aiPaddle: { x: 0, y: 0, width: 10, height: 80, speed: 4 },
    ball: { x: 0, y: 0, width: 10, height: 10, vx: 5, vy: 5 },
    keys: {}
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize positions
    gameState.playerPaddle.x = 20;
    gameState.playerPaddle.y = canvas.height / 2 - gameState.playerPaddle.height / 2;
    gameState.aiPaddle.x = canvas.width - 30;
    gameState.aiPaddle.y = canvas.height / 2 - gameState.aiPaddle.height / 2;
    gameState.ball.x = canvas.width / 2;
    gameState.ball.y = canvas.height / 2;
    gameState.ball.vx = (Math.random() > 0.5 ? 1 : -1) * 5;
    gameState.ball.vy = (Math.random() > 0.5 ? 1 : -1) * 5;

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        gameState.keys['ArrowUp'] = true;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        gameState.keys['ArrowDown'] = true;
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        gameState.keys['ArrowUp'] = false;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        gameState.keys['ArrowDown'] = false;
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

      // Draw center line
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(canvas.width / 2, 0);
      ctx.lineTo(canvas.width / 2, canvas.height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Move player paddle
      if (gameState.keys['ArrowUp']) {
        gameState.playerPaddle.y = Math.max(0, gameState.playerPaddle.y - gameState.playerPaddle.speed);
      }
      if (gameState.keys['ArrowDown']) {
        gameState.playerPaddle.y = Math.min(canvas.height - gameState.playerPaddle.height, gameState.playerPaddle.y + gameState.playerPaddle.speed);
      }

      // AI paddle (follows ball)
      const aiCenter = gameState.aiPaddle.y + gameState.aiPaddle.height / 2;
      const ballCenter = gameState.ball.y + gameState.ball.height / 2;
      if (aiCenter < ballCenter - 5) {
        gameState.aiPaddle.y = Math.min(canvas.height - gameState.aiPaddle.height, gameState.aiPaddle.y + gameState.aiPaddle.speed);
      } else if (aiCenter > ballCenter + 5) {
        gameState.aiPaddle.y = Math.max(0, gameState.aiPaddle.y - gameState.aiPaddle.speed);
      }

      // Move ball
      gameState.ball.x += gameState.ball.vx;
      gameState.ball.y += gameState.ball.vy;

      // Ball collision with top/bottom walls
      if (gameState.ball.y <= 0 || gameState.ball.y + gameState.ball.height >= canvas.height) {
        gameState.ball.vy = -gameState.ball.vy;
        soundManager.playSound('bounce');
      }

      // Ball collision with player paddle
      if (gameState.ball.x <= gameState.playerPaddle.x + gameState.playerPaddle.width &&
          gameState.ball.x + gameState.ball.width >= gameState.playerPaddle.x &&
          gameState.ball.y <= gameState.playerPaddle.y + gameState.playerPaddle.height &&
          gameState.ball.y + gameState.ball.height >= gameState.playerPaddle.y) {
        gameState.ball.vx = Math.abs(gameState.ball.vx);
        // Add some angle based on where ball hits paddle
        const hitPos = (gameState.ball.y - gameState.playerPaddle.y) / gameState.playerPaddle.height;
        gameState.ball.vy = (hitPos - 0.5) * 10;
        soundManager.playSound('bounce');
      }

      // Ball collision with AI paddle
      if (gameState.ball.x + gameState.ball.width >= gameState.aiPaddle.x &&
          gameState.ball.x <= gameState.aiPaddle.x + gameState.aiPaddle.width &&
          gameState.ball.y <= gameState.aiPaddle.y + gameState.aiPaddle.height &&
          gameState.ball.y + gameState.ball.height >= gameState.aiPaddle.y) {
        gameState.ball.vx = -Math.abs(gameState.ball.vx);
        // Add some angle based on where ball hits paddle
        const hitPos = (gameState.ball.y - gameState.aiPaddle.y) / gameState.aiPaddle.height;
        gameState.ball.vy = (hitPos - 0.5) * 10;
        soundManager.playSound('bounce');
      }

      // Score points
      if (gameState.ball.x < 0) {
        soundManager.playSound('score');
        setScore(prev => ({ ...prev, ai: prev.ai + 1 }));
        // Reset ball
        gameState.ball.x = canvas.width / 2;
        gameState.ball.y = canvas.height / 2;
        gameState.ball.vx = 5;
        gameState.ball.vy = (Math.random() > 0.5 ? 1 : -1) * 5;
      } else if (gameState.ball.x > canvas.width) {
        soundManager.playSound('score');
        setScore(prev => ({ ...prev, player: prev.player + 1 }));
        // Reset ball
        gameState.ball.x = canvas.width / 2;
        gameState.ball.y = canvas.height / 2;
        gameState.ball.vx = -5;
        gameState.ball.vy = (Math.random() > 0.5 ? 1 : -1) * 5;
      }

      // Draw paddles
      ctx.fillStyle = '#0f0';
      ctx.fillRect(gameState.playerPaddle.x, gameState.playerPaddle.y, gameState.playerPaddle.width, gameState.playerPaddle.height);
      ctx.fillStyle = '#f00';
      ctx.fillRect(gameState.aiPaddle.x, gameState.aiPaddle.y, gameState.aiPaddle.width, gameState.aiPaddle.height);

      // Draw ball
      ctx.fillStyle = '#fff';
      ctx.fillRect(gameState.ball.x, gameState.ball.y, gameState.ball.width, gameState.ball.height);

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
  }, [gameStarted, gameOver]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore({ player: 0, ai: 0 });
    gameStateRef.current = {
      playerPaddle: { x: 0, y: 0, width: 10, height: 80, speed: 5 },
      aiPaddle: { x: 0, y: 0, width: 10, height: 80, speed: 4 },
      ball: { x: 0, y: 0, width: 10, height: 10, vx: 5, vy: 5 },
      keys: {}
    };
  };

  const handleRestart = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore({ player: 0, ai: 0 });
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Pong</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            <span style={{ color: '#0f0' }}>You: <strong>{score.player}</strong></span>
            {' '} | {' '}
            <span style={{ color: '#f00' }}>AI: <strong>{score.ai}</strong></span>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Bounce the ball past your opponent's paddle to score points.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Up/Down Arrow Keys or W/S to move paddle
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Top half = move up, Bottom half = move down
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
                <p style={{ color: '#fff', marginBottom: '16px', fontSize: '1.2rem' }}>
                  Final Score: <span style={{ color: '#0f0' }}>You {score.player}</span> - <span style={{ color: '#f00' }}>AI {score.ai}</span>
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
                • Up/Down Arrows or W/S: Move
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Touch: Top/Bottom halves
              </p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={800}
            height={400}
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
