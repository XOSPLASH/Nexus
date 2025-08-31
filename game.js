// game.js - main integration & game logic (core functions used by other modules)

// game state ---- */
let gameState = {
  currentPlayer: 1,
  units: [],
  walls: [],
  bridges: [],
  water: [],
  forests: [],
  mountains: [],
  spawners: [],
  hearts: [],
  nexuses: [],
  p1energy: 5,
  p2energy: 5,
  p1hp: 20,
  p2hp: 20,
  selectedShopUnitType: null,
  selectedUnitId: null,
  builderAction: null,
  turnNumber: 0
};

const BOARD_SIZE = 11;

// DOM references
const gridEl = document.getElementById('grid');
const shopListEl = document.getElementById('shop-list');
const statusEl = document.getElementById('status');
const endTurnBtn = document.getElementById('end-turn');
const newGameBtn = document.getElementById('new-game');
const p1hpEl = document.getElementById('p1-hp');
const p2hpEl = document.getElementById('p2-hp');
const p1energyEl = document.getElementById('p1-energy');
const p2energyEl = document.getElementById('p2-energy');
const unitDetailsEl = document.getElementById('unit-details');
const unitAbilitiesEl = document.getElementById('unit-abilities');

let gridCells = [];

// ---- Utility helpers ----
function inBounds(x, y) {
  return Number.isInteger(x) && x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
}

function createGrid() {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  gridCells = [];
  gridEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, 1fr)`;
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const c = document.createElement('div');
      c.className = 'cell';
      c.dataset.x = x;
      c.dataset.y = y;
      c.addEventListener('click', (ev) => onCellClick(ev, x, y));
      gridEl.appendChild(c);
      gridCells.push(c);
    }
  }
}

function getCell(x, y) {
  return gridCells.find(c => +c.dataset.x === x && +c.dataset.y === y) || null;
}

// Terrain/marker checks (defensive)
function isWaterAt(x, y, gs = gameState) { return Array.isArray(gs.water) && gs.water.some(t => t.x === x && t.y === y); }
function isBridgeAt(x, y, gs = gameState) { return Array.isArray(gs.bridges) && gs.bridges.some(t => t.x === x && t.y === y); }
function isForestAt(x, y, gs = gameState) { return Array.isArray(gs.forests) && gs.forests.some(t => t.x === x && t.y === y); }
function isMountainAt(x, y, gs = gameState) { return Array.isArray(gs.mountains) && gs.mountains.some(t => t.x === x && t.y === y); }
function isWallAt(x, y, gs = gameState) { return Array.isArray(gs.walls) && gs.walls.some(t => t.x === x && t.y === y); }
function isHeartAt(x, y, gs = gameState) { return Array.isArray(gs.hearts) && gs.hearts.some(t => t.x === x && t.y === y); }
function isNexusAt(x, y, gs = gameState) {
  if (typeof isNexus === 'function') {
    try { return isNexus(x, y, gs); } catch (e) { /* fallthrough */ }
  }
  return Array.isArray(gs.nexuses) && gs.nexuses.some(n => n.x === x && n.y === y);
}

// Unit query helpers
function unitAt(x, y) { return (gameState.units || []).find(u => u.x === x && u.y === y) || null; }
function getAdjacentTiles(x, y) {
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const out = [];
  for (const [dx, dy] of dirs) {
    const nx = x + dx, ny = y + dy;
    if (inBounds(nx, ny)) out.push({ x: nx, y: ny });
  }
  return out;
}
function getAdjacentEmptyTiles(x, y, gs = gameState) {
  const cand = getAdjacentTiles(x, y);
  return cand.filter(t => {
    if (isNexusAt(t.x, t.y, gs)) return false;
    if (isWallAt(t.x, t.y, gs)) return false;
    if ((gs.units || []).some(u => u.x === t.x && u.y === t.y)) return false;
    if ((gs.hearts || []).some(h => h.x === t.x && h.y === t.y)) return false;
    return true;
  });
}

// BFS movement reach
function computeReachable(unit) {
  if (!unit) return new Set();
  const maxSteps = (unit.move || 0) + (unit.tempMove || 0);
  const start = { x: unit.x, y: unit.y };
  const visited = new Set();
  const q = [{ x: start.x, y: start.y, dist: 0 }];
  visited.add(`${start.x},${start.y}`);
  const reachable = new Set();

  while (q.length) {
    const cur = q.shift();
    for (const n of getAdjacentTiles(cur.x, cur.y)) {
      const key = `${n.x},${n.y}`;
      if (visited.has(key)) continue;
      // blocked conditions
      if (unitAt(n.x, n.y) && !(n.x === unit.x && n.y === unit.y)) continue;
      if (isWallAt(n.x, n.y)) continue;
      if (isHeartAt(n.x, n.y)) continue;
      if (isMountainAt(n.x, n.y) && !UNIT_TYPES[unit.type]?.canFly) continue;
      if (isWaterAt(n.x, n.y) && !isBridgeAt(n.x, n.y)) {
        if (!UNIT_TYPES[unit.type]?.canCrossWater && !UNIT_TYPES[unit.type]?.waterOnly) continue;
        if (UNIT_TYPES[unit.type]?.waterOnly && !isWaterAt(n.x, n.y)) return reachable; // water-only can't step onto land
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

// Movement/attacking checks
function canMoveTo(unit, x, y) {
  if (!unit || unit.actionsLeft <= 0) return false;
  if (!inBounds(x, y)) return false;
  if (unit.frozen) return false;
  if (unitAt(x, y)) return false;
  if (isWallAt(x, y)) return false;
  const tpl = UNIT_TYPES[unit.type] || {};
  if (isMountainAt(x, y) && !tpl.canFly) return false;
  if (isWaterAt(x, y) && !isBridgeAt(x, y)) {
    if (!tpl.canCrossWater && !tpl.waterOnly) return false;
  }
  const reach = computeReachable(unit);
  return reach.has(`${x},${y}`);
}

function canAttack(unit, x, y) {
  if (!unit || unit.actionsLeft <= 0) return false;
  if (!inBounds(x, y)) return false;
  if (unit.frozen) return false;
  if (isHeartAt(x, y)) {
    const heart = (gameState.hearts || []).find(h => h.x === x && h.y === y);
    if (!heart || heart.owner === unit.owner) return false;
    const dist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
    return dist <= ((unit.range || 0) + (unit.rangeBoost || 0));
  }
  const target = unitAt(x, y);
  if (!target || target.owner === unit.owner) return false;
  const dist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
  return dist <= ((unit.range || 0) + (unit.rangeBoost || 0));
}

// Movement & combat functions
function moveUnit(unit, x, y) {
  if (!canMoveTo(unit, x, y)) return false;
  unit.x = x; unit.y = y;
  unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
  if (isForestAt(x, y)) unit.defenseBonus = 2; else delete unit.defenseBonus;
  if (typeof updateNexusOwners === 'function') {
    try { updateNexusOwners(gameState); } catch (e) { /* ignore */ }
  }
  updateGrid(); updateUI(); clearHighlights();
  if ((unit.actionsLeft || 0) <= 0) { gameState.selectedUnitId = null; clearUnitDetails(); } else { highlightMovement(unit); showUnitDetails(unit); }
  return true;
}

function attack(unit, x, y) {
  if (!canAttack(unit, x, y)) return false;
  // attack heart
  if (isHeartAt(x, y)) {
    const heart = (gameState.hearts || []).find(h => h.x === x && h.y === y);
    const dmg = (unit.attack || 0) + (unit.tempAttack || 0);
    if (heart && heart.owner) {
      gameState[`p${heart.owner}hp`] = Math.max(0, (gameState[`p${heart.owner}hp`] || 0) - dmg);
    }
    unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
    updateGrid(); updateUI(); clearHighlights();
    return true;
  }

  const target = unitAt(x, y);
  if (!target) return false;
  let dmg = (unit.attack || 0) + (unit.tempAttack || 0);
  if (target.defenseBonus) dmg = Math.max(1, dmg - target.defenseBonus);
  if (target.shielded) { dmg = 0; target.shielded = false; } else target.hp = (target.hp || 0) - dmg;
  if (unit.freezeNext) { target.frozen = true; unit.freezeNext = false; }
  unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
  if ((target.hp || 0) <= 0) {
    gameState.units = (gameState.units || []).filter(u => u.id !== target.id);
  }
  updateGrid(); updateUI(); clearHighlights();
  if ((unit.actionsLeft || 0) > 0) { highlightMovement(unit); showUnitDetails(unit); } else { gameState.selectedUnitId = null; clearUnitDetails(); }
  return true;
}

// ---- Selection, highlights and details ----
function clearHighlights() {
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight-move', 'highlight-attack', 'spawn-highlight'));
  // remove any attackable-target markers on units
  document.querySelectorAll('.unit-el.attackable-target').forEach(u => u.classList.remove('attackable-target'));
}
function highlightMovement(unit) {
  clearHighlights();
  for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
    try {
      if (canMoveTo(unit, x, y)) {
        const c = getCell(x, y); if (c) c.classList.add('highlight-move');
      }
    } catch (e) {}
    try {
      if (canAttack(unit, x, y)) {
        const cell = getCell(x, y);
        if (cell) {
          cell.classList.add('highlight-attack');
          const unitEl = cell.querySelector('.unit-el');
          if (unitEl) unitEl.classList.add('attackable-target');
        }
      }
    } catch (e) {}
  }
}

function selectUnit(id) {
  gameState.selectedUnitId = id;
  const u = (gameState.units || []).find(x => x.id === id);
  if (!u) return;
  clearHighlights(); highlightMovement(u); showUnitDetails(u);
}

function deselectUnit(keepDetails = false) {
  gameState.selectedUnitId = null;
  gameState.builderAction = null;
  clearHighlights();
  if (!keepDetails) clearUnitDetails();
}

// Unit details UI
function showUnitDetails(unit) {
  if (!unitDetailsEl) return;
  if (!unit) return clearUnitDetails();
  const tpl = UNIT_TYPES[unit.type] || {};
  const curAttack = (unit.attack || tpl.attack || 0) + (unit.tempAttack || 0);
  const curRange = (unit.range || tpl.range || 0) + (unit.rangeBoost || 0);
  const curMove = (unit.move || tpl.move || 0) + (unit.tempMove || 0);
  let statusText = '';
  if (unit.frozen) statusText += ' ❄️';
  if (unit.invisible) statusText += ' 👻';
  if (unit.shielded) statusText += ' 🛡️';
  if (unit.defenseBonus) statusText += ' 🌳';
  unitDetailsEl.className = '';
  unitDetailsEl.innerHTML = `
    <div class="unit-symbol">${tpl.symbol || ''}</div>
    <div class="unit-name">${tpl.name || unit.type}</div>
    ${tpl.description ? `<div class="unit-description">${tpl.description}</div>` : ''}
    <div class="unit-stat"><span class="unit-stat-label">HP</span><span>${unit.hp ?? tpl.hp ?? 0}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Attack</span><span>${curAttack}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Range</span><span>${curRange}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Move</span><span>${curMove}</span></div>
    <div class="unit-stat"><span class="unit-stat-label">Actions</span><span>${unit.actionsLeft ?? 0}</span></div>
    ${statusText ? `<div class="unit-status">${statusText}</div>` : ''}
  `;
  if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = '';
  showUnitAbilities(unit);
}

function clearUnitDetails() {
  if (!unitDetailsEl) return;
  unitDetailsEl.className = 'empty';
  unitDetailsEl.innerHTML = 'Select a unit to view its details';
  if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = '';
}

// Abilities panel
function showUnitAbilities(unit) {
  if (!unitAbilitiesEl) return;
  unitAbilitiesEl.innerHTML = '';
  if (!unit || unit.owner !== gameState.currentPlayer) return;
  const tpl = UNIT_TYPES[unit.type] || {};

  if (tpl.isBuilder) {
    const buildBtn = document.createElement('button'); buildBtn.className = 'unit-ability-btn'; buildBtn.textContent = '🔨 Build Wall';
    buildBtn.addEventListener('click', () => { gameState.builderAction = 'build'; if (statusEl) statusEl.textContent = 'Builder: click adjacent empty tile to build a wall.'; });
    unitAbilitiesEl.appendChild(buildBtn);

    const breakBtn = document.createElement('button'); breakBtn.className = 'unit-ability-btn'; breakBtn.textContent = '💥 Break Wall';
    breakBtn.addEventListener('click', () => { gameState.builderAction = 'break'; if (statusEl) statusEl.textContent = 'Builder: click adjacent wall to break.'; });
    unitAbilitiesEl.appendChild(breakBtn);

    const bridgeBtn = document.createElement('button'); bridgeBtn.className = 'unit-ability-btn'; bridgeBtn.textContent = '🌉 Build Bridge';
    bridgeBtn.addEventListener('click', () => { gameState.builderAction = 'bridge'; if (statusEl) statusEl.textContent = 'Builder: click adjacent water tile to build a bridge.'; });
    unitAbilitiesEl.appendChild(bridgeBtn);
  }

  if (tpl.abilities && tpl.abilities.length) {
    tpl.abilities.forEach(ab => {
      const btn = document.createElement('button'); btn.className = 'unit-ability-btn'; btn.textContent = ab.name;
      btn.addEventListener('click', () => {
        if (unit.actionsLeft <= 0) { if (statusEl) statusEl.textContent = 'No actions left.'; return; }
        try {
          const res = ab.action(unit, gameState) || {};
          updateGrid(); updateUI(); clearHighlights();
          if ((unit.actionsLeft || 0) > 0) { highlightMovement(unit); showUnitDetails(unit); }
          if (res.msg && statusEl) statusEl.textContent = res.msg;
          if ((unit.actionsLeft || 0) <= 0) { gameState.selectedUnitId = null; clearUnitDetails(); }
        } catch (e) {
          console.error('Ability error', e);
        }
      });
      unitAbilitiesEl.appendChild(btn);
    });
  }
}

// ---- Render board & units ----
function updateGrid() {
  // remove old unit elements
  document.querySelectorAll('.unit-el').forEach(n => n.remove());
  // clear base cell classes/text
  document.querySelectorAll('.cell').forEach(c => {
    c.classList.remove('wall', 'water', 'bridge', 'forest', 'mountain', 'highlight-move', 'highlight-attack', 'spawn-highlight');
    c.textContent = '';
    c.style.background = '';
  });

  // render terrain (simple blocky water/forest/mountain)
  (gameState.water || []).forEach(w => { const c = getCell(w.x, w.y); if (c) c.classList.add('water'); });
  (gameState.bridges || []).forEach(b => { const c = getCell(b.x, b.y); if (c) { c.classList.add('bridge'); c.textContent = '🌉'; } });
  (gameState.forests || []).forEach(f => { const c = getCell(f.x, f.y); if (c) { c.classList.add('forest'); c.textContent = '🌲'; } });
  (gameState.mountains || []).forEach(m => { const c = getCell(m.x, m.y); if (c) { c.classList.add('mountain'); c.textContent = '⛰️'; } });
  (gameState.walls || []).forEach(w => { const c = getCell(w.x, w.y); if (c) { c.classList.add('wall'); c.textContent = '🧱'; } });

  // external markers (spawners/hearts/nexuses) rendered by modules if present
  if (typeof renderSpawnersAndHearts === 'function') {
    try { renderSpawnersAndHearts(gameState); } catch (e) { console.error('renderSpawnersAndHearts error', e); }
  }
  if (typeof renderNexuses === 'function') {
    try { renderNexuses(gameState); } catch (e) { console.error('renderNexuses error', e); }
  }

  // ensure marker elements don't catch clicks
  document.querySelectorAll('.marker-spawner, .marker-nexus, .marker-heart').forEach(m => { m.style.pointerEvents = 'none'; m.style.zIndex = 20; });

  // render units
  for (const u of (gameState.units || [])) {
    const c = getCell(u.x, u.y); if (!c) continue;
    if (c.classList.contains('wall')) continue; // avoid rendering on walls
    const el = document.createElement('div'); el.className = `unit-el owner-${u.owner}`; el.dataset.unitId = u.id; el.dataset.owner = u.owner;
    if (u.id === gameState.selectedUnitId) el.classList.add('selected');
    if (u.invisible && u.owner === gameState.currentPlayer) el.classList.add('invisible-friendly'); else if (u.invisible) continue;
    el.textContent = (UNIT_TYPES[u.type] && UNIT_TYPES[u.type].symbol) || (u.owner === 1 ? '🔵' : '🔴');
    const hpBadge = document.createElement('div'); hpBadge.className = 'unit-hp'; hpBadge.textContent = `${u.hp ?? 0}`; el.appendChild(hpBadge);
    if (u.frozen) { const st = document.createElement('div'); st.className = 'status-icon'; st.textContent = '❄️'; el.appendChild(st); }

    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const clickedId = el.dataset.unitId;
      const clicked = (gameState.units || []).find(x => `${x.id}` === `${clickedId}`);
      const selected = (gameState.units || []).find(x => x.id === gameState.selectedUnitId);
      // if we have a selected friendly unit and clicked enemy in range, attack
      if (selected && clicked && selected.owner === gameState.currentPlayer && clicked.owner !== selected.owner) {
        if (canAttack(selected, clicked.x, clicked.y)) { attack(selected, clicked.x, clicked.y); return; }
        return;
      }
      // friendly select/deselect
      if (clicked.owner === gameState.currentPlayer) {
        if (gameState.selectedUnitId === clicked.id) { deselectUnit(); return; }
        gameState.selectedShopUnitType = null; clearSpawnerHighlights(); refreshShopUI(); selectUnit(clicked.id); return;
      } else {
        // enemy clicked -> show info
        showUnitDetails(clicked);
      }
    });

    c.appendChild(el);
  }
}

// ---- Nexus wrappers ----
function updateNexusesOwnersAndRender(gs) {
  if (typeof updateNexusOwners === 'function') {
    try { updateNexusOwners(gs || gameState); } catch (e) { console.error('updateNexusOwners error', e); }
  }
  if (typeof renderNexuses === 'function') {
    try { renderNexuses(gs || gameState); } catch (e) { console.error('renderNexuses error', e); }
  }
}

// ---- Click handling ----
function onCellClick(ev, x, y) {
  // If clicked element was a unit DOM element, ignore here (its own handler stops propagation).
  const unitEl = ev && ev.target && ev.target.closest ? ev.target.closest('.unit-el') : null;
  if (unitEl) return;

  const selectedUnit = (gameState.units || []).find(u => u.id === gameState.selectedUnitId);

  // Builder mode handling (build/break/bridge)
  if (gameState.builderAction && gameState.selectedUnitId) {
    const builder = (gameState.units || []).find(u => u.id === gameState.selectedUnitId);
    if (!builder) { gameState.builderAction = null; return; }
    const dist = Math.abs(builder.x - x) + Math.abs(builder.y - y);
    if (dist !== 1) { if (statusEl) statusEl.textContent = 'Must click adjacent tile.'; return; }
    if (gameState.builderAction === 'build') {
      if (unitAt(x, y) || isWallAt(x, y) || isNexusAt(x, y) || isHeartAt(x, y) || isWaterAt(x, y)) { if (statusEl) statusEl.textContent = 'Cannot build here.'; return; }
      gameState.walls = gameState.walls || []; gameState.walls.push({ x, y });
      builder.actionsLeft = Math.max(0, (builder.actionsLeft || 0) - 1);
      gameState.builderAction = null;
      if (statusEl) statusEl.textContent = 'Wall built.';
      updateGrid(); updateUI(); clearHighlights();
      if ((builder.actionsLeft || 0) > 0) showUnitDetails(builder); else { gameState.selectedUnitId = null; clearUnitDetails(); }
      return;
    } else if (gameState.builderAction === 'break') {
      if (!isWallAt(x, y)) { if (statusEl) statusEl.textContent = 'No wall here.'; return; }
      gameState.walls = gameState.walls.filter(w => !(w.x === x && w.y === y));
      builder.actionsLeft = Math.max(0, (builder.actionsLeft || 0) - 1);
      gameState.builderAction = null;
      if (statusEl) statusEl.textContent = 'Wall broken.';
      updateGrid(); updateUI(); clearHighlights();
      if ((builder.actionsLeft || 0) > 0) showUnitDetails(builder); else { gameState.selectedUnitId = null; clearUnitDetails(); }
      return;
    } else if (gameState.builderAction === 'bridge') {
      if (!isWaterAt(x, y)) { if (statusEl) statusEl.textContent = 'Can only build bridge on water.'; return; }
      if (isBridgeAt(x, y)) { if (statusEl) statusEl.textContent = 'Bridge already exists.'; return; }
      gameState.bridges = gameState.bridges || []; gameState.bridges.push({ x, y });
      builder.actionsLeft = Math.max(0, (builder.actionsLeft || 0) - 1);
      gameState.builderAction = null;
      if (statusEl) statusEl.textContent = 'Bridge built!';
      updateGrid(); updateUI(); clearHighlights();
      if ((builder.actionsLeft || 0) > 0) showUnitDetails(builder); else { gameState.selectedUnitId = null; clearUnitDetails(); }
      return;
    }
  }

  // Shop placement
  if (gameState.selectedShopUnitType && gameState.currentPlayer === 1) {
    const sp = (gameState.spawners || []).find(s => s.owner === 1);
    if (!sp) { if (statusEl) statusEl.textContent = 'No spawner.'; gameState.selectedShopUnitType = null; refreshShopUI(); return; }
    const opts = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
    const tpl = UNIT_TYPES[gameState.selectedShopUnitType];
    let canPlace = false;
    if (opts.some(t => t.x === x && t.y === y)) canPlace = true;
    // naval/waterOnly placement loosened: allow placement on water OR adjacent to water
    if (tpl && tpl.waterOnly) {
      if (isWaterAt(x, y) || getAdjacentTiles(x, y).some(a => isWaterAt(a.x, a.y))) canPlace = true;
    }
    if (!canPlace) { if (statusEl) statusEl.textContent = 'Placement cancelled or invalid tile.'; gameState.selectedShopUnitType = null; clearSpawnerHighlights(); refreshShopUI(); return; }
    if (placeUnit(gameState.selectedShopUnitType, x, y, 1)) {
      // energy deducted by placeUnit when placed via shop
    }
    gameState.selectedShopUnitType = null; clearSpawnerHighlights(); refreshShopUI(); updateGrid(); updateUI();
    return;
  }

  // If empty tile clicked and not in shop mode, handle move/attack or show terrain info
  const clickedUnit = unitAt(x, y);
  if (!clickedUnit && !gameState.selectedShopUnitType) {
    if (selectedUnit) {
      if (canMoveTo(selectedUnit, x, y)) { moveUnit(selectedUnit, x, y); return; }
      if (canAttack(selectedUnit, x, y)) { attack(selectedUnit, x, y); return; }
    }
    // Deselect if clicked empty tile (allow showing terrain)
    deselectUnit(true);
    showTerrainDetails(x, y);
    if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = '';
    return;
  }

  // Selecting friendly unit
  if (clickedUnit && clickedUnit.owner === gameState.currentPlayer) {
    if (gameState.selectedUnitId === clickedUnit.id) { deselectUnit(); return; }
    gameState.selectedShopUnitType = null; clearSpawnerHighlights(); refreshShopUI(); selectUnit(clickedUnit.id); return;
  }

  // Clicking enemy unit -> show details
  if (clickedUnit && clickedUnit.owner !== gameState.currentPlayer) {
    gameState.selectedShopUnitType = null; clearSpawnerHighlights(); showUnitDetails(clickedUnit); return;
  }
}

// ---- Shop UI ----
function buildShopUI() {
  if (!shopListEl || !window.UNIT_TYPES) return;
  shopListEl.innerHTML = '';
  // Group units by cost
  const buckets = {};
  for (const key of Object.keys(UNIT_TYPES || {})) {
    const u = UNIT_TYPES[key]; const c = u.cost || 0;
    buckets[c] = buckets[c] || []; buckets[c].push({ key, u });
  }
  const costs = Object.keys(buckets).map(n => +n).sort((a, b) => a - b);
  for (const cost of costs) {
    const header = document.createElement('div'); header.className = 'shop-cost-header'; header.textContent = `Cost: ${cost}`; header.style.fontWeight = '700';
    shopListEl.appendChild(header);
    buckets[cost].sort((a, b) => (a.u.name || a.key).localeCompare(b.u.name || b.key));
    for (const ent of buckets[cost]) {
      const key = ent.key; const unit = ent.u;
      const item = document.createElement('div'); item.className = 'shop-item'; item.dataset.unitType = key;
      item.innerHTML = `<div class="shop-left"><strong>${unit.name}</strong><div class="shop-desc">${unit.description || ''}</div></div><div class="shop-right">⚡${unit.cost}</div>`;
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
    it.style.pointerEvents = 'auto';
    // remove/hide if player already placed this unit
    if ((gameState.units || []).some(u => u.owner === 1 && u.type === type)) {
      it.classList.add('removed'); it.style.pointerEvents = 'none'; return;
    }
    if (gameState.currentPlayer === 1 && (gameState.p1energy || 0) < cost) it.classList.add('cant-afford');
    if (gameState.selectedShopUnitType === type) it.classList.add('selected');
  });
}

function onShopItemClick(type) {
  if (gameState.currentPlayer !== 1) { if (statusEl) statusEl.textContent = "Not your turn."; return; }
  const cost = (UNIT_TYPES[type] && UNIT_TYPES[type].cost) || 0;
  if ((gameState.p1energy || 0) < cost) { if (statusEl) statusEl.textContent = "Not enough energy."; return; }
  // one-of-each policy for player
  if ((gameState.units || []).some(u => u.owner === 1 && u.type === type)) { if (statusEl) statusEl.textContent = "Already placed."; return; }
  gameState.selectedShopUnitType = type; gameState.selectedUnitId = null;
  const tpl = UNIT_TYPES[type];
  const preview = { id: 'preview-' + type, type, owner: 1, hp: tpl.hp, attack: tpl.attack, range: tpl.range, move: tpl.move, actionsLeft: 0, symbol: tpl.symbol };
  showUnitDetails(preview);
  highlightSpawnerAdjForPlayer(1);
  if (statusEl) statusEl.textContent = `Placing ${tpl.name}. Click an adjacent tile to your spawner to place.`;
  refreshShopUI();
}

// ---- Terrain & markers info ----
function showTerrainDetails(x, y) {
  if (unitAbilitiesEl) unitAbilitiesEl.innerHTML = '';
  if (!unitDetailsEl) return;
  unitDetailsEl.className = '';

  // PRIORITIZE markers & bridge BEFORE water so bridge info shows even if water also exists
  if (isNexusAt(x, y, gameState)) {
    const n = (gameState.nexuses || []).find(n => n.x === x && n.y === y) || {};
    const ownerName = n.owner === 1 ? 'Player' : (n.owner === 2 ? 'AI' : 'Neutral');
    unitDetailsEl.innerHTML = `<div class="unit-name">⭐ Nexus</div><div>Owner: ${ownerName}. Capture to own the nexus. Owned nexuses deal damage to opponent each end-turn.</div>`;
    return;
  }
  if ((gameState.hearts || []).some(h => h.x === x && h.y === y)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">❤️ Heart</div><div>Player base. Lose it and you lose the game.</div>`; return;
  }
  if ((gameState.spawners || []).some(s => s.x === x && s.y === y)) {
    const sp = (gameState.spawners || []).find(s => s.x === x && s.y === y);
    const who = sp && sp.owner === 1 ? 'Player' : (sp && sp.owner === 2 ? 'AI' : 'Neutral');
    unitDetailsEl.innerHTML = `<div class="unit-name">🏰 Spawner</div><div>${who} spawner — place units adjacent to this tile.</div>`; return;
  }
  if (isForestAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">🌲 Forest</div><div>Provides +2 defense to units standing here.</div>`; return; }
  if (isMountainAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">⛰️ Mountain</div><div>Impassable for most units.</div>`; return; }
  // Bridge must be prior to water
  if (isBridgeAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">🌉 Bridge</div><div>Allows land units to cross this tile.</div>`; return; }
  if (isWaterAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">💧 Water</div><div>Only naval units or bridges allow traversal across water.</div>`; return; }
  if (isWallAt(x, y)) { unitDetailsEl.innerHTML = `<div class="unit-name">🧱 Wall</div><div>Blocks movement and line-of-sight.</div>`; return; }
  clearUnitDetails();
}

// ---- placeUnit (player & AI) ----
function placeUnit(type, x, y, owner) {
  if (!inBounds(x, y)) return false;
  if (unitAt(x, y)) return false;
  const tpl = UNIT_TYPES[type]; if (!tpl) return false;
  // placement constraints
  if (tpl.waterOnly && !isWaterAt(x, y) && !isBridgeAt(x, y)) {
    // allow placement adjacent to water too (less punishing)
    if (!getAdjacentTiles(x, y).some(a => isWaterAt(a.x, a.y))) return false;
  }
  if (!tpl.waterOnly && isWaterAt(x, y) && !isBridgeAt(x, y) && !tpl.canCrossWater) return false;
  if (isMountainAt(x, y) && !tpl.canFly) return false;
  // one-of-each for player
  if (owner === 1 && (gameState.units || []).some(u => u.owner === 1 && u.type === type)) return false;

  const unit = {
    id: Date.now() + Math.random(),
    type, x, y, owner,
    hp: tpl.hp || 0, attack: tpl.attack || 0, range: tpl.range || 0, move: tpl.move || 0,
    symbol: tpl.symbol, actionsLeft: 2
  };
  if (isForestAt(x, y)) unit.defenseBonus = 2;
  gameState.units = gameState.units || []; gameState.units.push(unit);

  // if placed from player shop, deduct energy and remove selection
  if (owner === 1 && gameState.selectedShopUnitType === type) {
    gameState.p1energy = Math.max(0, (gameState.p1energy || 0) - (tpl.cost || 0));
    gameState.selectedShopUnitType = null;
    clearSpawnerHighlights();
  }

  // update nexus owners if needed
  if (typeof updateNexusOwners === 'function') {
    try { updateNexusOwners(gameState); } catch (e) { /* ignore */ }
  }

  updateGrid(); updateUI(); refreshShopUI();
  return true;
}

// ---- keyboard: escape to deselect ----
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' || ev.key === 'Esc') { deselectUnit(); } });

// ---- end-turn flow ----
function endTurn() {
  // clear per-turn temporary flags
  (gameState.units || []).forEach(u => {
    delete u.tempAttack; delete u.rangeBoost; delete u.tempMove;
    if (u.revealed) { u.revealed--; if (u.revealed <= 0) delete u.revealed; }
  });

  // update nexus owners BEFORE applying damage
  if (typeof updateNexusOwners === 'function') {
    try { updateNexusOwners(gameState); } catch (e) { console.error('updateNexusOwners error', e); }
  }

  // apply nexus damage once via module
  if (typeof applyNexusDamage === 'function') {
    try {
      const winner = applyNexusDamage(gameState);
      updateUI(); updateGrid();
      if (winner === 1 || winner === 2) { if (statusEl) statusEl.textContent = `Player ${winner} wins by nexus damage!`; gameState.currentPlayer = 0; return; }
    } catch (e) { console.error('applyNexusDamage error', e); }
  }

  // switch current player
  gameState.currentPlayer = (gameState.currentPlayer === 1) ? 2 : 1;
  gameState.turnNumber = (gameState.turnNumber || 0) + 1;

  // reset actions for units of active player
  (gameState.units || []).forEach(u => { if (u.owner === gameState.currentPlayer) u.actionsLeft = 2; });

  // energy gain
  const bonusGain = (gameState.turnNumber % 3 === 0) ? 1 : 0;
  if (gameState.currentPlayer === 1) gameState.p1energy += 2 + bonusGain; else gameState.p2energy += 2 + bonusGain;

  // clear selection/activity modes
  gameState.selectedUnitId = null; gameState.selectedShopUnitType = null; gameState.builderAction = null;
  clearSpawnerHighlights(); clearHighlights(); clearUnitDetails(); refreshShopUI(); updateUI(); updateGrid();

  // handle AI turn if it's AI's turn
  if (gameState.currentPlayer === 2) {
    if (statusEl) statusEl.textContent = "AI's turn...";
    setTimeout(() => {
      try {
        if (typeof aiTakeTurn === 'function') aiTakeTurn(gameState);
        else {
          // fallback: end AI turn immediately (prevents lock)
          endTurn();
        }
      } catch (e) {
        console.error('AI failed', e); gameState.currentPlayer = 1; updateUI();
      }
    }, 250);
  } else {
    if (statusEl) statusEl.textContent = "Player 1's turn.";
  }
}

// ---- UI update ----
function updateUI() {
  if (p1hpEl) p1hpEl.textContent = `${gameState.p1hp || 0}`;
  if (p2hpEl) p2hpEl.textContent = `${gameState.p2hp || 0}`;
  if (p1energyEl) p1energyEl.textContent = `${gameState.p1energy || 0}`;
  if (p2energyEl) p2energyEl.textContent = `${gameState.p2energy || 0}`;
  refreshShopUI();
}

// ---- spawner highlight helpers ----
function highlightSpawnerAdjForPlayer(player) {
  clearSpawnerHighlights();
  const sp = (gameState.spawners || []).find(s => s.owner === player);
  if (!sp) return;
  const opts = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
  for (const t of opts) { const c = getCell(t.x, t.y); if (c) c.classList.add('spawn-highlight'); }
}
function clearSpawnerHighlights() { document.querySelectorAll('.spawn-highlight').forEach(c => c.classList.remove('spawn-highlight')); }

// ---- initialization & wiring ----
function initGame() {
  // reset state
  gameState.units = []; gameState.walls = []; gameState.bridges = []; gameState.water = []; gameState.forests = []; gameState.mountains = [];
  gameState.p1energy = 5; gameState.p2energy = 5; gameState.p1hp = 20; gameState.p2hp = 20;
  gameState.selectedShopUnitType = null; gameState.selectedUnitId = null; gameState.builderAction = null; gameState.turnNumber = 0; gameState.currentPlayer = 1;

  createGrid();

  // initialize spawners/hearts then nexuses so terrain generator can avoid them
  if (typeof initSpawnersAndHearts === 'function') {
    try { initSpawnersAndHearts(gameState); } catch (e) { console.error('initSpawnersAndHearts error', e); }
  }
  if (typeof initNexuses === 'function') {
    try { initNexuses(gameState); } catch (e) { console.error('initNexuses error', e); }
  }

  // generate terrain (module may exist, but we use a built-in generator if not)
  if (typeof generateTerrain === 'function') {
    try { generateTerrain(gameState); } catch (e) { console.error('generateTerrain error', e); }
  } else {
    // fallback: simple symmetric generator built-in here
    try { defaultGenerateTerrain(); } catch (e) { console.error('defaultGenerateTerrain error', e); }
  }

  buildShopUI(); refreshShopUI(); updateUI(); updateGrid(); clearUnitDetails();

  if (typeof renderSpawnersAndHearts === 'function') renderSpawnersAndHearts(gameState);
  if (typeof renderNexuses === 'function') renderNexuses(gameState);

  // wire buttons
  if (endTurnBtn) { endTurnBtn.removeEventListener('click', endTurn); endTurnBtn.addEventListener('click', endTurn); }
  if (newGameBtn) { newGameBtn.removeEventListener('click', initGame); newGameBtn.addEventListener('click', initGame); }

  if (statusEl) statusEl.textContent = "Player 1's turn — place or move units.";
}

// ---- default symmetric terrain generator (used if no external) ----
function defaultGenerateTerrain() {
  gameState.water = [];
  gameState.forests = [];
  gameState.mountains = [];
  gameState.bridges = [];

  // Reserved positions (hearts, spawners, nexuses)
  const reserved = new Set();
  (gameState.hearts || []).forEach(h => reserved.add(`${h.x},${h.y}`));
  (gameState.spawners || []).forEach(s => reserved.add(`${s.x},${s.y}`));
  (gameState.nexuses || []).forEach(n => reserved.add(`${n.x},${n.y}`));

  const half = Math.floor(BOARD_SIZE / 2);

  // Generate terrain for the LEFT half only
  for (let y = 1; y < BOARD_SIZE - 1; y++) {
    for (let x = 1; x <= half; x++) {
      if (reserved.has(`${x},${y}`)) continue;

      if (Math.random() < 0.15) gameState.water.push({ x, y });
      else if (Math.random() < 0.25) gameState.forests.push({ x, y });
      else if (Math.random() < 0.08) gameState.mountains.push({ x, y });
    }
  }

  // Mirror horizontally into the RIGHT half
  function mirrorX(p) {
    return { x: BOARD_SIZE - 1 - p.x, y: p.y };
  }

  gameState.water.push(...gameState.water.map(mirrorX));
  gameState.forests.push(...gameState.forests.map(mirrorX));
  gameState.mountains.push(...gameState.mountains.map(mirrorX));

  // Deduplicate
  function uniq(arr) {
    const seen = new Set();
    return arr.filter(p => {
      const k = `${p.x},${p.y}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  gameState.water = uniq(gameState.water);
  gameState.forests = uniq(gameState.forests);
  gameState.mountains = uniq(gameState.mountains);
}



// ---- expose helpers for AI / other modules ----
window.placeUnit = placeUnit;
window.unitAt = unitAt;
window.canMoveTo = canMoveTo;
window.canAttack = canAttack;
window.moveUnit = moveUnit;
window.attack = attack;
window.getAdjacentEmptyTiles = getAdjacentEmptyTiles;
window.placeUnitNearSpawner = function (type, owner) {
  try {
    const sp = (gameState.spawners || []).find(s => s.owner === owner);
    if (!sp) return false;
    if (typeof spawnUnitAt === 'function') return spawnUnitAt(type, sp, owner, gameState);
    const opts = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
    if (!opts.length) return false;
    const t = opts[Math.floor(Math.random() * opts.length)];
    return placeUnit(type, t.x, t.y, owner);
  } catch (e) { console.error('placeUnitNearSpawner error', e); return false; }
};
window.updateGrid = updateGrid;
window.updateUI = updateUI;
window.updateNexusesOwnersAndRender = updateNexusesOwnersAndRender;
window.gameState = gameState;

// attach init after DOM ready
document.addEventListener('DOMContentLoaded', initGame);

// Export functions for testing convenience
window.initGame = initGame;
window.endTurn = endTurn;
window.selectUnit = selectUnit;
