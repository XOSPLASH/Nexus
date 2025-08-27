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
  builderAction: null, // 'build', 'break', or 'bridge'
  turnNumber: 0
};

/* ---- Grid creation & helpers ---- */
function createGrid() {
  gridEl.innerHTML = '';
  gridCells = [];
  for (let y = 0; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.x = x;
      cell.dataset.y = y;
      cell.addEventListener('click', () => onCellClick(x, y));
      gridEl.appendChild(cell);
      gridCells.push(cell);
    }
  }
  gameState.gridCells = gridCells;
}

function getCell(x, y) {
  return gridCells.find(c => +c.dataset.x === x && +c.dataset.y === y);
}

function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < BOARD_SIZE && y < BOARD_SIZE;
}

/* ---- Terrain helpers ---- */
function isWaterAt(x, y, gs) {
  gs = gs || gameState;
  return gs.water && gs.water.some(w => w.x === x && w.y === y);
}

function isBridgeAt(x, y, gs) {
  gs = gs || gameState;
  return gs.bridges && gs.bridges.some(b => b.x === x && b.y === y);
}

function isForestAt(x, y, gs) {
  gs = gs || gameState;
  return gs.forests && gs.forests.some(f => f.x === x && f.y === y);
}

function isMountainAt(x, y, gs) {
  gs = gs || gameState;
  return gs.mountains && gs.mountains.some(m => m.x === x && m.y === y);
}

/* ---- Generate terrain (keeps previous style) ---- */
function generateTerrain() {
  // Generate random terrain features
  gameState.water = [];
  gameState.forests = [];
  gameState.mountains = [];

  // Create a river running through the map
  const riverY = 5; // Middle of the map
  for (let x = 0; x < BOARD_SIZE; x++) {
    // Don't put water on spawn/heart locations
    if (Math.random() < 0.7 && x !== 0 && x !== BOARD_SIZE - 1) {
      gameState.water.push({ x, y: riverY });
      if (Math.random() < 0.3 && riverY > 1 && riverY < BOARD_SIZE - 2) {
        gameState.water.push({ x, y: riverY + (Math.random() < 0.5 ? 1 : -1) });
      }
    }
  }

  // Add some forests (provide cover, +1 defense)
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);
    if (!isWaterAt(x, y) && !isNexus(x, y, gameState) &&
        !(y === 0 || y === BOARD_SIZE - 1)) {
      gameState.forests.push({ x, y });
    }
  }

  // Add some mountains (impassable except for flying units)
  for (let i = 0; i < 4; i++) {
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);
    if (!isWaterAt(x, y) && !isForestAt(x, y) && !isNexus(x, y, gameState) &&
        !(y === 0 || y === BOARD_SIZE - 1 || y === 1 || y === BOARD_SIZE - 2)) {
      gameState.mountains.push({ x, y });
    }
  }
}

/* ---- Unit / Terrain details ---- */
function showTerrainDetails(x, y) {
  unitDetailsEl.className = '';

  if (isNexus(x, y, gameState)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">⭐ Nexus</div><div>Capture to deal damage to the enemy each turn. Occupying a nexus sets its owner.</div>`;
    return;
  }
  if (gameState.hearts && gameState.hearts.some(h => h.x === x && h.y === y)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">❤️ Heart</div><div>Your base. If destroyed, you lose the game.</div>`;
    return;
  }
  if (gameState.spawners && gameState.spawners.some(s => s.x === x && s.y === y)) {
    const sp = gameState.spawners.find(s => s.x === x && s.y === y);
    const who = sp && sp.owner === 1 ? 'Player' : (sp && sp.owner === 2 ? 'AI' : 'Neutral');
    unitDetailsEl.innerHTML = `<div class="unit-name">🏰 Spawner</div><div>${who} spawner — place new units adjacent to this tile.</div>`;
    return;
  }
  if (isForestAt(x, y, gameState)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">🌲 Forest</div><div>Provides +2 defense to units standing here (represented as damage reduction).</div>`;
    return;
  }
  if (isMountainAt(x, y, gameState)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">⛰️ Mountain</div><div>Impassable for most units. Only flying/teleporting units can use or ignore mountains.</div>`;
    return;
  }
  if (isWaterAt(x, y, gameState)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">💧 Water</div><div>Only naval units or bridges allow traversal across water.</div>`;
    return;
  }
  if (isBridgeAt(x, y, gameState)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">🌉 Bridge</div><div>A bridge built by a builder — allows land units to cross this water tile.</div>`;
    return;
  }
  if (isWallAt(x, y)) {
    unitDetailsEl.innerHTML = `<div class="unit-name">🧱 Wall</div><div>Blocks movement and line-of-sight. Builders can build or break walls.</div>`;
    return;
  }

  clearUnitDetails();
}

/* ---- Shop UI ---- */
function buildShopUI() {
  shopListEl.innerHTML = '';

  // Group units by category (categories are defined in units.js)
  const categories = {};
  for (const key of Object.keys(UNIT_TYPES)) {
    const unit = UNIT_TYPES[key];
    const cat = unit.category || 'Other';
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push({ key, unit });
  }

  // Keep category order stable (Basic -> Support -> Advanced -> Naval -> Other)
  const preferredOrder = ['Basic', 'Support', 'Advanced', 'Naval', 'Other'];
  const cats = Object.keys(categories).sort((a, b) => {
    const ai = preferredOrder.indexOf(a) === -1 ? preferredOrder.length : preferredOrder.indexOf(a);
    const bi = preferredOrder.indexOf(b) === -1 ? preferredOrder.length : preferredOrder.indexOf(b);
    return ai - bi;
  });

  for (const cat of cats) {
    const header = document.createElement('div');
    header.textContent = `-- ${cat} --`;
    header.style.fontWeight = 'bold';
    header.style.marginTop = '8px';
    shopListEl.appendChild(header);

    for (const { key, unit } of categories[cat]) {
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
    const cost = UNIT_TYPES[type].cost;
    it.classList.remove('cant-afford', 'removed', 'selected');
    // hide if player already placed this unit (one-of-each)
    if (gameState.units.some(u => u.owner === 1 && u.type === type)) it.classList.add('removed');
    // cant afford
    if (gameState.currentPlayer === 1 && gameState.p1energy < cost) it.classList.add('cant-afford');
    if (gameState.selectedShopUnitType === type) it.classList.add('selected');
  });
}

function onShopItemClick(type) {
  if (gameState.currentPlayer !== 1) { statusEl.textContent = "Not your turn."; return; }
  const cost = UNIT_TYPES[type].cost;
  if (gameState.p1energy < cost) { statusEl.textContent = "Not enough energy."; return; }
  if (gameState.units.some(u => u.owner === 1 && u.type === type)) { statusEl.textContent = "Already placed."; return; }

  gameState.selectedShopUnitType = type;
  // Clear unit selection when placing
  gameState.selectedUnitId = null;
  clearUnitDetails();

  highlightSpawnerAdjForPlayer(1);
  statusEl.textContent = `Placing ${UNIT_TYPES[type].name}. Click an adjacent tile to your spawner to place.`;
  refreshShopUI();
}

/* ---- Spawner highlights (using spawn.js helper) ---- */
function highlightSpawnerAdjForPlayer(player) {
  clearSpawnerHighlights();
  const sp = gameState.spawners.find(s => s.owner === player);
  if (!sp) return;
  const options = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
  for (const t of options) {
    const c = getCell(t.x, t.y);
    if (c) c.classList.add('spawn-highlight');
  }
}

function clearSpawnerHighlights() {
  document.querySelectorAll('.spawn-highlight').forEach(c => c.classList.remove('spawn-highlight'));
}

/* ---- Unit placement / spawn ---- */
function placeUnit(type, x, y, owner) {
  if (!inBounds(x, y)) return false;
  if (unitAt(x, y)) return false;

  const tpl = UNIT_TYPES[type];
  if (!tpl) return false;

  // Check terrain restrictions
  if (tpl.waterOnly && !isWaterAt(x, y)) return false;
  if (!tpl.waterOnly && isWaterAt(x, y) && !isBridgeAt(x, y)) {
    if (!tpl.canCrossWater) return false;
  }
  if (isMountainAt(x, y) && !tpl.canFly) return false;

  // enforce player uniqueness for type
  if (owner === 1 && gameState.units.some(u => u.owner === 1 && u.type === type)) return false;

  const unit = {
    id: Date.now() + Math.random(),
    type,
    x, y,
    owner,
    hp: tpl.hp,
    attack: tpl.attack,
    range: tpl.range,
    move: tpl.move,
    symbol: tpl.symbol,
    actionsLeft: 2,
    // per-turn temp props:
    tempAttack: 0,
    rangeBoost: 0,
    tempMove: 0
  };

  // Apply forest defense bonus
  if (isForestAt(x, y)) {
    unit.defenseBonus = 2;
  }

  gameState.units.push(unit);
  // if placed on nexus, update owners on next update cycle
  updateNexusesOwnersAndRender();
  updateGrid();
  updateUI();
  refreshShopUI();
  return true;
}

/* wrapper called by spawn.js ai spawns */
function placeUnitNearSpawner(type, owner) {
  const sp = gameState.spawners.find(s => s.owner === owner);
  if (!sp) return false;
  const opts = getAdjacentEmptyTiles(sp.x, sp.y, gameState);
  if (!opts.length) return false;
  const tile = opts[Math.floor(Math.random() * opts.length)];
  return placeUnit(type, tile.x, tile.y, owner);
}

/* ---- basic queries ---- */
function unitAt(x, y) {
  return gameState.units.find(u => u.x === x && u.y === y);
}
function isWallAt(x, y) {
  return gameState.walls && gameState.walls.some(w => w.x === x && w.y === y);
}
function isHeartAt(x, y) {
  return gameState.hearts && gameState.hearts.some(h => h.x === x && h.y === y);
}

function getAdjacentTiles(x, y, gs) {
  gs = gs || gameState;
  const tiles = [];
  const dirs = [[0,1], [0,-1], [1,0], [-1,0]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (inBounds(nx, ny)) {
      tiles.push({x: nx, y: ny});
    }
  }
  return tiles;
}

/* ---- movement & combat ---- */
function canMoveTo(unit, x, y) {
  if (!unit || unit.actionsLeft <= 0) return false;
  if (!inBounds(x, y)) return false;
  if (unit.frozen) return false; // Frozen units can't move
  if (unitAt(x, y) || isWallAt(x, y) || isHeartAt(x,y)) return false;

  // Teleporting mages can go anywhere
  if (unit.teleporting) {
    return !unitAt(x, y) && !isWallAt(x, y) && !isHeartAt(x, y) && !isMountainAt(x, y);
  }

  // Check terrain
  const tpl = UNIT_TYPES[unit.type];
  if (tpl.waterOnly && !isWaterAt(x, y)) return false;
  if (!tpl.waterOnly && isWaterAt(x, y) && !isBridgeAt(x, y) && !tpl.canCrossWater) return false;
  if (isMountainAt(x, y) && !tpl.canFly) return false;

  const moveRange = unit.move + (unit.tempMove || 0);
  const dist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
  return dist <= moveRange;
}

function canAttack(unit, x, y) {
  if (!unit || unit.actionsLeft <= 0) return false;
  if (!inBounds(x, y)) return false;
  if (unit.frozen) return false; // Frozen units can't attack

  // heart attack allowed
  if (isHeartAt(x, y)) {
    const hpOwner = gameState.hearts.find(h => h.x === x && h.y === y).owner;
    if (hpOwner === unit.owner) return false;
    const dist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
    const rangeEffective = unit.range + (unit.rangeBoost || 0);
    if (UNIT_TYPES[unit.type].canAttackOverWalls) return dist <= rangeEffective;
    // block if wall in between along straight line
    if (isWallBetween(unit.x, unit.y, x, y)) return false;
    return dist <= rangeEffective;
  }

  const target = unitAt(x, y);
  if (!target || target.owner === unit.owner) return false;
  if (target.invisible && unit.owner !== target.owner) return false; // Can't attack invisible units

  const dist = Math.abs(unit.x - x) + Math.abs(unit.y - y);
  const rangeEffective = unit.range + (unit.rangeBoost || 0);
  if (UNIT_TYPES[unit.type].canAttackOverWalls) return dist <= rangeEffective;
  if (isWallBetween(unit.x, unit.y, x, y)) return false;
  return dist <= rangeEffective;
}

function isWallBetween(x1, y1, x2, y2) {
  if (x1 === x2) {
    for (let y = Math.min(y1, y2) + 1; y < Math.max(y1, y2); y++) if (isWallAt(x1, y)) return true;
  }
  if (y1 === y2) {
    for (let x = Math.min(x1, x2) + 1; x < Math.max(x1, x2); x++) if (isWallAt(x, y1)) return true;
  }
  return false;
}

function moveUnit(unit, x, y) {
  if (!canMoveTo(unit, x, y)) return false;

  // Handle teleporting
  if (unit.teleporting) {
    unit.x = x; unit.y = y;
    unit.teleporting = false;
    unit.actionsLeft--;
    updateGrid();
    updateUI();
    statusEl.textContent = "Teleported!";
    return true;
  }

  // Handle trampling cavalry
  if (unit.trampling) {
    const enemies = gameState.units.filter(u => u.owner !== unit.owner);
    enemies.forEach(e => {
      const dist = Math.abs(e.x - x) + Math.abs(e.y - y);
      if (dist === 1) {
        e.hp -= 3;
      }
    });
    gameState.units = gameState.units.filter(u => u.hp > 0);
    unit.trampling = false;
  }

  // Update defense bonus based on new terrain
  if (isForestAt(x, y)) {
    unit.defenseBonus = 2;
  } else {
    unit.defenseBonus = 0;
  }

  unit.x = x; unit.y = y; unit.actionsLeft--;
  updateNexusesOwnersAndRender();
  updateGrid();
  updateUI();
  clearHighlights();
  if (unit.actionsLeft > 0) {
    highlightMovement(unit);
    statusEl.textContent = `Moved — ${unit.actionsLeft} action(s) left.`;
  } else {
    gameState.selectedUnitId = null;
    clearUnitDetails();
    statusEl.textContent = `Moved — no actions left.`;
  }
  return true;
}

function attack(unit, x, y) {
  if (!canAttack(unit, x, y)) return false;

  // Handle bombardment
  if (unit.bombardReady) {
    const targets = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const tx = x + dx;
        const ty = y + dy;
        if (inBounds(tx, ty)) {
          const target = unitAt(tx, ty);
          if (target && target.owner !== unit.owner) {
            target.hp -= 3;
            targets.push(target);
          }
        }
      }
    }
    gameState.units = gameState.units.filter(u => u.hp > 0);
    unit.bombardReady = false;
    unit.actionsLeft--;
    statusEl.textContent = `Bombardment hit ${targets.length} targets!`;
    updateGrid();
    updateUI();
    return true;
  }

  // Handle demolish mode
  if (unit.demolishMode) {
    // Can demolish walls or deal massive damage
    if (isWallAt(x, y)) {
      gameState.walls = gameState.walls.filter(w => !(w.x === x && w.y === y));
      unit.demolishMode = false;
      unit.actionsLeft--;
      statusEl.textContent = "Wall demolished!";
      updateGrid();
      updateUI();
      return true;
    }
    const target = unitAt(x, y);
    if (target && target.owner !== unit.owner) {
      target.hp -= 15;
      if (target.hp <= 0) {
        gameState.units = gameState.units.filter(u => u.id !== target.id);
        statusEl.textContent = "Target demolished!";
      } else {
        statusEl.textContent = "Dealt 15 demolish damage!";
      }
      unit.demolishMode = false;
      unit.actionsLeft--;
      updateGrid();
      updateUI();
      return true;
    }
  }

  // heart handling
  if (isHeartAt(x, y)) {
    const heartOwner = gameState.hearts.find(h => h.x === x && h.y === y).owner;
    const dmg = unit.attack + (unit.tempAttack || 0);
    gameState[`p${heartOwner}hp`] -= dmg;
    unit.actionsLeft--;
    delete unit.tempAttack;
    updateUI();
    updateGrid();
    clearHighlights();
    statusEl.textContent = `Attacked heart for ${dmg} damage.`;
    return true;
  }

  const target = unitAt(x, y);
  if (!target) return false;

  // Calculate damage
  let dmg = unit.attack + (unit.tempAttack || 0);

  // Handle backstab
  if (unit.backstabReady) {
    dmg *= 2;
    unit.backstabReady = false;
  }

  // Handle headshot
  if (unit.headshotActive && target.hp <= 5) {
    target.hp = 0;
    unit.headshotActive = false;
    statusEl.textContent = "Headshot! Instant kill!";
  } else {
    // Apply defense bonus
    if (target.defenseBonus) {
      dmg = Math.max(1, dmg - target.defenseBonus);
    }

    // Shield blocks first attack
    if (target.shielded) {
      dmg = 0;
      target.shielded = false;
      statusEl.textContent = "Attack blocked by shield!";
    } else {
      target.hp -= dmg;
      statusEl.textContent = `Dealt ${dmg} damage.`;
    }

    // Handle freeze
    if (unit.freezeNext) {
      target.frozen = true;
      unit.freezeNext = false;
      statusEl.textContent += " Enemy frozen!";
    }
  }

  unit.actionsLeft--;
  delete unit.tempAttack;

  if (target.hp <= 0) {
    gameState.units = gameState.units.filter(u => u.id !== target.id);
    if (!unit.headshotActive) statusEl.textContent = `Target destroyed!`;
  }

  updateGrid();
  updateUI();
  clearHighlights();
  if (unit.actionsLeft > 0) {
    highlightMovement(unit);
    showUnitDetails(unit);
  } else {
    gameState.selectedUnitId = null;
    clearUnitDetails();
  }
  return true;
}

/* ---- selection & highlights ---- */
function selectUnit(id) {
  gameState.selectedUnitId = id;
  const unit = gameState.units.find(u => u.id === id);
  if (!unit) return;
  clearHighlights();
  highlightMovement(unit);
  showUnitDetails(unit);
  statusEl.textContent = `${UNIT_TYPES[unit.type].name} selected.`;
}

function deselectUnit(keepDetails = false) {
  gameState.selectedUnitId = null;
  gameState.builderAction = null;
  clearHighlights();
  if (!keepDetails) clearUnitDetails();
  statusEl.textContent = gameState.currentPlayer === 1 ? "Player 1's turn." : "AI's turn.";
}

function highlightMovement(unit) {
  clearHighlights();
  for (let y = 0; y < BOARD_SIZE; y++) for (let x = 0; x < BOARD_SIZE; x++) {
    if (canMoveTo(unit, x, y)) getCell(x, y).classList.add('highlight-move');
    if (canAttack(unit, x, y)) getCell(x, y).classList.add('highlight-attack');
  }
}

function clearHighlights() {
  document.querySelectorAll('.cell').forEach(c => c.classList.remove('highlight-move', 'highlight-attack'));
}

/* ---- unit details display ---- */
function showUnitDetails(unit) {
  if (!unit) return;

  const tpl = UNIT_TYPES[unit.type];
  const currentAttack = unit.attack + (unit.tempAttack || 0);
  const currentRange = unit.range + (unit.rangeBoost || 0);
  const currentMove = unit.move + (unit.tempMove || 0);

  let statusText = '';
  if (unit.frozen) statusText += '<span class="status-frozen">❄️ Frozen</span>';
  if (unit.invisible) statusText += '<span class="status-invisible">👻 Invisible</span>';
  if (unit.shielded) statusText += '<span class="status-shielded">🛡️ Shielded</span>';
  if (unit.defenseBonus) statusText += '<span class="status-defense">🌳 +2 Defense</span>';

  unitDetailsEl.className = '';
  unitDetailsEl.innerHTML = `
    <div class="unit-symbol">${tpl.symbol}</div>
    <div class="unit-name">${tpl.name}</div>
    ${tpl.description ? `<div style="font-size:12px;color:#ddd;margin-bottom:8px">${tpl.description}</div>` : ''}
    <div class="unit-stat">
      <span class="unit-stat-label">HP:</span>
      <span>${unit.hp} / ${tpl.hp}</span>
    </div>
    <div class="unit-stat">
      <span class="unit-stat-label">Attack:</span>
      <span>${currentAttack}${unit.tempAttack ? ` (+${unit.tempAttack})` : ''}</span>
    </div>
    <div class="unit-stat">
      <span class="unit-stat-label">Range:</span>
      <span>${currentRange}${unit.rangeBoost ? ` (+${unit.rangeBoost})` : ''}</span>
    </div>
    <div class="unit-stat">
      <span class="unit-stat-label">Move:</span>
      <span>${currentMove}${unit.tempMove ? ` (+${unit.tempMove})` : ''}</span>
    </div>
    <div class="unit-stat">
      <span class="unit-stat-label">Actions:</span>
      <span>${unit.actionsLeft}</span>
    </div>
    ${statusText ? `<div class="unit-status">${statusText}</div>` : ''}
  `;

  showUnitAbilities(unit);
}

function clearUnitDetails() {
  unitDetailsEl.className = 'empty';
  unitDetailsEl.innerHTML = 'Select a unit to view its details';
  unitAbilitiesEl.innerHTML = '';
}

/* ---- ability UI & execution ---- */
function showUnitAbilities(unit) {
  unitAbilitiesEl.innerHTML = '';
  if (!unit || unit.owner !== gameState.currentPlayer) return;

  const tpl = UNIT_TYPES[unit.type];
  if (!tpl) return;

  // show builder build/break as separate buttons in addition to abilities
  if (tpl.isBuilder) {
    const buildBtn = document.createElement('button');
    buildBtn.className = 'unit-ability-btn builder-btn';
    buildBtn.textContent = '🔨 Build Wall (click tile)';
    buildBtn.addEventListener('click', () => {
      gameState.builderAction = 'build';
      statusEl.textContent = 'Builder: click an adjacent empty tile to build a wall (costs 1 action).';
    });
    unitAbilitiesEl.appendChild(buildBtn);

    const breakBtn = document.createElement('button');
    breakBtn.className = 'unit-ability-btn builder-btn';
    breakBtn.textContent = '💥 Break Wall (click wall)';
    breakBtn.addEventListener('click', () => {
      gameState.builderAction = 'break';
      statusEl.textContent = 'Builder: click an adjacent wall tile to break it (costs 1 action).';
    });
    unitAbilitiesEl.appendChild(breakBtn);
  }

  // Handle special unit modes
  if (unit.healMode) {
    statusEl.textContent = "Click ally within range to heal.";
  }
  if (unit.transportMode) {
    statusEl.textContent = "Click adjacent ally to transport.";
  }

  // generic abilities
  if (tpl.abilities && tpl.abilities.length) {
    tpl.abilities.forEach(ab => {
      const btn = document.createElement('button');
      btn.className = 'unit-ability-btn';
      btn.textContent = ab.name;
      btn.addEventListener('click', () => {
        if (unit.actionsLeft <= 0) { statusEl.textContent = 'No actions left.'; return; }
        const res = ab.action(unit, gameState) || {};
        updateGrid(); updateUI(); clearHighlights();
        if (unit.actionsLeft > 0) {
          highlightMovement(unit);
          showUnitDetails(unit);
        }
        if (res.msg) statusEl.textContent = res.msg;
        else statusEl.textContent = `${ab.name} used.`;
        if (unit.actionsLeft <= 0) {
          gameState.selectedUnitId = null;
          clearUnitDetails();
        }
      });
      unitAbilitiesEl.appendChild(btn);
    });
  }
}

/* ---- update & render grid ---- */
function updateGrid() {
  // Clear previous elements
  document.querySelectorAll('.unit-el').forEach(n => n.remove());
  document.querySelectorAll('.cell').forEach(c => {
    c.classList.remove('wall', 'water', 'bridge', 'forest', 'mountain',
                        'water-n', 'water-s', 'water-e', 'water-w');
    c.textContent = '';
    // reset inline backgrounds for nexus markers (renderNexuses will set as needed)
    c.style.background = '';
  });

  // Draw terrain - water first so connections can be computed visually
  if (gameState.water) {
    for (const w of gameState.water) {
      const c = getCell(w.x, w.y);
      if (c) {
        c.classList.add('water');
        // compute neighbor connections and add classes for directional joins
        if (isWaterAt(w.x, w.y - 1)) c.classList.add('water-n');
        if (isWaterAt(w.x, w.y + 1)) c.classList.add('water-s');
        if (isWaterAt(w.x - 1, w.y)) c.classList.add('water-w');
        if (isWaterAt(w.x + 1, w.y)) c.classList.add('water-e');
        // keep text empty — visuals handled in CSS
      }
    }
  }

  if (gameState.bridges) {
    for (const b of gameState.bridges) {
      const c = getCell(b.x, b.y);
      if (c) {
        c.classList.add('bridge');
        c.textContent = '🌉';
      }
    }
  }

  if (gameState.forests) {
    for (const f of gameState.forests) {
      const c = getCell(f.x, f.y);
      if (c) {
        c.classList.add('forest');
        c.textContent = '🌲';
      }
    }
  }

  if (gameState.mountains) {
    for (const m of gameState.mountains) {
      const c = getCell(m.x, m.y);
      if (c) {
        c.classList.add('mountain');
        c.textContent = '⛰️';
      }
    }
  }

  // draw walls
  if (gameState.walls) {
    for (const w of gameState.walls) {
      const c = getCell(w.x, w.y);
      if (c) {
        c.classList.add('wall');
        c.textContent = '🧱';
      }
    }
  }

  // render spawners/hearts and nexuses (markers are appended by module functions)
  if (typeof renderSpawnersAndHearts === 'function') renderSpawnersAndHearts(gameState);
  if (typeof renderNexuses === 'function') renderNexuses(gameState);

  // append unit elements
  for (const u of gameState.units) {
    const c = getCell(u.x, u.y);
    if (!c) continue;
    if (c.classList.contains('wall')) continue;

    const el = document.createElement('div');
    el.className = `unit-el owner-${u.owner}`;
    if (u.id === gameState.selectedUnitId) {
      el.classList.add('selected');
    }
    if (u.invisible && u.owner === gameState.currentPlayer) {
      el.classList.add('invisible-friendly');
    } else if (u.invisible) {
      continue; // Don't show enemy invisible units
    }

    el.textContent = UNIT_TYPES[u.type].symbol || (u.owner === 1 ? '🔵' : '🔴');
    const hpBadge = document.createElement('div');
    hpBadge.className = 'unit-hp';
    hpBadge.textContent = `${u.hp}`;
    el.appendChild(hpBadge);

    // Show status icons
    if (u.frozen) {
      const frozenIcon = document.createElement('div');
      frozenIcon.className = 'status-icon';
      frozenIcon.textContent = '❄️';
      el.appendChild(frozenIcon);
    }

    // clicking unit toggles selection (clicking selected unit again deselects)
    el.addEventListener('click', (ev) => {
      ev.stopPropagation();
      // toggle selection
      if (gameState.selectedUnitId === u.id) {
        deselectUnit();
        return;
      }
      // select if owner or show enemy details if not
      if (u.owner === gameState.currentPlayer) {
        selectUnit(u.id);
      } else {
        // show enemy's details (without giving action buttons)
        gameState.selectedUnitId = u.id;
        showUnitDetails(u);
      }
    });

    c.appendChild(el);
  }
}

/* update nexus owners and rendering helper */
function updateNexusesOwnersAndRender() {
  if (typeof updateNexusOwners === 'function') updateNexusOwners(gameState);
  if (typeof renderNexuses === 'function') renderNexuses(gameState);
}

/* ---- cell click handler ---- */
function onCellClick(x, y) {
  // Handle special ability modes first
  const sel = gameState.units.find(u => u.id === gameState.selectedUnitId);

  // Heal mode
  if (sel && sel.healMode) {
    const target = unitAt(x, y);
    if (target && target.owner === sel.owner) {
      const dist = Math.abs(sel.x - x) + Math.abs(sel.y - y);
      if (dist <= sel.range) {
        const maxHp = UNIT_TYPES[target.type].hp;
        target.hp = Math.min(target.hp + 5, maxHp);
        sel.healMode = false;
        sel.actionsLeft--;
        statusEl.textContent = "Healed ally +5 HP!";
        updateGrid(); updateUI();
        if (sel.actionsLeft <= 0) {
          gameState.selectedUnitId = null;
          clearUnitDetails();
        } else {
          showUnitDetails(sel);
        }
        return;
      }
    }
    sel.healMode = false;
    statusEl.textContent = "Heal cancelled.";
    showUnitDetails(sel);
    return;
  }

  // Transport mode (naval)
  if (sel && sel.transportMode) {
    const target = unitAt(x, y);
    if (target && target.owner === sel.owner && target.id !== sel.id) {
      const dist = Math.abs(sel.x - x) + Math.abs(sel.y - y);
      if (dist === 1 && !UNIT_TYPES[target.type].waterOnly) {
        sel.carrying = target;
        gameState.units = gameState.units.filter(u => u.id !== target.id);
        sel.transportMode = false;
        statusEl.textContent = `Transporting ${UNIT_TYPES[target.type].name}!`;
        updateGrid(); updateUI();
        return;
      }
    }
    sel.transportMode = false;
    statusEl.textContent = "Transport cancelled.";
    showUnitDetails(sel);
    return;
  }

  // placing from shop flow (player)
  if (gameState.selectedShopUnitType && gameState.currentPlayer === 1) {
    const sp = gameState.spawners.find(s => s.owner === 1);
    if (!sp) {
      statusEl.textContent = 'No spawner found.';
      gameState.selectedShopUnitType = null;
      refreshShopUI();
      return;
    }
    const options = getAdjacentEmptyTiles(sp.x, sp.y, gameState);

    // Special handling for naval units - they need water
    const tpl = UNIT_TYPES[gameState.selectedShopUnitType];
    if (tpl.waterOnly) {
      if (!isWaterAt(x, y)) {
        statusEl.textContent = "Naval units must be placed on water.";
        return;
      }
    }

    if (options.some(t => t.x === x && t.y === y) || (tpl.waterOnly && Math.abs(sp.x - x) <= 1 && Math.abs(sp.y - y) <= 1)) {
      if (placeUnit(gameState.selectedShopUnitType, x, y, 1)) {
        gameState.p1energy -= UNIT_TYPES[gameState.selectedShopUnitType].cost;
      }
      gameState.selectedShopUnitType = null;
      clearSpawnerHighlights();
      refreshShopUI();
      updateGrid(); updateUI();
      return;
    } else {
      gameState.selectedShopUnitType = null;
      clearSpawnerHighlights();
      refreshShopUI();
      statusEl.textContent = 'Placement cancelled.';
      return;
    }
  }

  // builder action flow
  if (gameState.builderAction && gameState.selectedUnitId) {
    const builder = gameState.units.find(u => u.id === gameState.selectedUnitId);
    if (!builder || (builder.type !== 'builder' && gameState.builderAction !== 'bridge')) {
      gameState.builderAction = null;
    } else {
      const dist = Math.abs(builder.x - x) + Math.abs(builder.y - y);
      if (dist !== 1) { statusEl.textContent = 'Must click adjacent tile.'; return; }

      if (gameState.builderAction === 'build') {
        if (unitAt(x, y) || isWallAt(x, y) || isNexus(x,y,gameState) || isHeartAt(x,y) || isWaterAt(x,y)) {
          statusEl.textContent = 'Cannot build here.'; return;
        }
        gameState.walls = gameState.walls || [];
        gameState.walls.push({ x, y });
        builder.actionsLeft = Math.max(0, builder.actionsLeft - 1);
        gameState.builderAction = null;
        statusEl.textContent = 'Wall built.';
        updateGrid(); updateUI(); clearHighlights();
        if (builder.actionsLeft > 0) {
          showUnitDetails(builder);
        } else {
          gameState.selectedUnitId = null;
          clearUnitDetails();
        }
        return;
      } else if (gameState.builderAction === 'break') {
        if (!isWallAt(x, y)) { statusEl.textContent = 'No wall here.'; return; }
        gameState.walls = gameState.walls.filter(w => !(w.x === x && w.y === y));
        builder.actionsLeft = Math.max(0, builder.actionsLeft - 1);
        gameState.builderAction = null;
        statusEl.textContent = 'Wall broken.';
        updateGrid(); updateUI(); clearHighlights();
        if (builder.actionsLeft > 0) {
          showUnitDetails(builder);
        } else {
          gameState.selectedUnitId = null;
          clearUnitDetails();
        }
        return;
      } else if (gameState.builderAction === 'bridge') {
        if (!isWaterAt(x, y)) { statusEl.textContent = 'Can only build bridge on water.'; return; }
        if (isBridgeAt(x, y)) { statusEl.textContent = 'Bridge already exists here.'; return; }
        gameState.bridges = gameState.bridges || [];
        gameState.bridges.push({ x, y });
        builder.actionsLeft = Math.max(0, builder.actionsLeft - 1);
        gameState.builderAction = null;
        statusEl.textContent = 'Bridge built!';
        updateGrid(); updateUI(); clearHighlights();
        if (builder.actionsLeft > 0) {
          showUnitDetails(builder);
        } else {
          gameState.selectedUnitId = null;
          clearUnitDetails();
        }
        return;
      }
    }
  }

  // Check if clicking empty space (deselect unit)
  const clicked = unitAt(x, y);
  if (!clicked && !gameState.selectedShopUnitType) {
    if (sel) {
      if (canMoveTo(sel, x, y)) {
        moveUnit(sel, x, y);
        return;
      }
      if (canAttack(sel, x, y)) {
        attack(sel, x, y);
        return;
      }
    }
    // show terrain if any — keep the details panel populated
    deselectUnit(true); // keep details so showTerrainDetails will display
    showTerrainDetails(x, y);
    return;
  }

  // clicked a unit: select or show details
  if (clicked) {
    // stop any builder/shop placement
    clearSpawnerHighlights();
    gameState.selectedShopUnitType = null;

    // selecting own or enemy unit
    if (clicked.owner === gameState.currentPlayer) {
      // toggle selection: deselect if already selected
      if (gameState.selectedUnitId === clicked.id) {
        deselectUnit();
      } else {
        selectUnit(clicked.id);
      }
    } else {
      // show enemy's details (without giving action buttons)
      showUnitDetails(clicked);
    }
    return;
  }
}

/* ---- end turn, UI updates, initialization ---- */
function endTurn() {
  // apply nexus damage
  const winner = applyNexusDamage ? applyNexusDamage(gameState) : 0;
  if (winner) {
    statusEl.textContent = winner === 1 ? "Player 1 wins!" : "AI wins!";
    // disable further input
    gameState.currentPlayer = 0;
    return;
  }

  // reset per-turn stuff
  gameState.units.forEach(u => {
    u.actionsLeft = 2;
    // cleanup per-turn flags that should not persist — but keep persistent buffs
    delete u.tempAttack;
    u.rangeBoost = u.rangeBoost || 0;
    u.tempMove = u.tempMove || 0;
  });

  // alternate player/AI
  if (gameState.currentPlayer === 1) {
    gameState.currentPlayer = 2;
    statusEl.textContent = "AI's turn.";
    // simple AI call
    if (typeof aiTakeTurn === 'function') {
      setTimeout(() => aiTakeTurn(gameState), 300);
    } else {
      // fallback: immediately switch back
      gameState.currentPlayer = 1;
      statusEl.textContent = "Player 1's turn.";
    }
  } else if (gameState.currentPlayer === 2) {
    gameState.currentPlayer = 1;
    statusEl.textContent = "Player 1's turn.";
  }
  updateUI();
  updateGrid();
  clearHighlights();
  clearSpawnerHighlights();
  gameState.selectedUnitId = null;
  gameState.selectedShopUnitType = null;
}

function updateUI() {
  p1hpEl.textContent = gameState.p1hp;
  p2hpEl.textContent = gameState.p2hp;
  p1energyEl.textContent = gameState.p1energy;
  p2energyEl.textContent = gameState.p2energy;
  refreshShopUI();

  // show status at start of turn
  if (gameState.currentPlayer === 1) {
    statusEl.textContent = "Player 1's turn.";
  } else if (gameState.currentPlayer === 2) {
    statusEl.textContent = "AI's turn.";
  }
}

function newGame() {
  // Reset state and initialize
  gameState.units = [];
  gameState.walls = [];
  gameState.bridges = [];
  gameState.forests = [];
  gameState.water = [];
  gameState.mountains = [];
  gameState.p1hp = 20;
  gameState.p2hp = 20;
  gameState.p1energy = 5;
  gameState.p2energy = 5;
  gameState.currentPlayer = 1;
  gameState.turnNumber = 0;
  gameState.selectedShopUnitType = null;
  gameState.selectedUnitId = null;
  gameState.builderAction = null;

  createGrid();
  generateTerrain();
  if (typeof initSpawnersAndHearts === 'function') initSpawnersAndHearts(gameState);
  if (typeof initNexuses === 'function') initNexuses(gameState);
  buildShopUI();
  updateNexusesOwnersAndRender();
  updateGrid();
  updateUI();
  clearHighlights();
  clearSpawnerHighlights();
  clearUnitDetails();
}

/* ---- helpers used by spawn.js and AI ---- */
function getAdjacentEmptyTiles(x, y, gameStateLocal) {
  const candidates = [
    { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }
  ];
  const out = [];
  for (const t of candidates) {
    if (t.x < 0 || t.y < 0 || t.x >= BOARD_SIZE || t.y >= BOARD_SIZE) continue;
    // skip nexus & hearts & spawners & walls and units
    if (isNexus(t.x, t.y, gameStateLocal)) continue;
    if (gameStateLocal.walls && gameStateLocal.walls.some(w => w.x === t.x && w.y === t.y)) continue;
    if (gameStateLocal.units && gameStateLocal.units.some(u => u.x === t.x && u.y === t.y)) continue;
    // don't spawn on hearts
    if (gameStateLocal.hearts && gameStateLocal.hearts.some(h => h.x === t.x && h.y === t.y)) continue;
    out.push(t);
  }
  return out;
}

/* ---- wire up controls ---- */
endTurnBtn.addEventListener('click', () => {
  endTurn();
});

newGameBtn.addEventListener('click', () => {
  newGame();
});

/* ---- keyboard shortcuts ---- */
// Escape to deselect
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' || ev.key === 'Esc') {
    deselectUnit();
  }
});

/* ---- boot ---- */
window.addEventListener('load', () => {
  newGame();
});
