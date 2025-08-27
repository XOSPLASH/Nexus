// spawn.js
// Spawner & heart logic. Functions accept/modify the provided gameState.

function initSpawnersAndHearts(gameState) {
  // choose spawner and heart positions mirrored across center Y axis
  const halfRows = Math.floor(BOARD_SIZE / 2);

  // pick a random x on player's side and mirrored for AI
  const px = Math.floor(Math.random() * BOARD_SIZE);
  const pySpawner = BOARD_SIZE - 3;
  const pyHeart = BOARD_SIZE - 1;

  const ax = (BOARD_SIZE - 1) - px;
  const aySpawner = 2;
  const ayHeart = 0;

  gameState.spawners = [
    { x: px, y: pySpawner, owner: 1 },
    { x: ax, y: aySpawner, owner: 2 }
  ];

  gameState.hearts = [
    { x: px, y: pyHeart, owner: 1 },
    { x: ax, y: ayHeart, owner: 2 }
  ];
}

function renderSpawnersAndHearts(gameState) {
  // ensure marker elements exist without clobbering children
  if (!gameState || !gameState.gridCells) return;
  // Clear old markers
  document.querySelectorAll('.marker-spawner').forEach(n => n.remove());
  document.querySelectorAll('.marker-heart').forEach(n => n.remove());

  if (!gameState.spawners || !gameState.hearts) return;

  gameState.spawners.forEach(s => {
    const cell = getCell(s.x, s.y);
    if (!cell) return;
    const marker = document.createElement('div');
    marker.className = 'marker-spawner';
    marker.textContent = s.owner === 1 ? '🔵' : '🔴';
    cell.appendChild(marker);
  });

  gameState.hearts.forEach(h => {
    const cell = getCell(h.x, h.y);
    if (!cell) return;
    const marker = document.createElement('div');
    marker.className = 'marker-heart';
    marker.textContent = h.owner === 1 ? '💙' : '❤️';
    cell.appendChild(marker);
  });
}

function getAdjacentEmptyTiles(x, y, gameState) {
  const candidates = [
    { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }
  ];
  const out = [];
  for (const t of candidates) {
    if (t.x < 0 || t.y < 0 || t.x >= BOARD_SIZE || t.y >= BOARD_SIZE) continue;
    // skip nexus & hearts & spawners & walls and units
    if (isNexus(t.x, t.y, gameState)) continue;
    if (gameState.walls && gameState.walls.some(w => w.x === t.x && w.y === t.y)) continue;
    if (gameState.units && gameState.units.some(u => u.x === t.x && u.y === t.y)) continue;
    // don't spawn on hearts
    if (gameState.hearts && gameState.hearts.some(h => h.x === t.x && h.y === t.y)) continue;
    out.push(t);
  }
  return out;
}

function spawnUnitAt(unitType, spawner, owner, gameState) {
  const options = getAdjacentEmptyTiles(spawner.x, spawner.y, gameState);
  if (!options.length) return false;
  const tile = options[Math.floor(Math.random() * options.length)];
  // use placeUnit which exists in game.js
  if (typeof placeUnit === 'function') {
    placeUnit(unitType, tile.x, tile.y, owner);
    return true;
  }
  return false;
}