import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function TetrisPage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('tetrisHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const gameStateRef = useRef({
    board: [],
    currentPiece: null,
    nextPiece: null,
    dropTime: 0,
    lastTime: 0,
    keys: {},
    gridSize: 30,
    cols: 10,
    rows: 20
  });

  // Tetris pieces (Tetrominoes)
  const pieces = [
    { shape: [[1, 1, 1, 1]], color: '#00f0f0' }, // I
    { shape: [[1, 1], [1, 1]], color: '#f0f000' }, // O
    { shape: [[0, 1, 0], [1, 1, 1]], color: '#a000f0' }, // T
    { shape: [[0, 1, 1], [1, 1, 0]], color: '#00f000' }, // S
    { shape: [[1, 1, 0], [0, 1, 1]], color: '#f00000' }, // Z
    { shape: [[1, 0, 0], [1, 1, 1]], color: '#0000f0' }, // J
    { shape: [[0, 0, 1], [1, 1, 1]], color: '#f0a000' }  // L
  ];

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;

    // Initialize board
    const initBoard = () => {
      gameState.board = Array(gameState.rows).fill(null).map(() => Array(gameState.cols).fill(0));
    };

    // Create new piece
    const createPiece = () => {
      const pieceType = pieces[Math.floor(Math.random() * pieces.length)];
      return {
        shape: pieceType.shape.map(row => [...row]),
        color: pieceType.color,
        x: Math.floor(gameState.cols / 2) - Math.floor(pieceType.shape[0].length / 2),
        y: 0
      };
    };

    // Check collision
    const checkCollision = (piece, dx = 0, dy = 0, rotatedShape = null) => {
      const shape = rotatedShape || piece.shape;
      for (let y = 0; y < shape.length; y++) {
        for (let x = 0; x < shape[y].length; x++) {
          if (shape[y][x]) {
            const newX = piece.x + x + dx;
            const newY = piece.y + y + dy;
            if (newX < 0 || newX >= gameState.cols || newY >= gameState.rows) {
              return true;
            }
            if (newY >= 0 && gameState.board[newY][newX]) {
              return true;
            }
          }
        }
      }
      return false;
    };

    // Rotate piece
    const rotatePiece = (piece) => {
      const rotated = piece.shape[0].map((_, i) => 
        piece.shape.map(row => row[i]).reverse()
      );
      if (!checkCollision(piece, 0, 0, rotated)) {
        piece.shape = rotated;
      }
    };

    // Place piece on board
    const placePiece = (piece) => {
      for (let y = 0; y < piece.shape.length; y++) {
        for (let x = 0; x < piece.shape[y].length; x++) {
          if (piece.shape[y][x]) {
            const boardY = piece.y + y;
            const boardX = piece.x + x;
            if (boardY >= 0) {
              gameState.board[boardY][boardX] = piece.color;
            }
          }
        }
      }
    };

    // Clear lines
    const clearLines = () => {
      let linesCleared = 0;
      
      // Build a new board with only non-full lines
      const newBoard = [];
      
      // Go through each line from bottom to top
      for (let y = gameState.rows - 1; y >= 0; y--) {
        // Check if this line is completely filled
        const isLineFull = gameState.board[y].every(cell => cell !== 0);
        
        if (!isLineFull) {
          // Keep this line (add to new board from bottom)
          newBoard.unshift([...gameState.board[y]]);
        } else {
          // This line is full, skip it (don't add to new board)
          linesCleared++;
        }
      }
      
      // Pad the top with empty lines to maintain board height
      while (newBoard.length < gameState.rows) {
        newBoard.unshift(Array(gameState.cols).fill(0));
      }
      
      // Replace the board
      gameState.board = newBoard;
      
      if (linesCleared > 0) {
        soundManager.playSound('break');
        const newLevel = Math.floor((lines + linesCleared) / 10) + 1;
        if (newLevel > level) {
          soundManager.playSound('levelUp');
        }
        setLines(prev => {
          const newLines = prev + linesCleared;
          setLevel(Math.floor(newLines / 10) + 1);
          return newLines;
        });
        setScore(prev => {
          const points = [0, 100, 300, 500, 800][linesCleared] * level;
          const newScore = prev + points;
          if (newScore > highScore) {
            setHighScore(newScore);
            localStorage.setItem('tetrisHighScore', newScore.toString());
          }
          return newScore;
        });
      }
    };

    // Initialize
    initBoard();
    gameState.currentPiece = createPiece();
    gameState.nextPiece = createPiece();
    gameState.dropTime = 0;
    gameState.lastTime = 0;

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        if (!checkCollision(gameState.currentPiece, -1, 0)) {
          gameState.currentPiece.x--;
        }
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        if (!checkCollision(gameState.currentPiece, 1, 0)) {
          gameState.currentPiece.x++;
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        if (!checkCollision(gameState.currentPiece, 0, 1)) {
          gameState.currentPiece.y++;
        }
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        rotatePiece(gameState.currentPiece);
      } else if (e.key === ' ') {
        e.preventDefault();
        // Hard drop
        while (!checkCollision(gameState.currentPiece, 0, 1)) {
          gameState.currentPiece.y++;
        }
      }
    };

    // Touch handlers
    let touchStartX = 0;
    let touchStartY = 0;

    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      if (!touchStartX || !touchStartY) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStartX;
      const deltaY = touch.clientY - touchStartY;
      const minSwipeDistance = 30;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > minSwipeDistance) {
          if (deltaX > 0) {
            if (!checkCollision(gameState.currentPiece, 1, 0)) {
              gameState.currentPiece.x++;
            }
          } else {
            if (!checkCollision(gameState.currentPiece, -1, 0)) {
              gameState.currentPiece.x--;
            }
          }
        }
      } else {
        if (Math.abs(deltaY) > minSwipeDistance) {
          if (deltaY > 0) {
            // Down - move down
            if (!checkCollision(gameState.currentPiece, 0, 1)) {
              gameState.currentPiece.y++;
            }
          } else {
            // Up - rotate
            rotatePiece(gameState.currentPiece);
          }
        }
      }

      touchStartX = 0;
      touchStartY = 0;
    };

    window.addEventListener('keydown', handleKeyDown);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Game loop
    let animationFrameId;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      const dropInterval = Math.max(1000 - (level * 100), 100);

      if (currentTime - gameState.dropTime > dropInterval) {
        gameState.dropTime = currentTime;

        if (!checkCollision(gameState.currentPiece, 0, 1)) {
          gameState.currentPiece.y++;
        } else {
          placePiece(gameState.currentPiece);
          clearLines();
          gameState.currentPiece = gameState.nextPiece;
          gameState.nextPiece = createPiece();

          if (checkCollision(gameState.currentPiece)) {
            soundManager.playSound('gameOver');
            endGame();
            return;
          }
        }
      }

      // Draw
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw board
      const gridSize = gameState.gridSize;
      for (let y = 0; y < gameState.rows; y++) {
        for (let x = 0; x < gameState.cols; x++) {
          if (gameState.board[y][x]) {
            ctx.fillStyle = gameState.board[y][x];
            ctx.fillRect(x * gridSize, y * gridSize, gridSize - 1, gridSize - 1);
          }
        }
      }

      // Draw current piece
      if (gameState.currentPiece) {
        ctx.fillStyle = gameState.currentPiece.color;
        for (let y = 0; y < gameState.currentPiece.shape.length; y++) {
          for (let x = 0; x < gameState.currentPiece.shape[y].length; x++) {
            if (gameState.currentPiece.shape[y][x]) {
              ctx.fillRect(
                (gameState.currentPiece.x + x) * gridSize,
                (gameState.currentPiece.y + y) * gridSize,
                gridSize - 1,
                gridSize - 1
              );
            }
          }
        }
      }

      // Draw grid
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      for (let x = 0; x <= gameState.cols; x++) {
        ctx.beginPath();
        ctx.moveTo(x * gridSize, 0);
        ctx.lineTo(x * gridSize, gameState.rows * gridSize);
        ctx.stroke();
      }
      for (let y = 0; y <= gameState.rows; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * gridSize);
        ctx.lineTo(gameState.cols * gridSize, y * gridSize);
        ctx.stroke();
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
      canvas.removeEventListener('touchstart', handleTouchStart);
      canvas.removeEventListener('touchend', handleTouchEnd);
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStarted, gameOver, level, highScore]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLines(0);
    setLevel(1);
    gameStateRef.current = {
      board: [],
      currentPiece: null,
      nextPiece: null,
      dropTime: 0,
      lastTime: 0,
      keys: {},
      gridSize: 30,
      cols: 10,
      rows: 20
    };
  };

  const handleRestart = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
    setLines(0);
    setLevel(1);
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Tetris</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Score: <strong>{score}</strong> | Lines: <strong>{lines}</strong> | Level: <strong>{level}</strong> | High: <strong>{highScore}</strong>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Arrange falling blocks to clear horizontal lines. Clear lines to score and level up.
                </p>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Arrow Keys to move/rotate, Space for hard drop
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Swipe to move, Swipe up to rotate
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
                  Lines Cleared: <strong>{lines}</strong> | Level: <strong>{level}</strong>
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
                • Arrow Keys: Move/Rotate
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Space: Hard Drop
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Touch: Swipe to move/rotate
              </p>
            </div>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <canvas
            ref={canvasRef}
            width={300}
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
