import { useState, useEffect, useRef } from 'react';
import { soundManager } from '../utils/soundManager';
import { GameMuteButton } from '../components/GameMuteButton';

export function GoldenAxePage({ selectedUser, onNavigate }) {
  const canvasRef = useRef(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [level, setLevel] = useState(1);
  const [magic, setMagic] = useState(3);
  const [highScore, setHighScore] = useState(() => {
    return parseInt(localStorage.getItem('goldenAxeHighScore') || '0', 10);
  });
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [character, setCharacter] = useState('warrior'); // warrior, amazon, dwarf
  const attackKeyHeldRef = useRef(false);
  const gameStateRef = useRef({
    player: { x: 100, y: 0, depth: 0, width: 40, height: 50, vx: 0, vy: 0, vdepth: 0, onGround: false, facing: 1, attacking: false, attackTime: 0, attackChecked: false, attackCombo: 0, jumping: false, running: false, runTime: 0, health: 100 },
    enemies: [],
    projectiles: [],
    background: { x: 0, parallax1: 0, parallax2: 0 },
    keys: {},
    lastEnemySpawn: 0,
    enemySpawnInterval: 3000,
    camera: { x: 0 },
    magicActive: false,
    magicTime: 0
  });

  useEffect(() => {
    if (!gameStarted) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const gameState = gameStateRef.current;
    const groundY = canvas.height - 100;
    const depthRange = 60; // How far forward/back characters can move
    const baseDepth = 0; // Center depth position

    // Initialize player
    gameState.player.y = groundY - gameState.player.height;
    gameState.player.depth = baseDepth;
    gameState.player.onGround = true;
    gameState.player.health = 100;

    // Character stats
    const characterStats = {
      warrior: { speed: 3, jumpPower: -12, attackDamage: 20, color: '#8B4513' },
      amazon: { speed: 4, jumpPower: -13, attackDamage: 15, color: '#FFD700' },
      dwarf: { speed: 2.5, jumpPower: -10, attackDamage: 25, color: '#654321' }
    };
    const stats = characterStats[character];

    // Spawn enemy
    const spawnEnemy = () => {
      const types = ['skeleton', 'knight', 'gargoyle'];
      const type = types[Math.floor(Math.random() * types.length)];
      
      // Random depth for enemy spawn
      const enemyDepth = (Math.random() - 0.5) * depthRange;
      const depthYOffset = enemyDepth * 0.3;
      
      let enemy;
      if (type === 'skeleton') {
        enemy = {
          x: canvas.width + 50,
          y: groundY - 40 - depthYOffset,
          depth: enemyDepth,
          width: 35,
          height: 40,
          vx: -1.5 - level * 0.2,
          health: 30 + level * 10,
          maxHealth: 30 + level * 10,
          type: 'skeleton',
          attacking: false,
          attackTime: 0,
          stunned: false,
          stunTime: 0,
          color: '#C0C0C0'
        };
      } else if (type === 'knight') {
        enemy = {
          x: canvas.width + 50,
          y: groundY - 45 - depthYOffset,
          depth: enemyDepth,
          width: 40,
          height: 45,
          vx: -2 - level * 0.2,
          health: 50 + level * 15,
          maxHealth: 50 + level * 15,
          type: 'knight',
          attacking: false,
          attackTime: 0,
          stunned: false,
          stunTime: 0,
          color: '#4169E1'
        };
      } else {
        enemy = {
          x: canvas.width + 50,
          y: groundY - 50 - depthYOffset,
          depth: enemyDepth,
          width: 45,
          height: 50,
          vx: -1 - level * 0.15,
          health: 80 + level * 20,
          maxHealth: 80 + level * 20,
          type: 'gargoyle',
          attacking: false,
          attackTime: 0,
          stunned: false,
          stunTime: 0,
          color: '#2F4F4F'
        };
      }
      
      gameState.enemies.push(enemy);
    };

    // Attack function with combo system
    const attack = (isJumpAttack = false, isDashAttack = false) => {
      const now = Date.now();
      
      // Jump attack (always available, knocks down)
      if (isJumpAttack && !gameState.player.onGround) {
        gameState.player.attacking = true;
        gameState.player.attackTime = now;
        gameState.player.attackCombo = 0;
        gameState.player.attackChecked = false;
        soundManager.playSound('attack');
        return;
      }
      
      // Dash attack (powerful, knocks down)
      if (isDashAttack && gameState.player.running) {
        gameState.player.attacking = true;
        gameState.player.attackTime = now;
        gameState.player.attackCombo = 0;
        gameState.player.attackChecked = false;
        soundManager.playSound('attack');
        return;
      }
      
      // Combo system - can chain attacks
      if (gameState.player.attacking) {
        const timeSinceAttack = now - gameState.player.attackTime;
        // If within combo window (300ms) and not at max combo, continue combo
        if (timeSinceAttack < 300 && gameState.player.attackCombo < 3) {
          gameState.player.attackCombo++;
          gameState.player.attackTime = now;
          gameState.player.attackChecked = false; // Allow new hit check
          soundManager.playSound('attack');
          return;
        }
        // If attack animation is still playing, don't start new attack
        if (timeSinceAttack < 300) return;
      }
      
      // Start new attack
      gameState.player.attacking = true;
      gameState.player.attackTime = now;
      gameState.player.attackCombo = 1;
      gameState.player.attackChecked = false;
      soundManager.playSound('attack');
    };
    
    // Special reversal attack (Attack + Jump)
    const reversalAttack = () => {
      if (gameState.player.attacking) return;
      gameState.player.attacking = true;
      gameState.player.attackTime = Date.now();
      gameState.player.attackCombo = 0;
      gameState.player.attackChecked = false;
      soundManager.playSound('magic'); // Different sound for special
    };

    // Jump function
    const jump = () => {
      if (gameState.player.onGround && !gameState.player.jumping) {
        gameState.player.vy = stats.jumpPower;
        gameState.player.onGround = false;
        gameState.player.jumping = true;
        soundManager.playSound('jump');
      }
    };

    // Use magic
    const useMagic = () => {
      if (magic > 0 && !gameState.magicActive) {
        setMagic(prev => prev - 1);
        gameState.magicActive = true;
        gameState.magicTime = Date.now();
        soundManager.playSound('magic');
        // Damage all enemies
        gameState.enemies.forEach(enemy => {
          enemy.health -= 50;
        });
      }
    };

    // Keyboard handlers
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        gameState.keys['ArrowLeft'] = true;
        gameState.player.facing = -1;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        gameState.keys['ArrowRight'] = true;
        gameState.player.facing = 1;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        e.preventDefault();
        // Check if attack is also pressed for reversal attack
        if (gameState.keys['x'] || gameState.keys['X']) {
          reversalAttack();
        } else {
          jump();
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        e.preventDefault();
        // Move backward in depth (toward camera)
        gameState.keys['ArrowDown'] = true;
      } else if (e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        gameState.keys['x'] = true;
        // Check if jump is also pressed for reversal attack
        if (gameState.keys['ArrowUp'] || gameState.keys['w'] || gameState.keys['W'] || gameState.keys[' ']) {
          reversalAttack();
        } else if (!attackKeyHeldRef.current) {
          attackKeyHeldRef.current = true;
          const isJumping = !gameState.player.onGround;
          const isRunning = gameState.player.running;
          attack(isJumping, isRunning);
        }
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        useMagic();
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        gameState.keys['ArrowLeft'] = false;
        gameState.player.runTime = 0;
      } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        gameState.keys['ArrowRight'] = false;
        gameState.player.runTime = 0;
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        gameState.keys['ArrowDown'] = false;
      } else if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        gameState.keys['ArrowUp'] = false;
        gameState.keys['w'] = false;
        gameState.keys['W'] = false;
        gameState.keys[' '] = false;
      } else if (e.key === 'x' || e.key === 'X') {
        gameState.keys['x'] = false;
        gameState.keys['X'] = false;
        attackKeyHeldRef.current = false;
      }
    };

    // Touch handlers
    const handleTouchStart = (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const rect = canvas.getBoundingClientRect();
      const x = touch.clientX - rect.left;
      const y = touch.clientY - rect.top;
      
      // Left side - move left
      if (x < canvas.width / 4) {
        gameState.keys['ArrowLeft'] = true;
        gameState.player.facing = -1;
      }
      // Right side - move right
      else if (x > canvas.width * 3 / 4) {
        gameState.keys['ArrowRight'] = true;
        gameState.player.facing = 1;
      }
      // Top area - jump
      else if (y < canvas.height / 3) {
        // Check if also in attack area for reversal attack
        if (x < canvas.width / 2 && y > canvas.height / 4) {
          reversalAttack();
        } else {
          jump();
        }
      }
      // Middle-left - attack (only trigger once per touch)
      else if (x < canvas.width / 2 && y > canvas.height / 3) {
        if (!attackKeyHeldRef.current) {
          attackKeyHeldRef.current = true;
          const isJumping = !gameState.player.onGround;
          const isRunning = gameState.player.running;
          attack(isJumping, isRunning);
        }
      }
      // Bottom area - move backward (depth)
      else if (y > canvas.height * 2 / 3) {
        gameState.keys['ArrowDown'] = true;
      }
      // Middle-right - magic
      else {
        useMagic();
      }
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      gameState.keys['ArrowLeft'] = false;
      gameState.keys['ArrowRight'] = false;
      gameState.keys['ArrowDown'] = false;
      attackKeyHeldRef.current = false; // Reset attack key on touch end
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });

    // Game loop
    let animationFrameId;
    let lastTime = 0;
    const gravity = 0.6;

    const gameLoop = (currentTime) => {
      if (gameOver) return;

      if (!lastTime) lastTime = currentTime;
      const deltaTime = currentTime - lastTime;
      lastTime = currentTime;

      // Update player horizontal movement with run detection
      const lastVx = gameState.player.vx;
      if (gameState.keys['ArrowLeft']) {
        gameState.player.vx = -stats.speed;
        gameState.player.facing = -1;
        // Check for double-tap to run
        if (lastVx > 0) {
          gameState.player.runTime = currentTime;
        }
        if (currentTime - gameState.player.runTime < 300 && lastVx < 0) {
          gameState.player.running = true;
          gameState.player.vx = -stats.speed * 1.8; // Faster when running
        } else {
          gameState.player.running = false;
        }
      } else if (gameState.keys['ArrowRight']) {
        gameState.player.vx = stats.speed;
        gameState.player.facing = 1;
        // Check for double-tap to run
        if (lastVx < 0) {
          gameState.player.runTime = currentTime;
        }
        if (currentTime - gameState.player.runTime < 300 && lastVx > 0) {
          gameState.player.running = true;
          gameState.player.vx = stats.speed * 1.8; // Faster when running
        } else {
          gameState.player.running = false;
        }
      } else {
        gameState.player.vx = 0;
        gameState.player.running = false;
        gameState.player.runTime = 0;
      }

      // Update player depth movement (vertical on ground plane)
      if (gameState.keys['ArrowDown']) {
        gameState.player.vdepth = stats.speed * 0.8; // Move backward (toward camera)
      } else {
        gameState.player.vdepth = 0;
      }
      
      // Update player position
      gameState.player.x += gameState.player.vx;
      gameState.player.y += gameState.player.vy;
      gameState.player.depth += gameState.player.vdepth;
      gameState.player.vy += gravity;
      
      // Clamp depth
      gameState.player.depth = Math.max(-depthRange, Math.min(depthRange, gameState.player.depth));
      
      // Adjust Y position based on depth (simulate 3D perspective)
      const depthOffset = gameState.player.depth * 0.3; // Move up when going forward, down when going back

      // Ground collision (with depth offset)
      const adjustedGroundY = groundY - depthOffset;
      if (gameState.player.y >= adjustedGroundY - gameState.player.height) {
        gameState.player.y = adjustedGroundY - gameState.player.height;
        gameState.player.vy = 0;
        gameState.player.onGround = true;
        gameState.player.jumping = false;
      } else {
        gameState.player.onGround = false;
      }

      // Keep player on screen
      gameState.player.x = Math.max(0, Math.min(canvas.width - gameState.player.width, gameState.player.x));

      // Update attack (longer duration for combos)
      const attackDuration = gameState.player.attackCombo > 0 ? 400 : 300;
      if (gameState.player.attacking && currentTime - gameState.player.attackTime > attackDuration) {
        gameState.player.attacking = false;
        gameState.player.attackChecked = false;
        gameState.player.attackCombo = 0;
      }
      
      // Calculate attack swing progress (0 to 1)
      let attackProgress = 0;
      if (gameState.player.attacking) {
        const elapsed = currentTime - gameState.player.attackTime;
        attackProgress = Math.min(elapsed / attackDuration, 1);
      }

      // Update magic effect
      if (gameState.magicActive && currentTime - gameState.magicTime > 2000) {
        gameState.magicActive = false;
      }

      // Spawn enemies
      if (currentTime - gameState.lastEnemySpawn > gameState.enemySpawnInterval) {
        gameState.lastEnemySpawn = currentTime;
        spawnEnemy();
      }

      // Update enemies
      gameState.enemies.forEach((enemy, ei) => {
        enemy.x += enemy.vx;
        
        // Update enemy depth-based Y position
        const enemyDepthOffset = enemy.depth * 0.3;
        const enemyGroundY = groundY - enemyDepthOffset;
        enemy.y = enemyGroundY - enemy.height;
        
        // Update stunned state
        if (enemy.stunned && currentTime - enemy.stunTime > 1000) {
          enemy.stunned = false;
        }
        
        // Simple AI - attack when close (consider depth)
        const xDistance = Math.abs(enemy.x - gameState.player.x);
        const depthDistance = Math.abs(enemy.depth - gameState.player.depth);
        const totalDistance = Math.sqrt(xDistance * xDistance + depthDistance * depthDistance);
        
        if (totalDistance < 80 && !enemy.stunned && Math.random() < 0.01) {
          enemy.attacking = true;
          enemy.attackTime = currentTime;
        }
        
        if (enemy.attacking && currentTime - enemy.attackTime > 400) {
          enemy.attacking = false;
        }

        // Remove off-screen enemies
        if (enemy.x + enemy.width < 0) {
          gameState.enemies.splice(ei, 1);
        }
      });

      // Check player attack collision (iterate backwards to safely remove enemies)
      if (gameState.player.attacking) {
        const attackRange = 50;
        const depthRange = 30; // Attack depth range
        
        // Only check collision once per attack combo hit (not every frame)
        if (!gameState.player.attackChecked) {
          gameState.player.attackChecked = true;
          
          // Iterate backwards to safely remove enemies
          for (let ei = gameState.enemies.length - 1; ei >= 0; ei--) {
            const enemy = gameState.enemies[ei];
            let hit = false;
            
            // Check depth distance
            const depthDistance = Math.abs(enemy.depth - gameState.player.depth);
            if (depthDistance > depthRange) continue; // Too far in depth
            
            // Check X distance and Y overlap
            if (gameState.player.facing > 0) {
              // Attacking right
              if (gameState.player.x + gameState.player.width < enemy.x + enemy.width &&
                  gameState.player.x + gameState.player.width + attackRange > enemy.x &&
                  gameState.player.y < enemy.y + enemy.height &&
                  gameState.player.y + gameState.player.height > enemy.y) {
                hit = true;
              }
            } else {
              // Attacking left
              if (gameState.player.x - attackRange < enemy.x + enemy.width &&
                  gameState.player.x > enemy.x &&
                  gameState.player.y < enemy.y + enemy.height &&
                  gameState.player.y + gameState.player.height > enemy.y) {
                hit = true;
              }
            }
            
            if (hit) {
              // Combo damage increases
              const comboMultiplier = 1 + (gameState.player.attackCombo - 1) * 0.3;
              const damage = Math.floor(stats.attackDamage * comboMultiplier);
              enemy.health -= damage;
              soundManager.playSound('swordHit');
              
              // Stun enemy on hit (unless killed)
              if (enemy.health > 0) {
                enemy.stunned = true;
                enemy.stunTime = currentTime;
              }
              
              if (enemy.health <= 0) {
                soundManager.playSound('explosion');
                setScore(prev => {
                  const points = enemy.type === 'gargoyle' ? 200 : enemy.type === 'knight' ? 100 : 50;
                  const newScore = prev + points;
                  if (newScore > highScore) {
                    setHighScore(newScore);
                    localStorage.setItem('goldenAxeHighScore', newScore.toString());
                  }
                  return newScore;
                });
                // Remove enemy immediately
                gameState.enemies.splice(ei, 1);
              }
            }
          }
        }
      } else {
        // Reset attack check when not attacking
        gameState.player.attackChecked = false;
      }
      
      // Check for throw (when enemy is stunned and player is close)
      if (!gameState.player.attacking && gameState.keys['x']) {
        for (let ei = gameState.enemies.length - 1; ei >= 0; ei--) {
          const enemy = gameState.enemies[ei];
          if (enemy.stunned) {
            const xDistance = Math.abs(enemy.x - gameState.player.x);
            const depthDistance = Math.abs(enemy.depth - gameState.player.depth);
            if (xDistance < 30 && depthDistance < 20) {
              // Throw enemy
              soundManager.playSound('explosion');
              enemy.health = 0;
              setScore(prev => {
                const points = enemy.type === 'gargoyle' ? 150 : enemy.type === 'knight' ? 75 : 40;
                const newScore = prev + points;
                if (newScore > highScore) {
                  setHighScore(newScore);
                  localStorage.setItem('goldenAxeHighScore', newScore.toString());
                }
                return newScore;
              });
              gameState.enemies.splice(ei, 1);
              break; // Only throw one enemy at a time
            }
          }
        }
      }

      // Check enemy attack collision (with depth)
      gameState.enemies.forEach(enemy => {
        if (enemy.attacking && !enemy.stunned) {
          const xDistance = Math.abs(enemy.x - gameState.player.x);
          const depthDistance = Math.abs(enemy.depth - gameState.player.depth);
          
          if (xDistance < 40 && depthDistance < 25 &&
              gameState.player.x < enemy.x + enemy.width &&
              gameState.player.x + gameState.player.width > enemy.x &&
              gameState.player.y < enemy.y + enemy.height &&
              gameState.player.y + gameState.player.height > enemy.y) {
            soundManager.playSound('enemyHit');
            gameState.player.health -= 10;
            if (gameState.player.health <= 0) {
              const newLives = lives - 1;
              setLives(newLives);
              if (newLives <= 0) {
                soundManager.playSound('gameOver');
                endGame();
                return;
              }
              gameState.player.health = 100;
              gameState.player.x = 100;
              gameState.player.depth = 0;
              gameState.enemies = [];
            }
          }
        }
      });

      // Update background parallax
      gameState.background.x -= gameState.player.vx * 0.1;
      gameState.background.parallax1 -= gameState.player.vx * 0.3;
      gameState.background.parallax2 -= gameState.player.vx * 0.5;

      // Draw
      // Sky gradient
      const skyGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      skyGradient.addColorStop(0, '#87CEEB');
      skyGradient.addColorStop(0.5, '#98D8E8');
      skyGradient.addColorStop(1, '#B0C4DE');
      ctx.fillStyle = skyGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Mountains (parallax layer 2)
      ctx.fillStyle = '#708090';
      for (let i = 0; i < 5; i++) {
        const x = (i * 200 + gameState.background.parallax2) % (canvas.width + 200) - 100;
        ctx.beginPath();
        ctx.moveTo(x, groundY - 150);
        ctx.lineTo(x + 50, groundY - 200);
        ctx.lineTo(x + 100, groundY - 150);
        ctx.lineTo(x + 100, groundY);
        ctx.lineTo(x, groundY);
        ctx.closePath();
        ctx.fill();
      }

      // Trees/buildings (parallax layer 1)
      ctx.fillStyle = '#2F4F2F';
      for (let i = 0; i < 8; i++) {
        const x = (i * 150 + gameState.background.parallax1) % (canvas.width + 150) - 50;
        // Tree trunk
        ctx.fillRect(x + 10, groundY - 80, 15, 80);
        // Tree top
        ctx.beginPath();
        ctx.arc(x + 17, groundY - 80, 25, 0, Math.PI * 2);
        ctx.fill();
      }

      // Ground
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);
      
      // Ground texture
      ctx.fillStyle = '#6B5B4A';
      for (let x = 0; x < canvas.width; x += 20) {
        ctx.fillRect(x, groundY, 2, canvas.height - groundY);
      }

      // Draw enemies with improved sprites (sort by depth for proper layering)
      const allEntities = [
        ...gameState.enemies.map(e => ({ type: 'enemy', entity: e, depth: e.depth })),
        { type: 'player', entity: gameState.player, depth: gameState.player.depth }
      ].sort((a, b) => b.depth - a.depth); // Draw further back first
      
      allEntities.forEach(({ type, entity, depth }) => {
        if (type === 'enemy') {
          const enemy = entity;
          ctx.save();
          
          // Scale and offset based on depth (further back = smaller, higher)
          const depthScale = 1 - (depth / depthRange) * 0.3; // Scale down when further back
          const depthYOffset = depth * 0.3; // Move up when further back
          ctx.translate(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2);
          ctx.scale(depthScale, depthScale);
          ctx.translate(-(enemy.x + enemy.width / 2), -(enemy.y + enemy.height / 2));
        
        // Enemy details based on type
        if (enemy.type === 'skeleton') {
          // Skull - improved
          ctx.fillStyle = '#F5F5DC';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2, enemy.y + 12, 14, 0, Math.PI * 2);
          ctx.fill();
          // Skull shading
          ctx.fillStyle = '#E0E0C0';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2 - 3, enemy.y + 10, 8, 0, Math.PI * 2);
          ctx.fill();
          // Eye sockets - glowing
          ctx.fillStyle = '#FF0000';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2 - 6, enemy.y + 10, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2 + 6, enemy.y + 10, 3, 0, Math.PI * 2);
          ctx.fill();
          // Jaw
          ctx.fillStyle = '#F5F5DC';
          ctx.fillRect(enemy.x + enemy.width / 2 - 8, enemy.y + 20, 16, 8);
          // Ribs - detailed
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2.5;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.arc(enemy.x + 6 + i * 7, enemy.y + 22, 3, 0, Math.PI * 2);
            ctx.stroke();
          }
          // Arms
          ctx.fillStyle = '#F5F5DC';
          ctx.fillRect(enemy.x - 3, enemy.y + 18, 6, 12);
          ctx.fillRect(enemy.x + enemy.width - 3, enemy.y + 18, 6, 12);
          // Legs
          ctx.fillRect(enemy.x + 5, enemy.y + 30, 6, 10);
          ctx.fillRect(enemy.x + enemy.width - 11, enemy.y + 30, 6, 10);
          // Weapon - sword with detail
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(enemy.x + enemy.width - 2, enemy.y + 12, 6, 22);
          // Sword hilt
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(enemy.x + enemy.width - 1, enemy.y + 10, 4, 4);
          // Sword glow
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width + 1, enemy.y + 12);
          ctx.lineTo(enemy.x + enemy.width + 1, enemy.y + 32);
          ctx.stroke();
        } else if (enemy.type === 'knight') {
          // Helmet - detailed
          ctx.fillStyle = '#E0E0E0';
          ctx.beginPath();
          ctx.moveTo(enemy.x + 3, enemy.y + 5);
          ctx.lineTo(enemy.x + enemy.width - 3, enemy.y + 5);
          ctx.lineTo(enemy.x + enemy.width - 1, enemy.y + 18);
          ctx.lineTo(enemy.x + 1, enemy.y + 18);
          ctx.closePath();
          ctx.fill();
          // Helmet shine
          ctx.fillStyle = '#FFF';
          ctx.fillRect(enemy.x + 5, enemy.y + 6, 8, 3);
          // Visor - with slits
          ctx.fillStyle = '#1a1a1a';
          ctx.fillRect(enemy.x + 6, enemy.y + 8, enemy.width - 12, 8);
          // Visor slits
          ctx.fillStyle = '#444';
          for (let i = 0; i < 3; i++) {
            ctx.fillRect(enemy.x + 8 + i * 6, enemy.y + 10, 2, 4);
          }
          // Armor - with plates
          ctx.fillStyle = '#4169E1';
          ctx.fillRect(enemy.x + 5, enemy.y + 18, enemy.width - 10, enemy.height - 18);
          // Armor plates
          ctx.fillStyle = '#5A7AE8';
          ctx.fillRect(enemy.x + 6, enemy.y + 20, enemy.width - 12, 4);
          ctx.fillRect(enemy.x + 6, enemy.y + 28, enemy.width - 12, 4);
          // Shoulder pads
          ctx.fillStyle = '#2E4BC6';
          ctx.beginPath();
          ctx.arc(enemy.x - 2, enemy.y + 20, 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width + 2, enemy.y + 20, 6, 0, Math.PI * 2);
          ctx.fill();
          // Shield - detailed
          ctx.fillStyle = '#FFD700';
          ctx.beginPath();
          ctx.moveTo(enemy.x - 8, enemy.y + 22);
          ctx.lineTo(enemy.x - 3, enemy.y + 18);
          ctx.lineTo(enemy.x - 3, enemy.y + 32);
          ctx.closePath();
          ctx.fill();
          // Shield emblem
          ctx.fillStyle = '#8B0000';
          ctx.beginPath();
          ctx.arc(enemy.x - 3, enemy.y + 25, 4, 0, Math.PI * 2);
          ctx.fill();
          // Sword - detailed
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(enemy.x + enemy.width - 2, enemy.y + 8, 5, 28);
          // Sword edge
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width, enemy.y + 8);
          ctx.lineTo(enemy.x + enemy.width, enemy.y + 34);
          ctx.stroke();
          // Sword hilt
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(enemy.x + enemy.width - 1, enemy.y + 6, 3, 4);
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(enemy.x + enemy.width - 1, enemy.y + 7, 3, 2);
        } else {
          // Gargoyle - improved
          // Body - stone texture
          ctx.fillStyle = '#3A5A5A';
          ctx.fillRect(enemy.x + 2, enemy.y + 5, enemy.width - 4, enemy.height - 5);
          // Body shading
          ctx.fillStyle = '#2F4F4F';
          ctx.fillRect(enemy.x + 4, enemy.y + 7, enemy.width - 8, enemy.height - 9);
          // Head
          ctx.fillStyle = '#3A5A5A';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2, enemy.y + 8, 10, 0, Math.PI * 2);
          ctx.fill();
          // Eyes - glowing
          ctx.fillStyle = '#FF4500';
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2 - 4, enemy.y + 7, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(enemy.x + enemy.width / 2 + 4, enemy.y + 7, 2, 0, Math.PI * 2);
          ctx.fill();
          // Wings - detailed
          ctx.fillStyle = '#1C1C1C';
          ctx.beginPath();
          ctx.moveTo(enemy.x - 12, enemy.y + 8);
          ctx.lineTo(enemy.x - 2, enemy.y);
          ctx.lineTo(enemy.x - 2, enemy.y + 15);
          ctx.lineTo(enemy.x - 8, enemy.y + 20);
          ctx.closePath();
          ctx.fill();
          // Wing detail
          ctx.strokeStyle = '#2A2A2A';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(enemy.x - 8, enemy.y + 5);
          ctx.lineTo(enemy.x - 5, enemy.y + 12);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width + 12, enemy.y + 8);
          ctx.lineTo(enemy.x + enemy.width + 2, enemy.y);
          ctx.lineTo(enemy.x + enemy.width + 2, enemy.y + 15);
          ctx.lineTo(enemy.x + enemy.width + 8, enemy.y + 20);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width + 8, enemy.y + 5);
          ctx.lineTo(enemy.x + enemy.width + 5, enemy.y + 12);
          ctx.stroke();
          // Horns - detailed
          ctx.fillStyle = '#2A2A2A';
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width / 2 - 6, enemy.y);
          ctx.lineTo(enemy.x + enemy.width / 2 - 3, enemy.y - 10);
          ctx.lineTo(enemy.x + enemy.width / 2, enemy.y - 2);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(enemy.x + enemy.width / 2 + 6, enemy.y);
          ctx.lineTo(enemy.x + enemy.width / 2 + 3, enemy.y - 10);
          ctx.lineTo(enemy.x + enemy.width / 2, enemy.y - 2);
          ctx.closePath();
          ctx.fill();
          // Claws
          ctx.fillStyle = '#1C1C1C';
          for (let i = 0; i < 3; i++) {
            ctx.beginPath();
            ctx.moveTo(enemy.x + 2 + i * 3, enemy.y + enemy.height - 2);
            ctx.lineTo(enemy.x + 1 + i * 3, enemy.y + enemy.height + 3);
            ctx.lineTo(enemy.x + 3 + i * 3, enemy.y + enemy.height + 3);
            ctx.closePath();
            ctx.fill();
          }
        }
        
          // Attack animation
          if (enemy.attacking) {
            ctx.strokeStyle = '#f00';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, 30, 0, Math.PI * 2);
            ctx.stroke();
          }
          
          // Stunned indicator
          if (enemy.stunned) {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.5)';
            ctx.fillRect(enemy.x - 5, enemy.y - 5, enemy.width + 10, enemy.height + 10);
          }
          
          // Health bar
          const healthPercent = enemy.health / enemy.maxHealth;
          ctx.fillStyle = '#f00';
          ctx.fillRect(enemy.x, enemy.y - 8, enemy.width, 4);
          ctx.fillStyle = '#0f0';
          ctx.fillRect(enemy.x, enemy.y - 8, enemy.width * healthPercent, 4);
          
          ctx.restore();
        } else if (type === 'player') {
          // Draw player with depth scaling
          ctx.save();
          
          // Scale and offset based on depth
          const depthScale = 1 - (depth / depthRange) * 0.3;
          const depthYOffset = depth * 0.3;
          ctx.translate(gameState.player.x + gameState.player.width / 2, gameState.player.y + gameState.player.height / 2);
          ctx.scale(depthScale, depthScale);
          ctx.translate(-(gameState.player.x + gameState.player.width / 2), -(gameState.player.y + gameState.player.height / 2));
          
          ctx.scale(gameState.player.facing, 1);
          const playerX = gameState.player.facing > 0 ? gameState.player.x : -gameState.player.x - gameState.player.width;
          
          // Calculate attack swing progress (0 to 1)
          let attackProgress = 0;
          if (gameState.player.attacking) {
            const elapsed = currentTime - gameState.player.attackTime;
            const attackDuration = gameState.player.attackCombo > 0 ? 400 : 300;
            attackProgress = Math.min(elapsed / attackDuration, 1);
          }
          
          // Character details
          if (character === 'warrior') {
        // Head
        ctx.fillStyle = '#FFDBAC';
        ctx.beginPath();
        ctx.arc(playerX + gameState.player.width / 2, gameState.player.y + 8, 8, 0, Math.PI * 2);
        ctx.fill();
        // Helmet - detailed
        ctx.fillStyle = '#C0C0C0';
        ctx.beginPath();
        ctx.moveTo(playerX + 5, gameState.player.y + 2);
        ctx.lineTo(playerX + gameState.player.width - 5, gameState.player.y + 2);
        ctx.lineTo(playerX + gameState.player.width - 3, gameState.player.y + 14);
        ctx.lineTo(playerX + 3, gameState.player.y + 14);
        ctx.closePath();
        ctx.fill();
        // Helmet shine
        ctx.fillStyle = '#E0E0E0';
        ctx.fillRect(playerX + 7, gameState.player.y + 3, 6, 2);
        // Helmet plume
        ctx.fillStyle = '#FF0000';
        ctx.fillRect(playerX + gameState.player.width / 2 - 2, gameState.player.y - 4, 4, 6);
        // Armor - detailed
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(playerX + 8, gameState.player.y + 14, gameState.player.width - 16, gameState.player.height - 14);
        // Armor plates
        ctx.fillStyle = '#A00000';
        ctx.fillRect(playerX + 9, gameState.player.y + 16, gameState.player.width - 18, 3);
        ctx.fillRect(playerX + 9, gameState.player.y + 22, gameState.player.width - 18, 3);
        // Shoulder pads
        ctx.fillStyle = '#6B0000';
        ctx.beginPath();
        ctx.arc(playerX - 2, gameState.player.y + 18, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(playerX + gameState.player.width + 2, gameState.player.y + 18, 5, 0, Math.PI * 2);
        ctx.fill();
        // Belt
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(playerX + 10, gameState.player.y + 32, gameState.player.width - 20, 5);
        // Belt buckle
        ctx.fillStyle = '#FFF';
        ctx.fillRect(playerX + gameState.player.width / 2 - 3, gameState.player.y + 33, 6, 3);
        // Legs
        ctx.fillStyle = '#654321';
        ctx.fillRect(playerX + 12, gameState.player.y + 37, 6, 13);
        ctx.fillRect(playerX + gameState.player.width - 18, gameState.player.y + 37, 6, 13);
        // Boots
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(playerX + 11, gameState.player.y + 48, 8, 2);
        ctx.fillRect(playerX + gameState.player.width - 19, gameState.player.y + 48, 8, 2);
        // Sword - detailed (with swing animation)
        const weaponLength = 24;
        const weaponWidth = 6;
        const pivotX = playerX + gameState.player.width - 2;
        const pivotY = gameState.player.y + 18;
        
        if (gameState.player.attacking) {
          // Calculate swing angle (from -45° to +90° for right-facing, or +45° to -90° for left-facing)
          const swingAngle = gameState.player.facing > 0
            ? -Math.PI / 4 + (attackProgress * Math.PI * 0.75) // -45° to +90°
            : Math.PI / 4 - (attackProgress * Math.PI * 0.75);  // +45° to -90°
          
          ctx.save();
          ctx.translate(pivotX, pivotY);
          ctx.rotate(swingAngle);
          
          // Sword blade
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(0, -weaponWidth / 2, weaponLength, weaponWidth);
          // Sword edge (glowing during swing)
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -weaponWidth / 2);
          ctx.lineTo(weaponLength, -weaponWidth / 2);
          ctx.stroke();
          // Sword tip
          ctx.fillStyle = '#FFF';
          ctx.beginPath();
          ctx.moveTo(weaponLength, -weaponWidth / 2);
          ctx.lineTo(weaponLength + 3, 0);
          ctx.lineTo(weaponLength, weaponWidth / 2);
          ctx.closePath();
          ctx.fill();
          // Sword hilt
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(-2, -2, 4, 4);
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(-1, -1, 2, 2);
          // Sword guard
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(-3, -1, 6, 2);
          
          ctx.restore();
        } else {
          // Normal sword position
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(playerX + gameState.player.width - 3, gameState.player.y + 12, 6, 24);
          // Sword edge
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(playerX + gameState.player.width, gameState.player.y + 12);
          ctx.lineTo(playerX + gameState.player.width, gameState.player.y + 34);
          ctx.stroke();
          // Sword hilt
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(playerX + gameState.player.width - 2, gameState.player.y + 10, 4, 4);
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(playerX + gameState.player.width - 1, gameState.player.y + 11, 2, 2);
          // Sword guard
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(playerX + gameState.player.width - 5, gameState.player.y + 13, 8, 2);
        }
      } else if (character === 'amazon') {
        // Head
        ctx.fillStyle = '#FFDBAC';
        ctx.beginPath();
        ctx.arc(playerX + gameState.player.width / 2, gameState.player.y + 8, 8, 0, Math.PI * 2);
        ctx.fill();
        // Hair - flowing
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.moveTo(playerX + 8, gameState.player.y + 2);
        ctx.quadraticCurveTo(playerX + gameState.player.width / 2, gameState.player.y - 2, playerX + gameState.player.width - 8, gameState.player.y + 2);
        ctx.lineTo(playerX + gameState.player.width - 6, gameState.player.y + 10);
        ctx.quadraticCurveTo(playerX + gameState.player.width / 2, gameState.player.y + 6, playerX + 6, gameState.player.y + 10);
        ctx.closePath();
        ctx.fill();
        // Hair highlight
        ctx.fillStyle = '#A0522D';
        ctx.beginPath();
        ctx.moveTo(playerX + 10, gameState.player.y + 3);
        ctx.quadraticCurveTo(playerX + gameState.player.width / 2, gameState.player.y - 1, playerX + gameState.player.width - 10, gameState.player.y + 3);
        ctx.lineTo(playerX + gameState.player.width - 8, gameState.player.y + 9);
        ctx.quadraticCurveTo(playerX + gameState.player.width / 2, gameState.player.y + 5, playerX + 8, gameState.player.y + 9);
        ctx.closePath();
        ctx.fill();
        // Top - detailed
        ctx.fillStyle = '#FF6347';
        ctx.fillRect(playerX + 10, gameState.player.y + 10, gameState.player.width - 20, 16);
        // Top trim
        ctx.fillStyle = '#FF4500';
        ctx.fillRect(playerX + 11, gameState.player.y + 11, gameState.player.width - 22, 2);
        ctx.fillRect(playerX + 11, gameState.player.y + 23, gameState.player.width - 22, 2);
        // Arms
        ctx.fillStyle = '#FFDBAC';
        ctx.fillRect(playerX + 6, gameState.player.y + 12, 5, 10);
        ctx.fillRect(playerX + gameState.player.width - 11, gameState.player.y + 12, 5, 10);
        // Legs - detailed
        ctx.fillStyle = '#4169E1';
        ctx.fillRect(playerX + 10, gameState.player.y + 26, 7, 24);
        ctx.fillRect(playerX + gameState.player.width - 17, gameState.player.y + 26, 7, 24);
        // Leg armor
        ctx.fillStyle = '#2E4BC6';
        ctx.fillRect(playerX + 11, gameState.player.y + 28, 5, 3);
        ctx.fillRect(playerX + 11, gameState.player.y + 35, 5, 3);
        ctx.fillRect(playerX + gameState.player.width - 16, gameState.player.y + 28, 5, 3);
        ctx.fillRect(playerX + gameState.player.width - 16, gameState.player.y + 35, 5, 3);
        // Boots
        ctx.fillStyle = '#1C1C1C';
        ctx.fillRect(playerX + 9, gameState.player.y + 48, 9, 2);
        ctx.fillRect(playerX + gameState.player.width - 18, gameState.player.y + 48, 9, 2);
        // Sword - detailed (with swing animation)
        const weaponLength = 22;
        const weaponWidth = 5;
        const pivotX = playerX + gameState.player.width - 2;
        const pivotY = gameState.player.y + 20;
        
        if (gameState.player.attacking) {
          // Calculate swing angle
          const swingAngle = gameState.player.facing > 0
            ? -Math.PI / 4 + (attackProgress * Math.PI * 0.75)
            : Math.PI / 4 - (attackProgress * Math.PI * 0.75);
          
          ctx.save();
          ctx.translate(pivotX, pivotY);
          ctx.rotate(swingAngle);
          
          // Sword blade
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(0, -weaponWidth / 2, weaponLength, weaponWidth);
          // Sword edge
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(0, -weaponWidth / 2);
          ctx.lineTo(weaponLength, -weaponWidth / 2);
          ctx.stroke();
          // Sword tip
          ctx.fillStyle = '#FFF';
          ctx.beginPath();
          ctx.moveTo(weaponLength, -weaponWidth / 2);
          ctx.lineTo(weaponLength + 2, 0);
          ctx.lineTo(weaponLength, weaponWidth / 2);
          ctx.closePath();
          ctx.fill();
          // Sword hilt
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(-2, -2, 3, 4);
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(-1, -1, 1, 2);
          
          ctx.restore();
        } else {
          // Normal sword position
          ctx.fillStyle = '#C0C0C0';
          ctx.fillRect(playerX + gameState.player.width - 3, gameState.player.y + 14, 5, 22);
          // Sword edge
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(playerX + gameState.player.width, gameState.player.y + 14);
          ctx.lineTo(playerX + gameState.player.width, gameState.player.y + 34);
          ctx.stroke();
          // Sword hilt
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(playerX + gameState.player.width - 2, gameState.player.y + 12, 3, 4);
          ctx.fillStyle = '#FFD700';
          ctx.fillRect(playerX + gameState.player.width - 1, gameState.player.y + 13, 1, 2);
        }
      } else {
        // Dwarf - improved
        // Head
        ctx.fillStyle = '#FFDBAC';
        ctx.beginPath();
        ctx.arc(playerX + gameState.player.width / 2, gameState.player.y + 10, 9, 0, Math.PI * 2);
        ctx.fill();
        // Beard - detailed
        ctx.fillStyle = '#654321';
        ctx.beginPath();
        ctx.moveTo(playerX + gameState.player.width / 2 - 8, gameState.player.y + 18);
        ctx.quadraticCurveTo(playerX + gameState.player.width / 2, gameState.player.y + 28, playerX + gameState.player.width / 2 + 8, gameState.player.y + 18);
        ctx.lineTo(playerX + gameState.player.width / 2 + 6, gameState.player.y + 32);
        ctx.quadraticCurveTo(playerX + gameState.player.width / 2, gameState.player.y + 30, playerX + gameState.player.width / 2 - 6, gameState.player.y + 32);
        ctx.closePath();
        ctx.fill();
        // Beard braids
        ctx.strokeStyle = '#543210';
        ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(playerX + gameState.player.width / 2 - 4 + i * 4, gameState.player.y + 20);
          ctx.lineTo(playerX + gameState.player.width / 2 - 4 + i * 4, gameState.player.y + 28);
          ctx.stroke();
        }
        // Helmet
        ctx.fillStyle = '#8B4513';
        ctx.beginPath();
        ctx.moveTo(playerX + 5, gameState.player.y + 4);
        ctx.lineTo(playerX + gameState.player.width - 5, gameState.player.y + 4);
        ctx.lineTo(playerX + gameState.player.width - 3, gameState.player.y + 16);
        ctx.lineTo(playerX + 3, gameState.player.y + 16);
        ctx.closePath();
        ctx.fill();
        // Helmet trim
        ctx.fillStyle = '#654321';
        ctx.fillRect(playerX + 6, gameState.player.y + 5, gameState.player.width - 12, 2);
        // Body - armor
        ctx.fillStyle = '#8B0000';
        ctx.fillRect(playerX + 8, gameState.player.y + 20, gameState.player.width - 16, gameState.player.height - 20);
        // Armor plates
        ctx.fillStyle = '#A00000';
        ctx.fillRect(playerX + 9, gameState.player.y + 22, gameState.player.width - 18, 3);
        ctx.fillRect(playerX + 9, gameState.player.y + 30, gameState.player.width - 18, 3);
        // Belt
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(playerX + 10, gameState.player.y + 35, gameState.player.width - 20, 4);
        // Legs
        ctx.fillStyle = '#654321';
        ctx.fillRect(playerX + 12, gameState.player.y + 39, 6, 11);
        ctx.fillRect(playerX + gameState.player.width - 18, gameState.player.y + 39, 6, 11);
        // Boots
        ctx.fillStyle = '#2F2F2F';
        ctx.fillRect(playerX + 11, gameState.player.y + 48, 8, 2);
        ctx.fillRect(playerX + gameState.player.width - 19, gameState.player.y + 48, 8, 2);
        // Axe - detailed (with swing animation)
        const axeHandleLength = 28;
        const axeHeadSize = 8;
        const pivotX = playerX + gameState.player.width - 2;
        const pivotY = gameState.player.y + 20;
        
        if (gameState.player.attacking) {
          // Calculate swing angle
          const swingAngle = gameState.player.facing > 0
            ? -Math.PI / 3 + (attackProgress * Math.PI * 0.83) // -60° to +90°
            : Math.PI / 3 - (attackProgress * Math.PI * 0.83);  // +60° to -90°
          
          ctx.save();
          ctx.translate(pivotX, pivotY);
          ctx.rotate(swingAngle);
          
          // Axe handle
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(0, -2, axeHandleLength, 4);
          // Axe handle detail
          ctx.fillStyle = '#654321';
          ctx.fillRect(0, -1, 6, 2);
          // Axe head
          ctx.fillStyle = '#C0C0C0';
          ctx.beginPath();
          ctx.moveTo(axeHandleLength, -axeHeadSize / 2);
          ctx.lineTo(axeHandleLength + axeHeadSize, 0);
          ctx.lineTo(axeHandleLength, axeHeadSize / 2);
          ctx.lineTo(axeHandleLength - 2, 0);
          ctx.closePath();
          ctx.fill();
          // Axe edge (glowing during swing)
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(axeHandleLength, -axeHeadSize / 2);
          ctx.lineTo(axeHandleLength + axeHeadSize, 0);
          ctx.lineTo(axeHandleLength, axeHeadSize / 2);
          ctx.stroke();
          // Axe tip highlight
          ctx.fillStyle = '#FFF';
          ctx.beginPath();
          ctx.arc(axeHandleLength + axeHeadSize, 0, 2, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.restore();
        } else {
          // Normal axe position
          ctx.fillStyle = '#8B4513';
          ctx.fillRect(playerX + gameState.player.width - 4, gameState.player.y + 8, 8, 28);
          // Axe head
          ctx.fillStyle = '#C0C0C0';
          ctx.beginPath();
          ctx.moveTo(playerX + gameState.player.width + 4, gameState.player.y + 10);
          ctx.lineTo(playerX + gameState.player.width + 8, gameState.player.y + 18);
          ctx.lineTo(playerX + gameState.player.width + 4, gameState.player.y + 26);
          ctx.lineTo(playerX + gameState.player.width, gameState.player.y + 18);
          ctx.closePath();
          ctx.fill();
          // Axe edge
          ctx.strokeStyle = '#FFF';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(playerX + gameState.player.width + 4, gameState.player.y + 10);
          ctx.lineTo(playerX + gameState.player.width + 8, gameState.player.y + 18);
          ctx.lineTo(playerX + gameState.player.width + 4, gameState.player.y + 26);
          ctx.stroke();
          // Axe handle detail
          ctx.fillStyle = '#654321';
          ctx.fillRect(playerX + gameState.player.width - 3, gameState.player.y + 6, 6, 3);
        }
      }
          
          // Combo indicator (above player, no yellow circle)
          if (gameState.player.attacking && gameState.player.attackCombo > 1) {
            const indicatorX = playerX + gameState.player.width / 2;
            ctx.fillStyle = '#ff0';
            ctx.font = 'bold 16px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(`x${gameState.player.attackCombo}`, indicatorX, gameState.player.y - 10);
            ctx.textAlign = 'left';
          }
          
          ctx.restore();
        }
      });
      
      // Health bar
      ctx.fillStyle = '#f00';
      ctx.fillRect(10, 10, 200, 20);
      ctx.fillStyle = '#0f0';
      ctx.fillRect(10, 10, 200 * (gameState.player.health / 100), 20);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(10, 10, 200, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '14px Arial';
      ctx.fillText(`HP: ${Math.max(0, Math.floor(gameState.player.health))}`, 15, 26);

      // Magic effect
      if (gameState.magicActive) {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.3)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ff0';
        ctx.font = 'bold 48px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('MAGIC!', canvas.width / 2, canvas.height / 2);
        ctx.textAlign = 'left';
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
      cancelAnimationFrame(animationFrameId);
    };
  }, [gameStarted, gameOver, level, lives, magic, score, highScore, character]);

  const handleStartGame = () => {
    setGameStarted(true);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
    setMagic(3);
    gameStateRef.current = {
      player: { x: 100, y: 0, depth: 0, width: 40, height: 50, vx: 0, vy: 0, vdepth: 0, onGround: false, facing: 1, attacking: false, attackTime: 0, attackChecked: false, attackCombo: 0, jumping: false, running: false, runTime: 0, health: 100 },
      enemies: [],
      projectiles: [],
      background: { x: 0, parallax1: 0, parallax2: 0 },
      keys: {},
      lastEnemySpawn: 0,
      enemySpawnInterval: 3000,
      camera: { x: 0 },
      magicActive: false,
      magicTime: 0
    };
  };

  const handleRestart = () => {
    setGameStarted(false);
    setGameOver(false);
    setScore(0);
    setLives(3);
    setLevel(1);
    setMagic(3);
  };

  return (
    <div className="page-container">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Golden Axe</h1>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
          <div style={{ color: '#fff', fontSize: '1.2rem' }}>
            Score: <strong>{score}</strong> | Lives: <strong>{lives}</strong> | Level: <strong>{level}</strong> | Magic: <strong>{magic}</strong> | High: <strong>{highScore}</strong>
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
                  <strong style={{ color: '#fff' }}>Objective:</strong> Defeat all enemies to progress. Survive as long as possible!
                </p>
                <div style={{ marginBottom: '12px' }}>
                  <p style={{ color: '#fff', marginBottom: '8px', fontSize: '0.95rem' }}>Choose Character:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <button
                      onClick={() => setCharacter('warrior')}
                      style={{
                        padding: '8px',
                        background: character === 'warrior' ? 'rgba(139, 69, 19, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        border: `2px solid ${character === 'warrior' ? '#8B4513' : 'rgba(255, 255, 255, 0.2)'}`,
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Warrior (Balanced)
                    </button>
                    <button
                      onClick={() => setCharacter('amazon')}
                      style={{
                        padding: '8px',
                        background: character === 'amazon' ? 'rgba(255, 215, 0, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        border: `2px solid ${character === 'amazon' ? '#FFD700' : 'rgba(255, 255, 255, 0.2)'}`,
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Amazon (Fast)
                    </button>
                    <button
                      onClick={() => setCharacter('dwarf')}
                      style={{
                        padding: '8px',
                        background: character === 'dwarf' ? 'rgba(101, 67, 33, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                        border: `2px solid ${character === 'dwarf' ? '#654321' : 'rgba(255, 255, 255, 0.2)'}`,
                        borderRadius: '6px',
                        color: '#fff',
                        cursor: 'pointer',
                        fontSize: '0.9rem'
                      }}
                    >
                      Dwarf (Strong)
                    </button>
                  </div>
                </div>
                <p style={{ color: '#9da7b8', marginBottom: '8px', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Keyboard:</strong> Arrow Keys to move (double-tap to run), Up/Space to jump, Down to move back, X to attack (tap repeatedly for combos), X+Jump for reversal attack, Z for magic
                </p>
                <p style={{ color: '#9da7b8', lineHeight: '1.6' }}>
                  <strong style={{ color: '#fff' }}>Touch:</strong> Left/Right edges to move, Top to jump, Bottom to move back, Middle-left to attack, Middle-right for magic
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
                • Arrow Keys: Move (Left/Right, Down moves back)
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Double-tap Left/Right: Run
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Up/Space: Jump
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • X: Attack (tap for combos)
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • X + Jump: Reversal attack
              </p>
              <p style={{ color: '#9da7b8', marginBottom: '4px', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • X (on stunned): Throw
              </p>
              <p style={{ color: '#9da7b8', lineHeight: '1.6', fontSize: '0.9rem' }}>
                • Z: Magic
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
