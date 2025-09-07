// game.js – Full, self-contained game logic for Nexus
// Exposes window.__nexus_game for debugging and AI integration.

(function () {
  'use strict';

  /* ======================
     Configuration
     ====================== */
  const BOARD_SIZE = 11;
  const ENERGY_PER_TURN = 5;
  const ENERGY_TURNS = 10; // number of times a player gains energy at turn start
  const ENERGY_CAP = 50;
  const ACTIONS_PER_TURN = 2; // Each unit gets 2 actions per turn

  /* ======================
     Helpers & DOM shortnames
     ====================== */
  const byId = (id) => document.getElementById(id);
  const gridEl = byId('grid') || document.querySelector('.grid');
  const shopListEl = byId('shop-list') || byId('shop-groups') || document.querySelector('.shop-list');
  const unitDetailsEl = byId('unit-details') || document.querySelector('.unit-details') || null;
  const p1HpEl = byId('player1-hp') || byId('p1-hp') || null;
  const p2HpEl = byId('player2-hp') || byId('p2-hp') || null;
  const p1EnergyEl = byId('player1-energy') || byId('p1-energy') || null;
  const p2EnergyEl = byId('player2-energy') || byId('p2-energy') || null;
  const endTurnBtn = byId('endTurnBtn') || byId('end-turn') || null;
  const newGameBtn = byId('newGameBtn') || byId('new-game') || null;

  const UNIT_TYPES = window.UNIT_TYPES || window.UNIT_MAP || {};

  /* ======================
     Game State
     ====================== */
  const state = {
    board: [],
    players: {
      1: { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set() },
      2: { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set() }
    },
    currentPlayer: 1,
    turnNumber: 1,
    lastNexusDamageTurn: {}, // key "x,y" -> turnNumber
    selectedUnit: null, // unit object reference
    pendingShopSelection: { 1: null, 2: null }, // chosen unit def for placement
    unitIdCounter: 1
  };

  function uid() { return 'u' + (state.unitIdCounter++).toString(36); }
  function inBounds(x,y) { return x>=0 && y>=0 && x<BOARD_SIZE && y<BOARD_SIZE; }
  function getCell(x,y){ return inBounds(x,y) ? state.board[y][x] : null; }

  /* ======================
     Spawner helpers (use NexusSpawners if present)
     ====================== */
  function canSpawnAtLocal(st, x, y, player) {
    if (!st || !st.board) return false;
    const BOARD = st.board.length;
    const c = st.board[y] && st.board[y][x];
    if (!c || c.unit) return false;
    for (let sy=0; sy<BOARD; sy++){
      for (let sx=0; sx<BOARD; sx++){
        const s = st.board[sy][sx];
        if (s && s.spawner && s.spawner.owner === player) {
          if (Math.abs(sx - x) <= 1 && Math.abs(sy - y) <= 1) return true;
        }
      }
    }
    return false;
  }

  function captureSpawnersLocal(st) {
    if (!st || !st.board) return;
    const B = st.board.length;
    for (let y=0;y<B;y++){
      for (let x=0;x<B;x++){
        const c = st.board[y][x];
        if (c && c.spawner && c.unit) {
          if (c.spawner.owner !== c.unit.owner) {
            c.spawner.owner = c.unit.owner;
          }
        }
      }
    }
  }

  // prefer NexusSpawners if available
  function canSpawnAt(st, x, y, player) {
    if (window.NexusSpawners && typeof window.NexusSpawners.canSpawnAt === 'function') {
      return window.NexusSpawners.canSpawnAt(st, x, y, player);
    }
    return canSpawnAtLocal(st, x, y, player);
  }
  function captureSpawners(st) {
    if (window.NexusSpawners && typeof window.NexusSpawners.captureSpawners === 'function') {
      return window.NexusSpawners.captureSpawners(st);
    }
    return captureSpawnersLocal(st);
  }

  /* ======================
     Board generation + markers
     ====================== */
  function createEmptyBoard() {
    state.board = [];
    for (let y=0;y<BOARD_SIZE;y++){
      const row = [];
      for (let x=0;x<BOARD_SIZE;x++){
        row.push({ x, y, terrain: 'plain', unit: null, nexus: null, spawner: null, heart: null });
      }
      state.board.push(row);
    }
  }

  function randomTerrainType() {
    const r = Math.random();
    if (r < 0.08) return 'water';
    if (r < 0.16) return 'forest';
    if (r < 0.22) return 'mountain';
    return 'plain';
  }

  function generateMirroredMap() {
    createEmptyBoard();
    const mid = Math.floor(BOARD_SIZE/2);
    for (let y=0;y<mid;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        state.board[y][x].terrain = (Math.random() < 0.15) ? randomTerrainType() : 'plain';
      }
    }
    for (let y=0;y<mid;y++){
      const my = BOARD_SIZE - 1 - y;
      for (let x=0;x<BOARD_SIZE;x++){
        const mx = BOARD_SIZE - 1 - x;
        state.board[my][mx].terrain = state.board[y][x].terrain;
      }
    }
    if (BOARD_SIZE % 2 === 1) {
      const y = mid;
      for (let x=0;x<BOARD_SIZE;x++){
        state.board[y][x].terrain = (Math.random() < 0.06) ? randomTerrainType() : 'plain';
      }
    }
  }

  function placeMarkers() {
    // clear markers
    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        const c = getCell(x,y);
        c.nexus = c.spawner = c.heart = null;
      }
    }
    const midX = Math.floor(BOARD_SIZE/2);
    // nexus top and bottom
    state.board[0][midX].nexus = { owner: 2 };
    state.board[BOARD_SIZE-1][midX].nexus = { owner: 1 };
    // spawners: one per player (top and bottom near nexuses)
    state.board[1][midX].spawner = { owner: 2 };       // player 2 spawner near top
    state.board[BOARD_SIZE-2][midX].spawner = { owner: 1 }; // player 1 spawner near bottom
    // hearts (optional) - place symmetric
    state.board[midX][1].heart = { owner: null };
    state.board[midX][BOARD_SIZE-2].heart = { owner: null };
  }

  /* ======================
     Rendering
     ====================== */
  function clearElement(el) { if (!el) return; while (el.firstChild) el.removeChild(el.firstChild); }

  function renderBoard() {
    if (!gridEl) return;
    clearElement(gridEl);
    gridEl.style.gridTemplateColumns = `repeat(${BOARD_SIZE}, ${getComputedStyle(document.documentElement).getPropertyValue('--cell-size') || '40px'})`;

    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        const cell = getCell(x,y);
        const cellEl = document.createElement('div');
        cellEl.className = 'cell';
        if (cell.terrain) cellEl.classList.add(cell.terrain);

        // markers
        if (cell.nexus) {
          const m = document.createElement('div');
          m.className = 'marker-full nexus';
          m.textContent = '◆';
          if (cell.nexus.owner === 1) m.classList.add('owner-1');
          else if (cell.nexus.owner === 2) m.classList.add('owner-2');
          cellEl.appendChild(m);
        }
        if (cell.spawner) {
          const m = document.createElement('div');
          m.className = 'marker-full spawner';
          m.textContent = '⛓';
          if (cell.spawner.owner === 1) m.classList.add('owner-1');
          else if (cell.spawner.owner === 2) m.classList.add('owner-2');
          else m.classList.add('neutral');
          cellEl.appendChild(m);
        }
        if (cell.heart) {
          const m = document.createElement('div');
          m.className = 'marker-full heart';
          m.textContent = '♥';
          cellEl.appendChild(m);
        }

        // unit rendering
        if (cell.unit) {
          const u = cell.unit;
          const ue = document.createElement('div');
          ue.className = 'unit-el owner-' + (u.owner || 1);
          ue.textContent = u.symbol || (u.name ? u.name.charAt(0) : '?');

          const hp = document.createElement('div');
          hp.className = 'unit-hp';
          hp.textContent = String(u.hp);
          ue.appendChild(hp);

          const actions = document.createElement('div');
          actions.className = 'unit-actions';
          actions.textContent = String(u.actionsLeft || 0);
          ue.appendChild(actions);

          cellEl.appendChild(ue);
        }

        cellEl.addEventListener('click', (ev) => {
          ev.stopPropagation();
          handleCellClick(x,y);
        });

        gridEl.appendChild(cellEl);
      }
    }
    refreshSelectionVisuals();
  }

  /* ======================
     Shop UI
     ====================== */
  function populateShopForPlayer(playerIndex) {
    if (!shopListEl) return;
    clearElement(shopListEl);

    const buckets = {};
    for (const key in UNIT_TYPES) {
      const def = UNIT_TYPES[key];
      if (!def || typeof def.cost === 'undefined') continue;
      if (def.cost <= 0) continue;
      if (state.players[playerIndex].purchased.has(def.id || key || def.name)) continue;

      const cost = Number(def.cost || 0);
      if (!buckets[cost]) buckets[cost] = [];
      buckets[cost].push({ key, def });
    }
    const costs = Object.keys(buckets).map(n=>+n).sort((a,b)=>a-b);

    costs.forEach(cost => {
      const section = document.createElement('div');
      section.className = 'shop-section';

      const header = document.createElement('div');
      header.className = 'shop-header';
      header.innerHTML = `<span>Cost ${cost}</span><span class="chev">▾</span>`;

      const items = document.createElement('div');
      items.className = 'shop-items';
      items.style.display = 'none';

      header.addEventListener('click', () => {
        document.querySelectorAll('.shop-section').forEach(s => {
          if (s !== section) s.classList.remove('open');
          const si = s.querySelector('.shop-items'); if (si) si.style.display = 'none';
        });
        const isOpen = section.classList.toggle('open');
        items.style.display = isOpen ? 'block' : 'none';
      });

      buckets[cost].forEach(({key, def}) => {
        const item = document.createElement('div');
        item.className = 'shop-item';
        item.dataset.defKey = key;
        const left = document.createElement('div'); left.className = 'shop-left';
        left.innerHTML = `<strong>${def.symbol ? def.symbol+' ' : ''}${def.name || key}</strong><div class="shop-desc">${def.description||''}</div>`;
        const right = document.createElement('div'); right.className = 'shop-right';
        right.textContent = String(def.cost || cost);

        item.appendChild(left); item.appendChild(right);

        item.addEventListener('click', () => {
          state.pendingShopSelection[state.currentPlayer] = { key, def };
          document.querySelectorAll('.shop-item').forEach(si => si.classList.remove('selected'));
          item.classList.add('selected');
          showUnitDetailsForDef(def);
          // Update spawn highlights via UI (if UI code listens to state.pendingShopSelection)
        });

        items.appendChild(item);
      });

      section.appendChild(header);
      section.appendChild(items);
      shopListEl.appendChild(section);
    });
  }

  /* ======================
     Unit / Cell Info Panel
     ====================== */
  function showUnitDetailsForDef(def) {
    if (!unitDetailsEl) return;
    unitDetailsEl.classList.remove('empty');
    unitDetailsEl.innerHTML = `
      <div class="unit-symbol">${def.symbol||''}</div>
      <div class="unit-name">${def.name||'Unknown'}</div>
      <div class="unit-description">${def.description||''}</div>
      <div class="unit-stat"><span class="unit-stat-label">Cost</span><span>${def.cost||0}</span></div>
      ${def.hp ? `<div class="unit-stat"><span class="unit-stat-label">HP</span><span>${def.hp}</span></div>` : ''}
      ${def.attack || def.atk ? `<div class="unit-stat"><span class="unit-stat-label">ATK</span><span>${def.attack || def.atk}</span></div>` : ''}
      ${def.range ? `<div class="unit-stat"><span class="unit-stat-label">RNG</span><span>${def.range}</span></div>` : ''}
      ${def.move ? `<div class="unit-stat"><span class="unit-stat-label">MOVE</span><span>${def.move}</span></div>` : ''}
      <div class="unit-abilities">${(def.abilities||[]).slice(0,2).map(a=>`<button class="unit-ability-btn" data-ability="${(a.name||'').replace(/"/g,'')}" disabled>${a.name}</button>`).join('')}</div>
    `;
  }

  function showUnitDetailsForInstance(unit) {
    if (!unitDetailsEl) return;
    const def = UNIT_TYPES[unit.defId] || {};
    unitDetailsEl.classList.remove('empty');
    unitDetailsEl.innerHTML = `
      <div class="unit-symbol">${def.symbol||unit.symbol||''}</div>
      <div class="unit-name">${def.name||unit.name||'Unit'}</div>
      <div class="unit-description">${def.description||''}</div>
      <div class="unit-stat"><span class="unit-stat-label">HP</span><span>${unit.hp}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">ATK</span><span>${unit.attack||def.attack||def.atk||0}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">RNG</span><span>${unit.range||def.range||1}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">MOVE</span><span>${unit.move||def.move||1}</span></div>
      <div class="unit-stat"><span class="unit-stat-label">ACTIONS</span><span>${unit.actionsLeft||0}/${ACTIONS_PER_TURN}</span></div>
      <div class="unit-abilities">${(def.abilities||[]).slice(0,2).map((a,idx)=>`<button class="unit-ability-btn" data-ability-index="${idx}">${a.name}</button>`).join('')}</div>
    `;
    const btns = unitDetailsEl.querySelectorAll('.unit-ability-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = btn.dataset.abilityIndex;
        const ability = (def.abilities||[])[idx];
        if (ability && typeof ability.action === 'function' && unit.actionsLeft > 0) {
          const result = ability.action(unit, getPublicState());
          if (result && result.msg) console.info('Ability result:', result.msg);
          unit.actionsLeft = Math.max(0, (unit.actionsLeft||0)-1);
          updateUI();
        }
      });
    });
  }

  function showCellInfo(x,y) {
    const cell = getCell(x,y);
    if (!cell) return;
    if (cell.unit) {
      showUnitDetailsForInstance(cell.unit);
      return;
    }
    if (cell.nexus) {
      unitDetailsEl && (unitDetailsEl.innerHTML = `<div class="unit-name">Nexus</div><div class="unit-description">Nexus owned by ${cell.nexus.owner||'None'}. Captured nexuses deal damage each turn.</div>`);
      return;
    }
    if (cell.spawner) {
      const ownerText = cell.spawner.owner ? `Player ${cell.spawner.owner}` : 'Neutral';
      unitDetailsEl && (unitDetailsEl.innerHTML = `<div class="unit-name">Spawner (${ownerText})</div><div class="unit-description">Spawner tile. Place reinforcements adjacent to spawners you own.</div>`);
      return;
    }
    if (cell.heart) {
      unitDetailsEl && (unitDetailsEl.innerHTML = `<div class="unit-name">Heart</div><div class="unit-description">Heart tile. Grants bonus when captured.</div>`);
      return;
    }
    unitDetailsEl && (unitDetailsEl.innerHTML = `<div class="unit-name">${cell.terrain||'Plain'}</div><div class="unit-description">Terrain: ${cell.terrain||'plain'}.</div>`);
  }

  /* ======================
     Movement / Attack helpers
     ====================== */
  function computeReachable(unit) {
    const set = new Set();
    if (!unit) return set;
    const maxSteps = unit.move || (UNIT_TYPES[unit.defId] && UNIT_TYPES[unit.defId].move) || 1;
    const visited = new Set();
    const q = [{ x: unit.x, y: unit.y, d: 0 }];
    visited.add(`${unit.x},${unit.y}`);
    set.add(`${unit.x},${unit.y}`);
    while (q.length) {
      const cur = q.shift();
      if (cur.d >= maxSteps) continue;
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [dx,dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (!inBounds(nx,ny)) continue;
        if (visited.has(`${nx},${ny}`)) continue;
        const cell = getCell(nx,ny);
        if (cell.unit) continue;
        const def = UNIT_TYPES[unit.defId] || {};
        if (cell.terrain === 'mountain' && !def.canClimbMountain) continue;
        if (cell.terrain === 'water' && !def.canCrossWater && !def.waterOnly) continue;
        visited.add(`${nx},${ny}`);
        set.add(`${nx},${ny}`);
        q.push({ x:nx, y:ny, d: cur.d + 1 });
      }
    }
    return set;
  }

  function canAttack(unit, tx, ty) {
    if (!unit) return false;
    const def = UNIT_TYPES[unit.defId] || {};
    const range = unit.range || def.range || 1;
    const dist = Math.abs(unit.x - tx) + Math.abs(unit.y - ty);
    return dist <= range;
  }

  /* ======================
     Actions: place, move, attack
     ====================== */

  function placeUnitFromShopAt(x,y) {
    const pick = state.pendingShopSelection[state.currentPlayer];
    if (!pick) return false;
    const def = pick.def;
    if (!inBounds(x,y)) return false;
    const cell = getCell(x,y);
    if (cell.unit) return false;

    // Require adjacency to a spawner owned by current player
    if (!canSpawnAt(state, x, y, state.currentPlayer)) return false;

    // terrain rules
    if (def.waterOnly) {
      if (cell.terrain !== 'water' && cell.terrain !== 'bridge') return false;
    } else {
      if (cell.terrain === 'mountain' && !def.canClimbMountain) return false;
      if (cell.terrain === 'water' && !def.canCrossWater && !def.waterOnly) return false;
    }
    const cost = Number(def.cost || 0);
    if (state.players[state.currentPlayer].energy < cost) return false;

    state.players[state.currentPlayer].energy -= cost;
    const unit = {
      id: uid(),
      defId: def.id || def.name || pick.key,
      name: def.name || pick.key,
      symbol: def.symbol || '?',
      hp: def.hp || def.health || 1,
      attack: def.attack || def.atk || 1,
      range: def.range || 1,
      move: def.move || 1,
      owner: state.currentPlayer,
      x, y,
      actionsLeft: ACTIONS_PER_TURN
    };
    cell.unit = unit;
    state.pendingShopSelection[state.currentPlayer] = null;
    state.players[state.currentPlayer].purchased.add(def.id || def.name || pick.key);
    populateShopForPlayer(state.currentPlayer);
    updateUI();
    return true;
  }

  function moveUnitTo(unit, tx, ty) {
    if (!unit) return false;
    if (unit.owner !== state.currentPlayer) return false;
    if ((unit.actionsLeft || 0) <= 0) return false;
    if (!inBounds(tx,ty)) return false;
    const src = getCell(unit.x, unit.y);
    const dst = getCell(tx, ty);
    if (!dst || dst.unit) return false;
    const reachable = computeReachable(unit);
    if (!reachable.has(`${tx},${ty}`)) return false;
    src.unit = null;
    unit.x = tx; unit.y = ty;
    dst.unit = unit;
    unit.actionsLeft = Math.max(0, (unit.actionsLeft||0) - 1);
    updateUI();
    return true;
  }

  function attackAt(attacker, tx, ty) {
    if (!attacker) return false;
    if (attacker.owner !== state.currentPlayer) return false;
    if ((attacker.actionsLeft || 0) <= 0) return false;
    if (!inBounds(tx,ty)) return false;
    const targetCell = getCell(tx,ty);
    if (!targetCell || !targetCell.unit) return false;
    const target = targetCell.unit;
    if (target.owner === attacker.owner) return false;
    if (!canAttack(attacker, tx, ty)) return false;

    const atk = attacker.attack || 1;
    target.hp -= atk;
    attacker.actionsLeft = Math.max(0, (attacker.actionsLeft||0) - 1);

    const idx = ty * BOARD_SIZE + tx;
    if (gridEl && gridEl.children[idx]) {
      const cellEl = gridEl.children[idx];
      const unitEl = cellEl.querySelector('.unit-el');
      if (unitEl) {
        unitEl.classList.add('attack-flash');
        setTimeout(()=> unitEl.classList.remove('attack-flash'), 350);
      }
    }

    if (target.hp <= 0) {
      targetCell.unit = null;
    }
    updateUI();
    return true;
  }

  /* ======================
     Click handling logic
     ====================== */
  function deselectUnit() {
    state.selectedUnit = null;
    refreshSelectionVisuals();
    if (unitDetailsEl) unitDetailsEl.innerHTML = '<div class="empty">Select a unit or terrain</div>';
  }

  function handleCellClick(x,y) {
    const cell = getCell(x,y);
    if (state.pendingShopSelection[state.currentPlayer]) {
      const placed = placeUnitFromShopAt(x,y);
      if (!placed) {
        showCellInfo(x,y);
      } else {
        // after placing, allow UI to refresh highlights
        if (window.__nexus_ui && typeof window.__nexus_ui.refreshSpawnHighlightsIfPending === 'function') {
          window.__nexus_ui.refreshSpawnHighlightsIfPending();
        }
      }
      return;
    }

    if (cell.unit) {
      if (cell.unit.owner === state.currentPlayer) {
        if (state.selectedUnit && state.selectedUnit.id !== cell.unit.id) {
          state.selectedUnit = cell.unit;
          showUnitDetailsForInstance(cell.unit);
        } else {
          if (state.selectedUnit && state.selectedUnit.id === cell.unit.id) {
            deselectUnit();
          } else {
            state.selectedUnit = cell.unit;
            showUnitDetailsForInstance(cell.unit);
          }
        }
        updateAttackHighlights();
      } else {
        if (state.selectedUnit && canAttack(state.selectedUnit, x, y) && state.selectedUnit.actionsLeft > 0) {
          attackAt(state.selectedUnit, x, y);
        } else {
          showUnitDetailsForInstance(cell.unit);
        }
      }
      return;
    }

    if (state.selectedUnit) {
      const moved = moveUnitTo(state.selectedUnit, x, y);
      if (!moved) showCellInfo(x,y);
      return;
    }

    showCellInfo(x,y);
  }

  /* ======================
     Turn / Nexus logic
     ====================== */
  function applyNexusCaptureAndDamage() {
    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        const c = getCell(x,y);
        if (c.nexus && c.unit) {
          c.nexus.owner = c.unit.owner;
        }
      }
    }

    // nexus damage once per nexus per turn
    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        const c = getCell(x,y);
        if (c.nexus && c.nexus.owner) {
          const owner = c.nexus.owner;
          const opponent = owner === 1 ? 2 : 1;
          const key = `${x},${y}`;
          if (!state.lastNexusDamageTurn[key] || state.lastNexusDamageTurn[key] < state.turnNumber) {
            state.players[opponent].hp = Math.max(0, state.players[opponent].hp - 1);
            state.lastNexusDamageTurn[key] = state.turnNumber;
          }
        }
      }
    }
  }

  function endTurn() {
    applyNexusCaptureAndDamage();

    // capture spawners
    captureSpawners(state);

    state.turnNumber++;
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;

    const p = state.players[state.currentPlayer];
    if (p.energyTurnsUsed < ENERGY_TURNS) {
      p.energy = Math.min(ENERGY_CAP, (p.energy || 0) + ENERGY_PER_TURN);
      p.energyTurnsUsed = (p.energyTurnsUsed || 0) + 1;
    }

    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        const u = getCell(x,y).unit;
        if (u && u.owner === state.currentPlayer) {
          u.actionsLeft = ACTIONS_PER_TURN;
        }
      }
    }

    state.selectedUnit = null;
    updateUI();

    if (state.currentPlayer === 2 && typeof window.aiTakeTurn === 'function') {
      setTimeout(()=> {
        try {
          window.aiTakeTurn(getPublicState());
        } catch (e) { console.error('AI error', e); }
        updateUI();
      }, 200);
    }
  }

  /* ======================
     UI helpers: highlights & visuals
     ====================== */
  function refreshSelectionVisuals() {
    if (!gridEl) return;
    gridEl.querySelectorAll('.highlight-overlay').forEach(n => n.remove());
    gridEl.querySelectorAll('.unit-el.selected').forEach(el => el.classList.remove('selected'));
    if (state.selectedUnit) {
      const reachable = computeReachable(state.selectedUnit);
      for (let y=0;y<BOARD_SIZE;y++){
        for (let x=0;x<BOARD_SIZE;x++){
          const key = `${x},${y}`;
          if (reachable.has(key)) {
            const idx = y*BOARD_SIZE + x;
            const cellEl = gridEl.children[idx];
            if (cellEl) {
              const overlay = document.createElement('div');
              overlay.className = 'highlight-overlay highlight-move';
              cellEl.appendChild(overlay);
            }
          }
        }
      }
      for (let y=0;y<BOARD_SIZE;y++){
        for (let x=0;x<BOARD_SIZE;x++){
          const c = getCell(x,y);
          if (c.unit && state.selectedUnit && c.unit.id === state.selectedUnit.id) {
            const idx = y*BOARD_SIZE + x;
            const cellEl = gridEl.children[idx];
            if (cellEl) {
              const ue = cellEl.querySelector('.unit-el');
              if (ue) ue.classList.add('selected');
            }
          }
        }
      }
    }
    updateAttackHighlights();
  }

  function updateAttackHighlights() {
    if (!gridEl) return;
    gridEl.querySelectorAll('.unit-el.attackable-target').forEach(n => n.classList.remove('attackable-target'));
    if (!state.selectedUnit) return;
    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        const c = getCell(x,y);
        if (c.unit && c.unit.owner !== state.selectedUnit.owner) {
          if (canAttack(state.selectedUnit, x, y)) {
            const idx = y*BOARD_SIZE + x;
            const cellEl = gridEl.children[idx];
            if (cellEl) {
              const ue = cellEl.querySelector('.unit-el');
              if (ue) ue.classList.add('attackable-target');
            }
          }
        }
      }
    }
  }

  /* ======================
     UI: populate/hud update
     ====================== */
  function populateShopAll() {
    populateShopForPlayer(state.currentPlayer);
  }

  function updateHUD() {
    if (p1HpEl) p1HpEl.textContent = String(state.players[1].hp);
    if (p2HpEl) p2HpEl.textContent = String(state.players[2].hp);
    if (p1EnergyEl) p1EnergyEl.textContent = String(state.players[1].energy || 0);
    if (p2EnergyEl) p2EnergyEl.textContent = String(state.players[2].energy || 0);
  }

  function updateUI() {
    renderBoard();
    updateHUD();
    populateShopAll();
    // inform UI module to refresh spawn highlights if needed
    if (window.__nexus_ui && typeof window.__nexus_ui.refreshSpawnHighlightsIfPending === 'function') {
      window.__nexus_ui.refreshSpawnHighlightsIfPending();
    }
  }

  /* ======================
     Utilities: expose public state to AI / abilities
     ====================== */
  function getPublicState() {
    return {
      board: state.board.map(row => row.map(c => ({
        x:c.x,y:c.y, terrain:c.terrain, nexus:c.nexus?{...c.nexus}:null, spawner: c.spawner?{...c.spawner}:null, heart: c.heart?{...c.heart}:null,
        unit: c.unit ? {...c.unit} : null
      }))),
      players: JSON.parse(JSON.stringify({1: state.players[1], 2: state.players[2]})),
      currentPlayer: state.currentPlayer,
      turnNumber: state.turnNumber
    };
  }

  /* ======================
     Public API for AI and external access
     ====================== */
  function placeUnit(defId, x, y, owner) {
    if (!inBounds(x, y)) return false;
    const cell = getCell(x, y);
    if (cell.unit) return false;
    const def = UNIT_TYPES[defId] || {};
    if (!def.cost && def.cost !== 0) return false;
    if (!canSpawnAt(state, x, y, owner || state.currentPlayer)) return false;
    if (def.waterOnly) {
      if (cell.terrain !== 'water' && cell.terrain !== 'bridge') return false;
    } else {
      if (cell.terrain === 'mountain' && !def.canClimbMountain) return false;
      if (cell.terrain === 'water' && !def.canCrossWater && !def.waterOnly) return false;
    }
    const unit = {
      id: uid(),
      defId: defId,
      name: def.name || defId,
      symbol: def.symbol || '?',
      hp: def.hp || def.health || 1,
      attack: def.attack || def.atk || 1,
      range: def.range || 1,
      move: def.move || 1,
      owner: owner || state.currentPlayer,
      x, y,
      actionsLeft: ACTIONS_PER_TURN
    };
    cell.unit = unit;
    return true;
  }

  function moveUnit(unit, x, y) { return moveUnitTo(unit, x, y); }
  function attackUnit(attacker, x, y) { return attackAt(attacker, x, y); }
  function getState() { return getPublicState(); }

  /* ======================
     Initialization & controls
     ====================== */
  function resetGame() {
    state.unitIdCounter = 1;
    state.selectedUnit = null;
    state.pendingShopSelection = {1: null, 2: null};
    state.players[1] = { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set() };
    state.players[2] = { hp: 20, energy: 10, energyTurnsUsed: 0, purchased: new Set() };
    state.currentPlayer = 1;
    state.turnNumber = 1;
    state.lastNexusDamageTurn = {};
    generateMirroredMap();
    placeMarkers();
    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++) getCell(x,y).unit = null;
    }
    updateUI();
  }

  if (endTurnBtn) endTurnBtn.addEventListener('click', () => endTurn());
  if (newGameBtn) newGameBtn.addEventListener('click', () => resetGame());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') deselectUnit(); });

  // init
  resetGame();

  window.__nexus_game = window.__nexus_game || {};
  Object.assign(window.__nexus_game, {
    state,
    getState,
    getPublicState,
    placeUnit,
    placeUnitFromShopAt,
    moveUnit,
    moveUnitTo,
    attackUnit,
    attackAt,
    endTurn,
    resetGame,
    populateShopForPlayer,
    updateUI
  });

  console.info('game.js initialized. window.__nexus_game available.');
})();
