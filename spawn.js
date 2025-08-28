// spawn.js - spawner and heart initialization and rendering (safe, mirrored, reserved)

// Initialize spawners and hearts in mirrored, non-overlapping positions.
// Ensures the reserved tiles are cleared of terrain so the markers never overlap terrain.
function initSpawnersAndHearts(gameState) {
  const cx = Math.floor(BOARD_SIZE / 2);

  // Helper to check reserved collisions with nexuses/hearts/spawners
  function isReserved(x,y) {
    if (!inBounds(x,y)) return true;
    if (gameState.hearts && gameState.hearts.some(h=>h.x===x && h.y===y)) return true;
    if (gameState.spawners && gameState.spawners.some(s=>s.x===x && s.y===y)) return true;
    if (Array.isArray(gameState.nexuses) && gameState.nexuses.some(n=>n.x===x && n.y===y)) return true;
    return false;
  }

  // Choose base positions (player 1 bottom, player 2 top)
  let pHeartX = cx, pHeartY = BOARD_SIZE - 1;
  let pSpawnerX = cx, pSpawnerY = BOARD_SIZE - 3;
  let aHeartX = cx, aHeartY = 0;
  let aSpawnerX = cx, aSpawnerY = 2;

  // If any of those collide with existing nexuses, try shifting left/right until free
  function findNearbyFree(x,y){
    if (!isReserved(x,y)) return {x,y};
    const maxOffset = Math.floor(BOARD_SIZE/2);
    for (let d=1; d<=maxOffset; d++){
      for (const sx of [-1,1]){
        const nx = x + sx*d;
        if (inBounds(nx,y) && !isReserved(nx,y)) return {x:nx,y};
      }
      for (const sy of [-1,1]){
        const ny = y + sy*d;
        if (inBounds(x,ny) && !isReserved(x,ny)) return {x,y:ny};
      }
    }
    return {x,y}; // fallback, may overlap but unlikely
  }

  const ph = findNearbyFree(pHeartX,pHeartY); pHeartX = ph.x; pHeartY = ph.y;
  const ps = findNearbyFree(pSpawnerX,pSpawnerY); pSpawnerX = ps.x; pSpawnerY = ps.y;
  const ah = findNearbyFree(aHeartX,aHeartY); aHeartX = ah.x; aHeartY = ah.y;
  const as = findNearbyFree(aSpawnerX,aSpawnerY); aSpawnerX = as.x; aSpawnerY = as.y;

  // Remove terrain (water/forests/mountains/walls/bridges) that would overlap these reserved tiles
  function clearTerrainAt(x,y){
    gameState.water = (gameState.water||[]).filter(t=>!(t.x===x&&t.y===y));
    gameState.forests = (gameState.forests||[]).filter(t=>!(t.x===x&&t.y===y));
    gameState.mountains = (gameState.mountains||[]).filter(t=>!(t.x===x&&t.y===y));
    gameState.walls = (gameState.walls||[]).filter(t=>!(t.x===x&&t.y===y));
    gameState.bridges = (gameState.bridges||[]).filter(t=>!(t.x===x&&t.y===y));
  }

  clearTerrainAt(pHeartX,pHeartY);
  clearTerrainAt(pSpawnerX,pSpawnerY);
  clearTerrainAt(aHeartX,aHeartY);
  clearTerrainAt(aSpawnerX,aSpawnerY);

  // Set hearts and spawners arrays
  gameState.hearts = [{ x: pHeartX, y: pHeartY, owner: 1 }, { x: aHeartX, y: aHeartY, owner: 2 }];
  gameState.spawners = [{ x: pSpawnerX, y: pSpawnerY, owner: 1 }, { x: aSpawnerX, y: aSpawnerY, owner: 2 }];

  return gameState;
}

// Render spawners and hearts onto the board. Marker elements don't block clicks.
function renderSpawnersAndHearts(gameState) {
  // Remove old markers
  document.querySelectorAll('.marker-spawner, .marker-heart').forEach(n => n.remove());
  if (!gameState || !Array.isArray(gameState.spawners) || !Array.isArray(gameState.hearts)) return;

  // Spawners
  for (const s of gameState.spawners) {
    const cell = (typeof getCell === 'function') ? getCell(s.x, s.y) : null;
    if (!cell) continue;
    const el = document.createElement('div');
    el.className = 'marker-spawner';
    el.textContent = '🏰';
    el.style.position = 'absolute';
    el.style.zIndex = 14;
    el.style.pointerEvents = 'none';
    el.style.transform = 'translateY(-6px)';
    // small color tint for owner
    if (s.owner === 1) el.style.filter = 'drop-shadow(0 2px 6px rgba(30,140,240,0.24))';
    if (s.owner === 2) el.style.filter = 'drop-shadow(0 2px 6px rgba(230,80,80,0.24))';
    cell.appendChild(el);
  }

  // Hearts
  for (const h of gameState.hearts) {
    const cell = (typeof getCell === 'function') ? getCell(h.x, h.y) : null;
    if (!cell) continue;
    const el = document.createElement('div');
    el.className = 'marker-heart';
    el.textContent = h.owner === 1 ? '💙' : '❤️';
    el.style.position = 'absolute';
    el.style.zIndex = 14;
    el.style.pointerEvents = 'none';
    el.style.transform = 'translateY(-6px)';
    cell.appendChild(el);
  }
}

// Helper to spawn a unit at a spawner (adjacent tile). Returns true on success.
function spawnUnitAt(unitType, spawner, owner, gameStateLocal) {
  const gs = gameStateLocal || window.gameState || gameState;
  if (!spawner) return false;
  const options = getAdjacentEmptyTiles(spawner.x, spawner.y, gs);
  if (!options || !options.length) return false;
  const tile = options[Math.floor(Math.random() * options.length)];
  if (typeof placeUnit === 'function') {
    return placeUnit(unitType, tile.x, tile.y, owner);
  }
  return false;
}

// Expose functions for other modules
window.initSpawnersAndHearts = initSpawnersAndHearts;
window.renderSpawnersAndHearts = renderSpawnersAndHearts;
window.spawnUnitAt = spawnUnitAt;
