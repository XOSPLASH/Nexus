// nexus.js
// Nexus initialization, ownership update, rendering and damage application.
// All functions accept gameState so module interactions are explicit.

function initNexuses(gameState) {
  // 7 mid-map nexuses arranged roughly symmetrically for 11x11
  gameState.nexuses = [
    { x: 2, y: 3, owner: 0 },
    { x: 5, y: 2, owner: 0 },
    { x: 8, y: 3, owner: 0 },
    { x: 5, y: 4, owner: 0 },
    { x: 2, y: 7, owner: 0 },
    { x: 8, y: 7, owner: 0 },
    { x: 5, y: 8, owner: 0 }
  ];
}

function updateNexusOwners(gameState) {
  if (!gameState.nexuses) return;
  // reset owners then check units standing on them
  gameState.nexuses.forEach(n => n.owner = 0);
  for (const n of gameState.nexuses) {
    const occupant = (gameState.units || []).find(u => u.x === n.x && u.y === n.y);
    if (occupant) n.owner = occupant.owner;
  }
}

function renderNexuses(gameState) {
  if (!gameState || !gameState.gridCells || !gameState.nexuses) return;
  // remove old nexus markers
  document.querySelectorAll('.marker-nexus').forEach(n => n.remove());

  for (const n of gameState.nexuses) {
    const cell = getCell(n.x, n.y);
    if (!cell) continue;
    const marker = document.createElement('div');
    marker.className = 'marker-nexus';
    marker.textContent = '⭐';
    // small color hint (also cell background set)
    if (n.owner === 1) {
      marker.style.color = '#ffffff';
      cell.style.background = '#2b7bd3';
    } else if (n.owner === 2) {
      marker.style.color = '#ffffff';
      cell.style.background = '#d32f2f';
    } else {
      marker.style.color = '#ffd700';
      cell.style.background = '';
    }
    cell.appendChild(marker);
  }
}

// returns 0 if no winner, or 1/2 if winner declared
function applyNexusDamage(gameState) {
  if (!gameState.nexuses) return 0;
  // compute damage per side
  const p1Owned = gameState.nexuses.filter(n => n.owner === 1).length;
  const p2Owned = gameState.nexuses.filter(n => n.owner === 2).length;

  // Player 1 deals p1Owned damage to AI, Player 2 deals p2Owned damage to Player 1
  gameState.p2hp -= p1Owned;
  gameState.p1hp -= p2Owned;

  // check for winner
  if (gameState.p1hp <= 0 && gameState.p2hp <= 0) {
    // tie -> consider AI wins by default (or handle as you like)
    return 0;
  } else if (gameState.p1hp <= 0) {
    return 2;
  } else if (gameState.p2hp <= 0) {
    return 1;
  }
  return 0;
}

function isNexus(x, y, gameState) {
  if (!gameState || !gameState.nexuses) return false;
  return gameState.nexuses.some(n => n.x === x && n.y === y);
}