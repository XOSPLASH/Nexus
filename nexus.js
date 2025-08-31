// nexus.js - nexus init, rendering, capture and damage application
// Exposes initNexuses, renderNexuses, updateNexusOwners, applyNexusDamage

// A nexus is a capturable point. If owned by player X, it deals 1 damage to the opponent at end of turn.
// Ownership persists after capture (unit must be on it at end of a turn to capture it).

function initNexuses(gameState) {
  // if nexuses already provided, keep them, otherwise create symmetric pair
  if (!Array.isArray(gameState.nexuses) || !gameState.nexuses.length) {
    const left = Math.floor((BOARD_SIZE - 1) / 4); // quarter column
    const right = BOARD_SIZE - 1 - left;
    const topY = Math.floor(BOARD_SIZE * 0.25);
    const bottomY = Math.floor(BOARD_SIZE * 0.75);

    // helper to adjust if collision
    function findFree(x, y) {
      let yy = y;
      if ((gameState.hearts || []).some(h => h.x === x && h.y === yy)) yy = Math.min(BOARD_SIZE - 2, yy + 1);
      if ((gameState.spawners || []).some(s => s.x === x && s.y === yy)) yy = Math.min(BOARD_SIZE - 2, yy + 1);
      if ((gameState.nexuses || []).some(n => n.x === x && n.y === yy)) yy = Math.min(BOARD_SIZE - 2, yy + 1);
      return { x, y: yy };
    }

    const n1 = findFree(left, topY);
    const n2 = findFree(right, bottomY);

    gameState.nexuses = [
      { x: n1.x, y: n1.y, owner: 0 }, // 0 = neutral
      { x: n2.x, y: n2.y, owner: 0 }
    ];
  }

  // ensure nexus tiles are not overlapped by terrain
  for (const n of gameState.nexuses) {
    if (gameState.water) gameState.water = gameState.water.filter(t => !(t.x === n.x && t.y === n.y));
    if (gameState.forests) gameState.forests = gameState.forests.filter(t => !(t.x === n.x && t.y === n.y));
    if (gameState.mountains) gameState.mountains = gameState.mountains.filter(t => !(t.x === n.x && t.y === n.y));
    if (gameState.walls) gameState.walls = gameState.walls.filter(t => !(t.x === n.x && t.y === n.y));
    if (gameState.bridges) gameState.bridges = gameState.bridges.filter(t => !(t.x === n.x && t.y === n.y));
  }

  return gameState;
}

function renderNexuses(gameState) {
  // remove old nexus markers
  document.querySelectorAll('.marker-nexus').forEach(n => n.remove());
  if (!gameState || !Array.isArray(gameState.nexuses)) return;

  for (const n of gameState.nexuses) {
    const cell = (typeof getCell === 'function') ? getCell(n.x, n.y) : null;
    if (!cell) continue;
    const el = document.createElement('div');
    el.className = 'marker-nexus';
    const emoji = '⭐';
    el.textContent = emoji;
    el.style.position = 'absolute';
    el.style.pointerEvents = 'none';
    el.style.zIndex = 15;
    el.style.transform = 'translateY(-6px)';
    if (n.owner === 1) el.style.filter = 'drop-shadow(0 2px 8px rgba(60,160,255,0.45))';
    else if (n.owner === 2) el.style.filter = 'drop-shadow(0 2px 8px rgba(255,100,100,0.45))';
    else el.style.filter = 'drop-shadow(0 1px 3px rgba(200,200,200,0.12))';
    cell.appendChild(el);
  }
}

// updateNexusOwners: check units that are currently on nexus tiles and capture ownership
// This should be called once at end-of-turn before nexus damage is applied (or when units move).
function updateNexusOwners(gameState) {
  if (!gameState || !Array.isArray(gameState.nexuses)) return;
  for (const n of gameState.nexuses) {
    const occupyingUnit = (gameState.units || []).find(u => u.x === n.x && u.y === n.y);
    if (occupyingUnit) {
      // capture to unit.owner (persist even after the unit leaves)
      n.owner = occupyingUnit.owner;
    }
  }
  if (typeof renderNexuses === 'function') renderNexuses(gameState);
}

// applyNexusDamage: called exactly once per end-turn to deal damage to the opposing player
// For each nexus owned by player 1, deal 1 damage to player 2; for owner 2 deal to player1.
// Returns winner id (1/2) if someone died to 0 or less, otherwise 0.
function applyNexusDamage(gameState) {
  if (!gameState || !Array.isArray(gameState.nexuses)) return 0;
  
  for (const n of gameState.nexuses) {
    if (n.owner === 1) {
      gameState.p2hp = (gameState.p2hp || 0) - 1;
      // Also update players object if it exists
      if (gameState.players && gameState.players[2]) {
        gameState.players[2].hp = gameState.p2hp;
      }
    } else if (n.owner === 2) {
      gameState.p1hp = (gameState.p1hp || 0) - 1;
      // Also update players object if it exists
      if (gameState.players && gameState.players[1]) {
        gameState.players[1].hp = gameState.p1hp;
      }
    }
  }
  
  if ((gameState.p1hp || 0) <= 0) return 2;
  if ((gameState.p2hp || 0) <= 0) return 1;
  return 0;
}

window.initNexuses = initNexuses;
window.renderNexuses = renderNexuses;
window.updateNexusOwners = updateNexusOwners;
window.applyNexusDamage = applyNexusDamage;