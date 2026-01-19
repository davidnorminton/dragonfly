import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function BreakoutPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [level, setLevel] = useState(1);
  const gameStateRef = useRef({
    paddle: { x: 0, y: 0, width: 100, height: 10, speed: 5 },
    ball: { x: 0, y: 0, width: 10, height: 10, vx: 4, vy: -4 },
    blocks: [],
    keys: {},
    lastBulletTime: 0
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize blocks
    const initBlocks = () => {
      gameState.blocks = [];
      const rows = 5 + Math.floor(level / 2);
      const cols = 10;
      const blockWidth = 70;
      const blockHeight = 20;
      const spacing = 5;
      const startX = (canvas.width - (cols * (blockWidth + spacing) - spacing)) / 2;
      const startY = 50;

      const colors = ['#ff0000', '#ff8800', '#ffff00', '#00ff00', '#0088ff', '#8800ff'];

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          gameState.blocks.push({
            x: startX + col * (blockWidth + spacing),
            y: startY + row * (blockHeight + spacing),
            width: blockWidth,
            height: blockHeight,
            alive: true,
            color: colors[row % colors.length],
            points: (rows - row) * 10
          });
        }
      }
    };

    // Initialize positions
    gameState.paddle.x = canvas.width / 2 - gameState.paddle.width / 2;
    gameState.paddle.y = canvas.height - 30;
    gameState.ball.x = canvas.width / 2;
    gameState.ball.y = canvas.height - 50;
    gameState.ball.vx = (Math.random() > 0.5 ? 1 : -1) * (4 + level * 0.5);
    gameState.ball.vy = -(4 + level * 0.5);
    initBlocks();

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

      if (x < canvas.width / 2) {
        gameState.keys['ArrowLeft'] = true;
      } else {
        gameState.keys['ArrowRight'] = true;
      }
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

        gameState.keys['ArrowLeft'] = false;
        gameState.keys['ArrowRight'] = false;

        if (x < canvas.width / 2) {
          gameState.keys['ArrowLeft'] = true;
        } else {
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

      // Move paddle
      if (gameState.keys['ArrowLeft']) {
        gameState.paddle.x = Math.max(0, gameState.paddle.x - gameState.paddle.speed);
      }
      if (gameState.keys['ArrowRight']) {
        gameState.paddle.x = Math.min(canvas.width - gameState.paddle.width, gameState.paddle.x + gameState.paddle.speed);
      }

      // Move ball
      gameState.ball.x += gameState.ball.vx;
      gameState.ball.y += gameState.ball.vy;

      // Ball collision with walls
      if (gameState.ball.x <= 0 || gameState.ball.x + gameState.ball.width >= canvas.width) {
        gameState.ball.vx = -gameState.ball.vx;
        soundManager.playSound('bounce');
      }
      if (gameState.ball.y <= 0) {
        gameState.ball.vy = -gameState.ball.vy;
        soundManager.playSound('bounce');
      }

      // Ball collision with paddle
      if (gameState.ball.x <= gameState.paddle.x + gameState.paddle.width &&
          gameState.ball.x + gameState.ball.width >= gameState.paddle.x &&
          gameState.ball.y + gameState.ball.height >= gameState.paddle.y &&
          gameState.ball.y <= gameState.paddle.y + gameState.paddle.height &&
          gameState.ball.vy > 0) {
        gameState.ball.vy = -Math.abs(gameState.ball.vy);
        // Add angle based on where ball hits paddle
        const hitPos = (gameState.ball.x - gameState.paddle.x) / gameState.paddle.width;
        gameState.ball.vx = (hitPos - 0.5) * 8;
        soundManager.playSound('bounce');
      }

      // Ball collision with blocks
      gameState.blocks.forEach(block => {
        if (!block.alive) return;
        if (gameState.ball.x < block.x + block.width &&
            gameState.ball.x + gameState.ball.width > block.x &&
            gameState.ball.y < block.y + block.height &&
            gameState.ball.y + gameState.ball.height > block.y) {
          block.alive = false;
          soundManager.playSound('break');
          setScore(prev => prev + block.points);
          
          // Determine bounce direction
          const ballCenterX = gameState.ball.x + gameState.ball.width / 2;
          const ballCenterY = gameState.ball.y + gameState.ball.height / 2;
          const blockCenterX = block.x + block.width / 2;
          const blockCenterY = block.y + block.height / 2;
          
          const dx = ballCenterX - blockCenterX;
          const dy = ballCenterY - blockCenterY;
          
          if (Math.abs(dx) > Math.abs(dy)) {
            gameState.ball.vx = dx > 0 ? Math.abs(gameState.ball.vx) : -Math.abs(gameState.ball.vx);
          } else {
            gameState.ball.vy = dy > 0 ? Math.abs(gameState.ball.vy) : -Math.abs(gameState.ball.vy);
          }
        }
      });

      // Check if ball fell off bottom
      if (gameState.ball.y > canvas.height) {
        const newLives = lives - 1;
        setLives(newLives);
        if (newLives <= 0) {
          soundManager.playSound('gameOver');
          setGameOver(true);
          return;
        }
        // Reset ball
        gameState.ball.x = canvas.width / 2;
        gameState.ball.y = canvas.height - 50;
        gameState.ball.vx = (Math.random() > 0.5 ? 1 : -1) * (4 + level * 0.5);
        gameState.ball.vy = -(4 + level * 0.5);
      }

      // Check level completion
      const aliveBlocks = gameState.blocks.filter(b => b.alive);
      if (aliveBlocks.length === 0) {
        const newLevel = level + 1;
        setLevel(newLevel);
        soundManager.playSound('levelUp');
        setScore(prev => prev + 500 * level);
        // Reset for next level
        gameState.ball.x = canvas.width / 2;
        gameState.ball.y = canvas.height - 50;
        gameState.ball.vx = (Math.random() > 0.5 ? 1 : -1) * (4 + newLevel * 0.5);
        gameState.ball.vy = -(4 + newLevel * 0.5);
        initBlocks();
      }

      // Draw blocks
      gameState.blocks.forEach(block => {
        if (block.alive) {
          ctx.fillStyle = block.color;
          ctx.fillRect(block.x, block.y, block.width, block.height);
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.strokeRect(block.x, block.y, block.width, block.height);
        }
      });

      // Draw paddle
      ctx.fillStyle = '#0f0';
      ctx.fillRect(gameState.paddle.x, gameState.paddle.y, gameState.paddle.width, gameState.paddle.height);

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
  }, [gameStarted, gameOver, level, lives]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
    gameStateRef.current = {
      paddle: { x: 0, y: 0, width: 100, height: 10, speed: 5 },
      ball: { x: 0, y: 0, width: 10, height: 10, vx: 4, vy: -4 },
      blocks: [],
      keys: {},
      lastBulletTime: 0
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
        <h1>Breakout</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Score: <strong>{score}</strong> | Lives: <strong>{lives}</strong> | Level: <strong>{level}</strong>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Break all blocks with your paddle and ball. Clear levels to progress.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Left/Right Arrow Keys to move paddle
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
                • Touch: Left/Right sides
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
