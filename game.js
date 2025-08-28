// game.js - main integration & game logic (core functions used by ai.js)
// Requires: UNIT_TYPES (units.js), spawn.js functions, nexus.js functions

const BOARD_SIZE = 11;

/* ---- DOM references ---- */
const gridEl = document.getElementById('grid');
const shopListEl = document.getElementById('shop-list');
const statusEl = document.getElementById('status');
const abilityArea = document.getElementById('ability-area');
const endTurnBtn = document.getElementById('end-turn');
const newGameBtn = document.getElementById('new-game');
const p1hpEl = document.getElementById('p1-hp');
const p2hpEl = document.getElementById('p2-hp');
const p1energyEl = document.getElementById('p1-energy');
const p2energyEl = document.getElementById('p2-energy');
const unitDetailsEl = document.getElementById('unit-details');
const unitAbilitiesEl = document.getElementById('unit-abilities');

let gridCells = []; // flat list of DOM .cell elements

/* ---- game state ---- */
let gameState = {
  currentPlayer: 1,
  units: [],
  walls: [],
  spawners: [],
  hearts: [],
  nexuses: [],
  water: [],
  bridges: [],
  forests: [],
  mountains: [],
  p1energy: 5,
  p2energy: 5,
  p1hp: 20,
  p2hp: 20,
  selectedShopUnitType: null,
  selectedUnitId: null,
  builderAction: null,
  turnNumber: 0
};

/* ---- Grid creation & helpers ---- */
function createGrid() {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  gridCells = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener('click', (ev) => onCellClick(ev, x, y), { capture: true });
      gridEl.appendChild(cell);
      gridCells.push(cell);
    }
  }
  gameState.gridCells = gridCells;
}

function getCell(x, y) {
  return gridCells.find(c => +c.dataset.x === x && +c.dataset.y === y);
}
function inBounds(x, y) { return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE; }

/* ---- Terrain query helpers ---- */
function isWaterAt(x, y, gs = gameState) { return gs.water && gs.water.some(w => w.x === x && w.y === y); }
function isBridgeAt(x, y, gs = gameState) { return gs.bridges && gs.bridges.some(b => b.x === x && b.y === y); }
function isForestAt(x, y, gs = gameState) { return gs.forests && gs.forests.some(f => f.x === x && f.y === y); }
function isMountainAt(x, y, gs = gameState) { return gs.mountains && gs.mountains.some(m => m.x === x && m.y === y); }
function isWallAt(x, y, gs = gameState) { return gs.walls && gs.walls.some(w => w.x === x && w.y === y); }
function isHeartAt(x, y, gs = gameState) { return gs.hearts && gs.hearts.some(h => h.x === x && h.y === y); }

/* ---- Symmetric Terrain generation ----
   - Generate left half randomly, mirror horizontally to right half
   - Do NOT place terrain over reserved tiles: hearts, spawners, nexuses
*/
function generateTerrain() {
  // Clear previous
  gameState.water = [];
  gameState.forests = [];
  gameState.mountains = [];
  gameState.bridges = gameState.bridges || [];

  // Build set of reserved coordinates
  const reserved = new Set();
  if (Array.isArray(gameState.hearts)) gameState.hearts.forEach(h => reserved.add(`${h.x},${h.y}`));
  if (Array.isArray(gameState.spawners)) gameState.spawners.forEach(s => reserved.add(`${s.x},${s.y}`));
  if (Array.isArray(gameState.nexuses)) gameState.nexuses.forEach(n => reserved.add(`${n.x},${n.y}`));

  const midY = Math.floor(BOARD_SIZE / 2);
  const leftMaxX = Math.floor((BOARD_SIZE - 1) / 2) - 0; // left side excluding center for odd boards

  // River row decisions: decide per-column on left side and mirror
  for (let x = 1; x <= leftMaxX; x++) {
    const mirrorX = (BOARD_SIZE - 1) - x;
    if (Math.random() < 0.7) {
      if (!reserved.has(`${x},${midY}`) && !isNexus?.(x, midY, gameState)) gameState.water.push({ x, y: midY });
      if (!reserved.has(`${mirrorX},${midY}`) && !isNexus?.(mirrorX, midY, gameState)) gameState.water.push({ x: mirrorX, y: midY });
      // occasional adjacent water for variety
      if (Math.random() < 0.25 && midY + 1 < BOARD_SIZE) {
        if (!reserved.has(`${x},${midY+1}`) && !isNexus?.(x, midY+1, gameState)) gameState.water.push({ x, y: midY+1 });
        if (!reserved.has(`${mirrorX},${midY+1}`) && !isNexus?.(mirrorX, midY+1, gameState)) gameState.water.push({ x: mirrorX, y: midY+1 });
      }
    }
  }

  // Random forests and mountains in left half, then mirror
  const forestAttempts = Math.floor(BOARD_SIZE * 1.2);
  const mountainAttempts = Math.floor(BOARD_SIZE * 0.6);

  for (let i = 0; i < forestAttempts; i++) {
    const x = 1 + Math.floor(Math.random() * (Math.floor(BOARD_SIZE / 2) - 1));
    const y = Math.floor(Math.random() * BOARD_SIZE);
    const mx = (BOARD_SIZE - 1) - x;
    if (y === 0 || y === BOARD_SIZE - 1) continue;
    if (reserved.has(`${x},${y}`) || reserved.has(`${mx},${y}`)) continue;
    if (!isWaterAt(x, y) && !isNexus?.(x, y, gameState) && !isForestAt(x, y)) gameState.forests.push({ x, y });
    if (!isWaterAt(mx, y) && !isNexus?.(mx, y, gameState) && !isForestAt(mx, y)) gameState.forests.push({ x: mx, y });
  }

  for (let i = 0; i < mountainAttempts; i++) {
    const x = 1 + Math.floor(Math.random() * (Math.floor(BOARD_SIZE / 2) - 1));
    const y = Math.floor(Math.random() * BOARD_SIZE);
    const mx = (BOARD_SIZE - 1) - x;
    if (y <= 1 || y >= BOARD_SIZE - 2) continue;
    if (reserved.has(`${x},${y}`) || reserved.has(`${mx},${y}`)) continue;
    if (!isWaterAt(x, y) && !isForestAt(x, y) && !isNexus?.(x, y, gameState)) gameState.mountains.push({ x, y });
    if (!isWaterAt(mx, y) && !isForestAt(mx, y) && !isNexus?.(mx, y, gameState)) gameState.mountains.push({ x: mx, y });
  }

  // Deduplicate
  const uniq = (arr) => {
    const seen = new Set();
    const out = [];
    for (const p of arr) {
      const k = `${p.x},${p.y}`;
      if (!seen.has(k)) { seen.add(k); out.push(p); }
    }
    return out;
  };
  gameState.water = uniq(gameState.water);
  gameState.forests = uniq(gameState.forests);
  gameState.mountains = uniq(gameState.mountains);
}

/* ---- Show terrain/unit details ---- */
function showTerrainDetails(x, y) {
  if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = '';
  if (!unitDetailsEl) return;
  unitDetailsEl.className = '';

  if (typeof isNexus === 'function' && isNexus(x, y, gameState)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">⭐ Nexus</div><div>Capture to gain control and deal damage over time.</div>`;
    return;
  }
  if (gameState.hearts && gameState.hearts.some(h => h.x === x && h.y === y)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">❤️ Heart</div><div>Your base. Lose it and you lose the game.</div>`;
    return;
  }
  if (gameState.spawners && gameState.spawners.some(s => s.x === x && s.y === y)) {
    const sp = gameState.spawners.find(s => s.x === x && s.y === y);
    const who = sp && sp.owner === 1 ? 'Player' : (sp && sp.owner === 2 ? 'AI' : 'Neutral');
    unitDetailsEl.innerHTML = `<div class="unit-name">🏰 Spawner</div><div>${who} spawner — place units adjacent to this tile.</div>`;
    return;
  }
  if (isForestAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">🌲 Forest</div><div>Provides +2 defense to units standing here.</div>`; return; }
  if (isMountainAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">⛰️ Mountain</div><div>Impassable for most units.</div>`; return; }
  if (isWaterAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">💧 Water</div><div>Only naval units or bridges allow traversal across water.</div>`; return; }
  if (isBridgeAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">🌉 Bridge</div><div>Allows land units to cross this tile.</div>`; return; }
  if (isWallAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">🧱 Wall</div><div>Blocks movement and line-of-sight.</div>`; return; }

  clearUnitDetails();
}

/* ---- Shop UI (group by cost) ---- */
function buildShopUI() {
  if (!shopListEl) return;
  shopListEl.innerHTML = '';
  // Group units by cost
  const costBuckets = {};
  for (const key of Object.keys(UNIT_TYPES || {})) {
    const unit = UNIT_TYPES[key];
    const cost = unit.cost || 0;
    if (!costBuckets[cost]) costBuckets[cost] = [];
    costBuckets[cost].push({ key, unit });
  }
  const costs = Object.keys(costBuckets).map(c => parseInt(c, 10)).sort((a, b) => a - b);
  for (const c of costs) {
    const header = document.createElement('div');
    header.className = 'shop-cost-header';
    header.textContent = `Cost: ${c}`;
    header.style.fontWeight = '700';
    header.style.marginTop = '8px';
    shopListEl.appendChild(header);
    // sort units by name inside bucket
    costBuckets[c].sort((a, b) => (a.unit.name || a.key).localeCompare(b.unit.name || b.key));
    for (const entry of costBuckets[c]) {
      const key = entry.key; const unit = entry.unit;
      const item = document.createElement('div');
      item.className = 'shop-item';
      item.dataset.unitType = key;
      item.innerHTML = `<div><strong>${unit.name}</strong><div style="font-size:11px;color:#ddd">${unit.description || ''}</div></div><div>⚡${unit.cost}</div>`;
      item.addEventListener('click', () => onShopItemClick(key));
      shopListEl.appendChild(item);
    }
  }
  refreshShopUI();
}

function refreshShopUI() {
  document.querySelectorAll('.shop-item').forEach(it => {
    const type = it.dataset.unitType;
    const cost = (UNIT_TYPES[type] && UNIT_TYPES[type].cost) || 0;
    it.classList.remove('cant-afford', 'removed', 'selected');
    // hide if player already placed this unit (one-of-each)
    if (gameState.units.some(u => u.owner === 1 && u.type === type)) {
      it.classList.add('removed');
      it.style.pointerEvents = 'none';
      it.setAttribute('aria-hidden', 'true');
      return;
    }
    // can't afford
    if (gameState.currentPlayer === 1 && gameState.p1energy < cost) it.classList.add('cant-afford');
    if (gameState.selectedShopUnitType === type) it.classList.add('selected');
  });
}

/* ---- Shop placement handler ---- */
function onShopItemClick(type) {
  if (gameState.currentPlayer !== 1) { if (statusEl) statusEl.textContent = "Not your turn."; return; }
  const cost = (UNIT_TYPES[type] && UNIT_TYPES[type].cost) || 0;
  if (gameState.p1energy < cost) { if (statusEl) statusEl.textContent = "Not enough energy."; return; }
  // only allow one-of-per-player for certain units (keeps parity with AI)
  if (gameState.units.some(u => u.owner === 1 && u.type === type)) { if (statusEl) statusEl.textContent = "Already placed."; return; }

  gameState.selectedShopUnitType = type;
  gameState.selectedUnitId = null;

  const tpl = UNIT_TYPES[type];
  const fakeUnit = { id: 'preview-' + type, type, owner: 1, hp: tpl.hp, attack: tpl.attack, range: tpl.range, move: tpl.move, actionsLeft: 0 };
  showUnitDetails(fakeUnit);
  highlightSpawnerAdjForPlayer(1);
  if (statusEl) statusEl.textContent = `Placing ${tpl.name}. Click an adjacent tile to your spawner to place.`;
  refreshShopUI();
}

/* ---- Spawner highlights ---- */
function highlightSpawnerAdjForPlayer(player) {
  clearSpawnerHighlights();
  const sp = gameState.spawners.find(s => s.owner === player);
  if (!sp) return;
  const options = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
  for (const t of options) { const c = getCell(t.x, t.y); if (c) c.classList.add('spawn-highlight'); }
}
function clearSpawnerHighlights() { document.querySelectorAll('.spawn-highlight').forEach(c => c.classList.remove('spawn-highlight')); }

/* ---- Unit placement ---- */
function placeUnit(type, x, y, owner) {
  if (!inBounds(x, y)) return false;
  if (unitAt(x, y)) return false;
  const tpl = UNIT_TYPES[type]; if (!tpl) return false;

  // water-only / crossing rules
  if (tpl.waterOnly && !isWaterAt(x, y) && !isBridgeAt(x, y)) {
    if (!getAdjacentTiles(x, y).some(t => isWaterAt(t.x, t.y))) return false;
  }
  if (!tpl.waterOnly && isWaterAt(x, y) && !isBridgeAt(x, y) && !tpl.canCrossWater) return false;
  if (isMountainAt(x, y) && !tpl.canFly) return false;
  if (owner === 1 && gameState.units.some(u => u.owner === 1 && u.type === type)) return false;

  const unit = {
    id: Date.now() + Math.random(),
    type, x, y, owner,
    hp: tpl.hp, attack: tpl.attack, range: tpl.range, move: tpl.move,
    symbol: tpl.symbol, actionsLeft: 2, tempAttack: 0, rangeBoost: 0, tempMove: 0
  };
  if (isForestAt(x, y)) unit.defenseBonus = 2;
  gameState.units.push(unit);

  // If player placed from shop, deduct energy and mark item removed by refreshShopUI
  if (owner === 1 && gameState.selectedShopUnitType === type) {
    gameState.p1energy = Math.max(0, gameState.p1energy - (tpl.cost || 0));
    gameState.selectedShopUnitType = null;
    clearSpawnerHighlights();
  }

  updateNexusesOwnersAndRender(); updateGrid(); updateUI(); refreshShopUI();
  return true;
}

function placeUnitNearSpawner(type, owner) {
  const sp = gameState.spawners.find(s => s.owner === owner);
  if (!sp) return false;
  const opts = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
  if (!opts.length) return false;
  const tile = opts[Math.floor(Math.random() * opts.length)];
  return placeUnit(type, tile.x, tile.y, owner);
}

/* ---- Queries ---- */
function unitAt(x, y) { return gameState.units.find(u => u.x === x && u.y === y); }
function getAdjacentTiles(x, y, gs = gameState) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]]; const out = [];
  for (const [dx, dy] of dirs) { const nx = x + dx, ny = y + dy; if (inBounds(nx, ny)) out.push({ x: nx, y: ny }); }
  return out;
}
function getAdjacentEmptyTiles(x, y, gameStateLocal = gameState) {
  const candidates = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
  const out = [];
  for (const t of candidates) {
    if (t.x < 0 || t.y < 0 || t.x >= BOARD_SIZE || t.y >= BOARD_SIZE) continue;
    if (typeof isNexus === 'function' && isNexus(t.x, t.y, gameStateLocal)) continue;
    if (gameStateLocal.walls && gameStateLocal.walls.some(w => w.x === t.x && w.y === t.y)) continue;
    if (gameStateLocal.units && gameStateLocal.units.some(u => u.x === t.x && u.y === t.y)) continue;
    if (gameStateLocal.hearts && gameStateLocal.hearts.some(h => h.x === t.x && h.y === t.y)) continue;
    out.push(t);
  }
  return out;
}

/* ---- Movement & combat (pathfinding BFS) ---- */
function computeReachable(unit) {
  const maxSteps = (unit.move || 0) + (unit.tempMove || 0);
  const start = { x: unit.x, y: unit.y };
  const visited = new Set(); const q = [{ x: start.x, y: start.y, dist: 0 }];
  visited.add(`${start.x},${start.y}`);
  const reachable = new Set();
  while (q.length) {
    const cur = q.shift();
    const neighbors = getAdjacentTiles(cur.x, cur.y);
    for (const n of neighbors) {
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;
      if (unitAt(n.x, n.y) && !(n.x === unit.x && n.y === unit.y)) continue;
      if (isWallAt(n.x, n.y)) continue;
      if (isHeartAt(n.x, n.y)) continue;
      if (isMountainAt(n.x, n.y) && !UNIT_TYPES[unit.type].canFly) continue;
      if (isWaterAt(n.x, n.y) && !isBridgeAt(n.x, n.y)) {
        if (!UNIT_TYPES[unit.type].canCrossWater && !UNIT_TYPES[unit.type].waterOnly) continue;
        if (UNIT_TYPES[unit.type].waterOnly && !isWaterAt(n.x, n.y)) continue;
      }
      if (cur.dist + 1 <= maxSteps) {
        reachable.add(key);
        visited.add(key);
        q.push({ x: n.x, y: n.y, dist: cur.dist + 1 });
      }
    }
  }
  return reachable;
}

function canMoveTo(unit, x, y) {
  if (!unit || unit.actionsLeft <= 0) return false;
  if (!inBounds(x, y)) return false;
  if (unit.frozen) return false;
  if (unitAt(x, y)) return false;
  if (isWallAt(x, y) || isHeartAt(x, y)) return false;
  const tpl = UNIT_TYPES[unit.type];
  if (isMountainAt(x, y) && !tpl?.canFly) return false;
  if (isWaterAt(x, y) && !isBridgeAt(x, y)) {
    if (!tpl?.canCrossWater && !tpl?.waterOnly) return false;
  }
  const reachable = computeReachable(unit);
  return reachable.has(`${x},${y}`);
}

function canAttack(unit, x, y) {
  if (!unit || unit.actionsLeft <= 0) return false;
  if (!inBounds(x, y)) return false;
  if (unit.frozen) return false;
  if (isHeartAt(x, y)) {
    const heartOwner = gameState.hearts.find(h => h.x === x && h.y === y).owner;
    if (heartOwner === unit.owner) return false;
    const dist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
    return dist <= (unit.range + (unit.rangeBoost || 0));
  }
  const target = unitAt(x, y); if (!target || target.owner === unit.owner) return false;
  const realDist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
  return realDist <= (unit.range + (unit.rangeBoost || 0));
}

function isWallBetween(x1, y1, x2, y2) {
  if (x1 === x2) for (let y = Math.min(y1, y2) + 1; y < Math.max(y1, y2); y++) if (isWallAt(x1, y)) return true;
  if (y1 === y2) for (let x = Math.min(x1, x2) + 1; x < Math.max(x1, x2); x++) if (isWallAt(x, y1)) return true;
  return false;
}

function moveUnit(unit, x, y) {
  if (!canMoveTo(unit, x, y)) return false;
  unit.x = x; unit.y = y; unit.actionsLeft--;
  if (isForestAt(x, y)) unit.defenseBonus = 2; else delete unit.defenseBonus;
  updateNexusesOwnersAndRender(); updateGrid(); updateUI(); clearHighlights();
  if (unit.actionsLeft <= 0) { gameState.selectedUnitId = null; clearUnitDetails(); } else { highlightMovement(unit); showUnitDetails(unit); }
  return true;
}

function attack(unit, x, y) {
  if (!canAttack(unit, x, y)) return false;
  if (isHeartAt(x, y)) {
    const heartOwner = gameState.hearts.find(h => h.x === x && h.y === y).owner;
    const dmg = unit.attack + (unit.tempAttack || 0);
    gameState[`p${heartOwner}hp`] -= dmg;
    unit.actionsLeft--; updateUI(); updateGrid(); clearHighlights();
    return true;
  }
  const target = unitAt(x, y);
  if (!target) return false;
  let dmg = unit.attack + (unit.tempAttack || 0);
  if (unit.backstabReady) { dmg *= 2; unit.backstabReady = false; }
  if (unit.headshotReady && target.hp <= 5) { target.hp = 0; unit.headshotReady = false; } else {
    if (target.defenseBonus) dmg = Math.max(1, dmg - target.defenseBonus);
    if (target.shielded) { dmg = 0; target.shielded = false; } else target.hp -= dmg;
    if (unit.freezeNext) { target.frozen = true; unit.freezeNext = false; }
  }
  unit.actionsLeft--; if (target.hp <= 0) gameState.units = gameState.units.filter(u => u.id !== target.id);
  updateGrid(); updateUI(); clearHighlights();
  if (unit.actionsLeft > 0) { highlightMovement(unit); showUnitDetails(unit); } else { gameState.selectedUnitId = null; clearUnitDetails(); }
  return true;
}

/* ---- selection & highlights ---- */
function selectUnit(id) {
  gameState.selectedUnitId = id;
  const unit = gameState.units.find(u => u.id === id);
  if (!unit) return;
  clearHighlights(); highlightMovement(unit); showUnitDetails(unit);
}
function deselectUnit(keepDetails = false) { gameState.selectedUnitId = null; gameState.builderAction = null; clearHighlights(); if (!keepDetails) clearUnitDetails(); }

function computeReachableSetForUI(unit) {
  return computeReachable(unit);
}

function highlightMovement(unit) {
  clearHighlights();
  const reach = computeReachable(unit);
  for (const key of reach) {
    const [sx, sy] = key.split(',').map(n => +n);
    const c = getCell(sx, sy); if (c) c.classList.add('highlight-move');
  }
  for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
    try {
      if (canAttack(unit, x, y)) getCell(x, y).classList.add('highlight-attack');
    } catch (e) { /* defensive */ }
  }
}
function clearHighlights() { document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight-move', 'highlight-attack', 'spawn-highlight')); }

/* ---- unit details UI ---- */
function showUnitDetails(unit) {
  if (!unit || !unitDetailsEl) return;
  const tpl = UNIT_TYPES[unit.type]; if (!tpl) return;
  const currentAttack = (unit.attack || tpl.attack) + (unit.tempAttack || 0);
  const currentRange = (unit.range || tpl.range) + (unit.rangeBoost || 0);
  const currentMove = (unit.move || tpl.move) + (unit.tempMove || 0);
  let statusText = '';
  if (unit.frozen) statusText += '<span class="status-frozen">❄️ Frozen</span>';
  if (unit.invisible) statusText += '<span class="status-invisible">👻 Invisible</span>';
  if (unit.shielded) statusText += '<span class="status-shielded">🛡️ Shielded</span>';
  if (unit.defenseBonus) statusText += '<span class="status-defense">🌳 +2 Defense</span>';

  unitDetailsEl.className = '';
  unitDetailsEl.innerHTML = `
    <div class="unit-symbol">${tpl.symbol || ''}</div>
    <div class="unit-name">${tpl.name}</div>
    ${tpl.description ? `<div class="unit-description">${tpl.description}</div>` : ''}
    <div class="unit-stat"><span class="unit-stat-label">HP</span><span>${unit.hp ?? tpl.hp} / ${tpl.hp}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Attack</span><span>${currentAttack}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Range</span><span>${currentRange}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Move</span><span>${currentMove}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Actions</span><span>${unit.actionsLeft ?? 0}</span></div>
    ${statusText ? `<div class="unit-status">${statusText}</div>` : ''}
  `;
  if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = '';
  showUnitAbilities(unit);
}

function clearUnitDetails() { if (!unitDetailsEl) return; unitDetailsEl.className = 'empty'; unitDetailsEl.innerHTML = 'Select a unit to view its details'; if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = ''; }

/* ---- abilities UI & execution ---- */
function showUnitAbilities(unit) {
  if (!unitAbilitiesEl) return;
  unitAbilitiesEl.innerHTML = '';
  if (!unit || unit.owner !== gameState.currentPlayer) return;
  const tpl = UNIT_TYPES[unit.type]; if (!tpl) return;

  // Builder buttons
  if (tpl.isBuilder) {
    const buildBtn = document.createElement('button'); buildBtn.className = 'unit-ability-btn';
    buildBtn.textContent = '🔨 Build Wall'; buildBtn.addEventListener('click', () => { gameState.builderAction = 'build'; if (statusEl) statusEl.textContent = 'Builder: click adjacent empty tile to build a wall.'; });
    unitAbilitiesEl.appendChild(buildBtn);

    const breakBtn = document.createElement('button'); breakBtn.className = 'unit-ability-btn';
    breakBtn.textContent = '💥 Break Wall'; breakBtn.addEventListener('click', () => { gameState.builderAction = 'break'; if (statusEl) statusEl.textContent = 'Builder: click adjacent wall to break.'; });
    unitAbilitiesEl.appendChild(breakBtn);

    const bridgeBtn = document.createElement('button'); bridgeBtn.className = 'unit-ability-btn';
    bridgeBtn.textContent = '🌉 Build Bridge'; bridgeBtn.addEventListener('click', () => { gameState.builderAction = 'bridge'; if (statusEl) statusEl.textContent = 'Builder: click adjacent water tile to build a bridge.'; });
    unitAbilitiesEl.appendChild(bridgeBtn);
  }

  if (tpl.abilities && tpl.abilities.length) {
    tpl.abilities.forEach(ab => {
      const btn = document.createElement('button'); btn.className = 'unit-ability-btn'; btn.textContent = ab.name;
      btn.addEventListener('click', () => {
        if (unit.actionsLeft <= 0) { if (statusEl) statusEl.textContent = 'No actions left.'; return; }
        const res = ab.action(unit, gameState) || {};
        updateGrid(); updateUI(); clearHighlights();
        if (unit.actionsLeft > 0) { highlightMovement(unit); showUnitDetails(unit); }
        if (res.msg) if (statusEl) statusEl.textContent = res.msg; else if (statusEl) statusEl.textContent = `${ab.name} used.`;
        if (unit.actionsLeft <= 0) { gameState.selectedUnitId = null; clearUnitDetails(); }
      });
      unitAbilitiesEl.appendChild(btn);
    });
  }
}

/* ---- render grid ---- */
function updateGrid() {
  document.querySelectorAll('.unit-el').forEach(n => n.remove());
  document.querySelectorAll('.cell').forEach(c => { c.classList.remove('wall', 'water', 'bridge', 'forest', 'mountain', 'highlight-move', 'highlight-attack', 'spawn-highlight'); c.textContent = ''; c.style.background = ''; });

  if (gameState.water) for (const w of gameState.water) { const c = getCell(w.x, w.y); if (c) c.classList.add('water'); }
  if (gameState.bridges) for (const b of gameState.bridges) { const c = getCell(b.x, b.y); if (c) { c.classList.add('bridge'); c.textContent = '🌉'; } }
  if (gameState.forests) for (const f of gameState.forests) { const c = getCell(f.x, f.y); if (c) { c.classList.add('forest'); c.textContent = '🌲'; } }
  if (gameState.mountains) for (const m of gameState.mountains) { const c = getCell(m.x, m.y); if (c) { c.classList.add('mountain'); c.textContent = '⛰️'; } }
  if (gameState.walls) for (const w of gameState.walls) { const c = getCell(w.x, w.y); if (c) { c.classList.add('wall'); c.textContent = '🧱'; } }

  if (typeof renderSpawnersAndHearts === 'function') renderSpawnersAndHearts(gameState);
  if (typeof renderNexuses === 'function') renderNexuses(gameState);

  document.querySelectorAll('.marker-spawner, .marker-nexus, .marker-heart').forEach(m => { m.style.pointerEvents = 'none'; m.style.zIndex = 16; });

  // Render units
  for (const u of gameState.units) {
    const c = getCell(u.x, u.y); if (!c) continue;
    if (c.classList.contains('wall')) continue;
    const el = document.createElement('div'); el.className = `unit-el owner-${u.owner}`;
    el.dataset.unitId = u.id; el.dataset.owner = u.owner;
    if (u.id === gameState.selectedUnitId) el.classList.add('selected');
    if (u.invisible && u.owner === gameState.currentPlayer) el.classList.add('invisible-friendly');
    else if (u.invisible) continue;
    el.textContent = UNIT_TYPES[u.type].symbol || (u.owner === 1 ? '🔵' : '🔴');
    const hpBadge = document.createElement('div'); hpBadge.className = 'unit-hp'; hpBadge.textContent = `${u.hp}`; el.appendChild(hpBadge);
    if (u.frozen) { const ic = document.createElement('div'); ic.className = 'status-icon'; ic.textContent = '❄️'; el.appendChild(ic); }

    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (u.owner === gameState.currentPlayer) {
        if (gameState.selectedUnitId === u.id) { deselectUnit(); return; }
        selectUnit(u.id);
      } else {
        showUnitDetails(u);
      }
    });

    c.appendChild(el);
  }
}

/* update nexus owners & render */
function updateNexusesOwnersAndRender() {
  if (typeof updateNexusOwners === 'function') updateNexusOwners(gameState);
  if (typeof renderNexuses === 'function') renderNexuses(gameState);
}

/* ---- cell click handler (capture) ---- */
function onCellClick(ev, x, y) {
  // detect if a unit element was clicked inside the cell
  const unitEl = ev && ev.target && ev.target.closest ? ev.target.closest('.unit-el') : null;
  if (unitEl) {
    const clickedUnitId = unitEl.dataset && unitEl.dataset.unitId;
    const clicked = gameState.units.find(u => `${u.id}` === `${clickedUnitId}`);
    const selected = gameState.units.find(u => u.id === gameState.selectedUnitId);

    // If we have selected friendly unit and clicked an enemy -> attempt attack
    if (selected && clicked && selected.owner === gameState.currentPlayer && clicked.owner !== selected.owner) {
      if (canAttack(selected, clicked.x, clicked.y)) {
        ev.stopPropagation();
        attack(selected, clicked.x, clicked.y);
        return;
      }
      return;
    }
    // otherwise let the element's own click handler manage selection/details
    return;
  }

  const sel = gameState.units.find(u => u.id === gameState.selectedUnitId);

  // heal mode
  if (sel && sel.healMode) {
    const target = unitAt(x, y);
    if (target && target.owner === sel.owner) {
      const dist = Math.abs(sel.x - x) + Math.abs(sel.y - y);
      if (dist <= sel.range) {
        const maxHp = UNIT_TYPES[target.type].hp;
        target.hp = Math.min(target.hp + 5, maxHp);
        sel.healMode = false; sel.actionsLeft--; if (statusEl) statusEl.textContent = "Healed ally +5 HP!";
        updateGrid(); updateUI();
        if (sel.actionsLeft <= 0) { gameState.selectedUnitId = null; clearUnitDetails(); } else showUnitDetails(sel);
        return;
      }
    }
    sel.healMode = false; if (statusEl) statusEl.textContent = "Heal cancelled."; showUnitDetails(sel); return;
  }

  // transport mode (if any) - just cancel/make safe
  if (sel && sel.transportMode) {
    sel.transportMode = false; if (statusEl) statusEl.textContent = "Transport cancelled."; showUnitDetails(sel); return;
  }

  // shop placement handling when selectedShopUnitType set
  if (gameState.selectedShopUnitType && gameState.currentPlayer === 1) {
    const sp = gameState.spawners.find(s => s.owner === 1);
    if (!sp) { if (statusEl) statusEl.textContent = 'No spawner.'; gameState.selectedShopUnitType = null; refreshShopUI(); return; }
    const options = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
    const tpl = UNIT_TYPES[gameState.selectedShopUnitType];
    let canPlace = false;
    if (options.some(t => t.x === x && t.y === y)) canPlace = true;
    if (tpl && tpl.waterOnly) {
      if (isWaterAt(x, y) || getAdjacentTiles(x, y).some(a => isWaterAt(a.x, a.y))) canPlace = true;
    }
    if (!canPlace) { if (statusEl) statusEl.textContent = 'Placement cancelled or invalid tile.'; gameState.selectedShopUnitType = null; clearSpawnerHighlights(); refreshShopUI(); return; }
    if (placeUnit(gameState.selectedShopUnitType, x, y, 1)) {
      // energy already handled in placeUnit when placing from shop
    }
    gameState.selectedShopUnitType = null; clearSpawnerHighlights(); refreshShopUI(); updateGrid(); updateUI(); return;
  }

  // builder actions (build/break/bridge)
  if (gameState.builderAction && gameState.selectedUnitId) {
    const builder = gameState.units.find(u => u.id === gameState.selectedUnitId);
    if (!builder || (builder.type !== 'builder' && gameState.builderAction !== 'bridge')) { gameState.builderAction = null; }
    else {
      const dist = Math.abs(builder.x - x) + Math.abs(builder.y - y);
      if (dist !== 1) { if (statusEl) statusEl.textContent = 'Must click adjacent tile.'; return; }

      if (gameState.builderAction === 'build') {
        if (unitAt(x, y) || isWallAt(x, y) || (typeof isNexus === 'function' && isNexus(x, y, gameState)) || isHeartAt(x, y) || isWaterAt(x, y)) { if (statusEl) statusEl.textContent = 'Cannot build here.'; return; }
        gameState.walls = gameState.walls || []; gameState.walls.push({ x, y });
        builder.actionsLeft = Math.max(0, builder.actionsLeft - 1); gameState.builderAction = null; if (statusEl) statusEl.textContent = 'Wall built.'; updateGrid(); updateUI(); clearHighlights();
        if (builder.actionsLeft > 0) showUnitDetails(builder); else { gameState.selectedUnitId = null; clearUnitDetails(); } return;
      } else if (gameState.builderAction === 'break') {
        if (!isWallAt(x, y)) { if (statusEl) statusEl.textContent = 'No wall here.'; return; }
        gameState.walls = gameState.walls.filter(w => !(w.x === x && w.y === y));
        builder.actionsLeft = Math.max(0, builder.actionsLeft - 1); gameState.builderAction = null; if (statusEl) statusEl.textContent = 'Wall broken.'; updateGrid(); updateUI(); clearHighlights();
        if (builder.actionsLeft > 0) showUnitDetails(builder); else { gameState.selectedUnitId = null; clearUnitDetails(); } return;
      } else if (gameState.builderAction === 'bridge') {
        if (!isWaterAt(x, y)) { if (statusEl) statusEl.textContent = 'Can only build bridge on water.'; return; }
        if (isBridgeAt(x, y)) { if (statusEl) statusEl.textContent = 'Bridge already exists.'; return; }
        gameState.bridges = gameState.bridges || []; gameState.bridges.push({ x, y });
        builder.actionsLeft = Math.max(0, builder.actionsLeft - 1); gameState.builderAction = null; if (statusEl) statusEl.textContent = 'Bridge built!'; updateGrid(); updateUI(); clearHighlights();
        if (builder.actionsLeft > 0) showUnitDetails(builder); else { gameState.selectedUnitId = null; clearUnitDetails(); } return;
      }
    }
  }

  // --- Always show terrain when clicking empty tile (fixed) ---
  const clicked = unitAt(x, y);
  if (!clicked && !gameState.selectedShopUnitType) {
    // if a unit is selected, attempt move/attack first
    const selunit = gameState.units.find(u => u.id === gameState.selectedUnitId);
    if (selunit) {
      if (canMoveTo(selunit, x, y)) { moveUnit(selunit, x, y); return; }
      if (canAttack(selunit, x, y)) { attack(selunit, x, y); return; }
    }
    // no selected unit or no valid action: show terrain info
    deselectUnit(true);
    showTerrainDetails(x, y);
    if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = '';
    return;
  }

  // selecting own unit (delegated to unit click handler normally)
  if (clicked && clicked.owner === gameState.currentPlayer) {
    if (gameState.selectedUnitId === clicked.id) { deselectUnit(); return; }
    gameState.selectedShopUnitType = null; clearSpawnerHighlights(); refreshShopUI(); selectUnit(clicked.id); return;
  }

  // clicked enemy unit while no friendly selected -> show its details
  if (clicked && clicked.owner !== gameState.currentPlayer) {
    gameState.selectedShopUnitType = null; clearSpawnerHighlights(); showUnitDetails(clicked); return;
  }
}

/* ---- end turn flow ---- */
function endTurn() {
  // clear temporary effects at end of each turn
  gameState.units.forEach(u => { delete u.tempAttack; delete u.rangeBoost; delete u.tempMove; delete u.frozen; delete u.invisible; delete u.revealed; });

  if (typeof applyNexusDamage === 'function') {
    const winner = applyNexusDamage(gameState);
    updateUI(); updateGrid();
    if (winner === 1 || winner === 2) { if (statusEl) statusEl.textContent = `Player ${winner} wins by nexus damage!`; gameState.currentPlayer = 0; return; }
  }

  gameState.currentPlayer = gameState.currentPlayer === 1 ? 2 : 1;
  gameState.turnNumber++;
  gameState.units.forEach(u => { if (u.owner === gameState.currentPlayer) u.actionsLeft = 2; });

  const baseGain = 2; const bonusGain = (gameState.turnNumber % 3 === 0) ? 1 : 0;
  if (gameState.currentPlayer === 1) gameState.p1energy += baseGain + bonusGain; else gameState.p2energy += baseGain + bonusGain;

  gameState.selectedUnitId = null; gameState.selectedShopUnitType = null; gameState.builderAction = null;
  clearSpawnerHighlights(); clearHighlights(); clearUnitDetails(); refreshShopUI(); updateUI(); updateGrid();

  if (gameState.currentPlayer === 2) {
    if (statusEl) statusEl.textContent = "AI's turn...";
    setTimeout(() => {
      if (typeof aiTakeTurn === 'function') aiTakeTurn(gameState);
      else {
        endTurn();
      }
    }, 350);
  } else {
    if (statusEl) statusEl.textContent = "Player 1's turn.";
  }
}

/* ---- UI updates ---- */
function updateUI() {
  if (p1hpEl) p1hpEl.textContent = gameState.p1hp;
  if (p2hpEl) p2hpEl.textContent = gameState.p2hp;
  if (p1energyEl) p1energyEl.textContent = gameState.p1energy;
  if (p2energyEl) p2energyEl.textContent = gameState.p2energy;
  refreshShopUI();
}

/* ---- init & wiring ---- */
function initGame() {
  gameState.units = []; gameState.walls = []; gameState.water = []; gameState.bridges = []; gameState.forests = []; gameState.mountains = [];
  gameState.p1energy = 5; gameState.p2energy = 5; gameState.p1hp = 20; gameState.p2hp = 20;
  gameState.selectedShopUnitType = null; gameState.selectedUnitId = null; gameState.builderAction = null; gameState.turnNumber = 0; gameState.currentPlayer = 1;

  createGrid();

  // Initialize spawners/hearts first so terrain generation can avoid their tiles
  if (typeof initSpawnersAndHearts === 'function') initSpawnersAndHearts(gameState);

  // Nexus initialization (if present)
  if (typeof initNexuses === 'function') initNexuses(gameState);

  // Now generate symmetric terrain taking reserved tiles into account
  generateTerrain();

  buildShopUI(); refreshShopUI(); updateUI(); updateGrid(); clearUnitDetails();

  if (typeof renderSpawnersAndHearts === 'function') renderSpawnersAndHearts(gameState);
  if (typeof renderNexuses === 'function') renderNexuses(gameState);

  if (endTurnBtn) { endTurnBtn.removeEventListener('click', endTurn); endTurnBtn.addEventListener('click', endTurn); }
  if (newGameBtn) { newGameBtn.removeEventListener('click', initGame); newGameBtn.addEventListener('click', initGame); }

  if (statusEl) statusEl.textContent = "Player 1's turn — place or move units.";
}
document.addEventListener('DOMContentLoaded', initGame);
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' || ev.key === 'Esc') deselectUnit(); });

/* ---- helpers used elsewhere ---- */
function getAdjacentEmptyTiles(x, y, gameStateLocal = gameState) {
  const candidates = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
  const out = [];
  for (const t of candidates) {
    if (t.x < 0 || t.y < 0 || t.x >= BOARD_SIZE || t.y >= BOARD_SIZE) continue;
    if (typeof isNexus === 'function' && isNexus(t.x, t.y, gameStateLocal)) continue;
    if (gameStateLocal.walls && gameStateLocal.walls.some(w => w.x === t.x && w.y === t.y)) continue;
    if (gameStateLocal.units && gameStateLocal.units.some(u => u.x === t.x && u.y === t.y)) continue;
    if (gameStateLocal.hearts && gameStateLocal.hearts.some(h => h.x === t.x && h.y === t.y)) continue;
    out.push(t);
  }
  return out;
}

/* ---- expose functions globally ---- */
window.placeUnit = placeUnit;
window.unitAt = unitAt;
window.canMoveTo = canMoveTo;
window.canAttack = canAttack;
window.moveUnit = moveUnit;
window.attack = attack;
window.getAdjacentEmptyTiles = getAdjacentEmptyTiles;
window.placeUnitNearSpawner = placeUnitNearSpawner;
window.updateGrid = updateGrid;
window.updateUI = updateUI;
window.updateNexusesOwnersAndRender = updateNexusesOwnersAndRender;
window.gameState = gameState;
window.isWaterAt = isWaterAt;
window.isBridgeAt = isBridgeAt;
