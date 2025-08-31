// spawn.js - spawner and heart initialization and rendering (ensures reserved tiles are cleared)
// Exposes initSpawnersAndHearts, renderSpawnersAndHearts, spawnUnitAt

// NOTE: depends on global BOARD_SIZE, getCell, inBounds, placeUnit, updateGrid, updateUI

function initSpawnersAndHearts(gameState) {
  // Choose base positions centered horizontally
  const cx = Math.floor(BOARD_SIZE / 2);

  // default candidate positions (player 1 bottom, AI top)
  let pHeart = { x: cx, y: BOARD_SIZE - 1 };
  let pSpawner = { x: cx, y: BOARD_SIZE - 3 };
  let aHeart = { x: cx, y: 0 };
  let aSpawner = { x: cx, y: 2 };

  // helper to check reserved collisions (hearts/spawners/nexuses)
  function isReserved(x, y) {
    if (!inBounds(x, y)) return true;
    if (gameState.hearts && gameState.hearts.some(h => h.x === x && h.y === y)) return true;
    if (gameState.spawners && gameState.spawners.some(s => s.x === x && s.y === y)) return true;
    if (Array.isArray(gameState.nexuses) && gameState.nexuses.some(n => n.x === x && n.y === y)) return true;
    return false;
  }

  // if chosen pos collides with an existing nexus/spawner/heart, try shifting outward
  function findNearbyFree(pos) {
    if (!isReserved(pos.x, pos.y)) return pos;
    const maxOffset = Math.floor(BOARD_SIZE / 2);
    for (let d = 1; d <= maxOffset; d++) {
      // try left/right
      for (const sx of [-1, 1]) {
        const nx = pos.x + sx * d;
        if (inBounds(nx, pos.y) && !isReserved(nx, pos.y)) return { x: nx, y: pos.y };
      }
      // try up/down
      for (const sy of [-1, 1]) {
        const ny = pos.y + sy * d;
        if (inBounds(pos.x, ny) && !isReserved(pos.x, ny)) return { x: pos.x, y: ny };
      }
    }
    // fallback - return original (rare)
    return pos;
  }

  pHeart = findNearbyFree(pHeart);
  pSpawner = findNearbyFree(pSpawner);
  aHeart = findNearbyFree(aHeart);
  aSpawner = findNearbyFree(aSpawner);

  // Remove any terrain that would overlap reserved tiles (so markers are never on top of water/forest/etc)
  function clearTerrainAt(x, y) {
    if (!gameState) return;
    gameState.water = (gameState.water || []).filter(t => !(t.x === x && t.y === y));
    gameState.forests = (gameState.forests || []).filter(t => !(t.x === x && t.y === y));
    gameState.mountains = (gameState.mountains || []).filter(t => !(t.x === x && t.y === y));
    gameState.walls = (gameState.walls || []).filter(t => !(t.x === x && t.y === y));
    gameState.bridges = (gameState.bridges || []).filter(t => !(t.x === x && t.y === y));
  }

  clearTerrainAt(pHeart.x, pHeart.y);
  clearTerrainAt(pSpawner.x, pSpawner.y);
  clearTerrainAt(aHeart.x, aHeart.y);
  clearTerrainAt(aSpawner.x, aSpawner.y);

  // Save hearts/spawners
  gameState.hearts = [{ x: pHeart.x, y: pHeart.y, owner: 1 }, { x: aHeart.x, y: aHeart.y, owner: 2 }];
  gameState.spawners = [{ x: pSpawner.x, y: pSpawner.y, owner: 1 }, { x: aSpawner.x, y: aSpawner.y, owner: 2 }];

  return gameState;
}

function renderSpawnersAndHearts(gameState) {
  // remove old rendered markers
  document.querySelectorAll('.marker-spawner, .marker-heart').forEach(n => n.remove());
  if (!gameState) return;

  // render spawners
  for (const s of gameState.spawners || []) {
    const cell = (typeof getCell === 'function') ? getCell(s.x, s.y) : null;
    if (!cell) continue;
    const el = document.createElement('div');
    el.className = 'marker-spawner';
    el.textContent = '🏰';
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.zIndex = 14;
    el.style.transform = 'translateY(-6px)';
    if (s.owner === 1) el.style.filter = 'drop-shadow(0 2px 6px rgba(30,140,240,0.22))';
    if (s.owner === 2) el.style.filter = 'drop-shadow(0 2px 6px rgba(230,80,80,0.22))';
    cell.appendChild(el);
  }

  // render hearts
  for (const h of gameState.hearts || []) {
    const cell = (typeof getCell === 'function') ? getCell(h.x, h.y) : null;
    if (!cell) continue;
    const el = document.createElement('div');
    el.className = 'marker-heart';
    el.textContent = h.owner === 1 ? '💙' : '❤️';
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.zIndex = 14;
    el.style.transform = 'translateY(-6px)';
    cell.appendChild(el);
  }
}

// spawnUnitAt: place a unit adjacent to a spawner (used by AI). Does NOT deduct energy automatically.
// Returns true iff placement succeeded.
function spawnUnitAt(unitType, spawner, owner, gameStateLocal) {
  const gs = gameStateLocal || window.gameState || null;
  if (!spawner || !gs) return false;
  // find adjacent empty tiles
  const opts = getAdjacentEmptyTiles(spawner.x, spawner.y, gs);
  if (!opts || !opts.length) return false;
  const tile = opts[Math.floor(Math.random() * opts.length)];
  if (typeof placeUnit === 'function') {
    try {
      return placeUnit(unitType, tile.x, tile.y, owner);
    } catch (e) {
      return false;
    }
  }
  return false;
}

// export
window.initSpawnersAndHearts = initSpawnersAndHearts;
window.renderSpawnersAndHearts = renderSpawnersAndHearts;
window.spawnUnitAt = spawnUnitAt;
