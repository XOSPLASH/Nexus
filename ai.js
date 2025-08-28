// ai.js - robust AI turn behavior
// Replace the project's ai.js with this full file.
// The AI tries to place units, then acts with each AI unit (attack > build > move).

(function () {
  // Utility: Manhattan distance
  function manhattan(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  // Find all enemy targets (units + hearts) for a given owner
  function gatherEnemyTargets(owner, gs) {
    const enemies = [];
    if (!gs) return enemies;
    for (const u of gs.units || []) {
      if (u.owner !== owner) enemies.push({ kind: 'unit', obj: u, x: u.x, y: u.y, hp: u.hp });
    }
    for (const h of gs.hearts || []) {
      if (h.owner !== owner) enemies.push({ kind: 'heart', obj: h, x: h.x, y: h.y, hp: 9999 });
    }
    return enemies;
  }

  // Choose a best target for unit: nearest, tie-break by lowest HP
  function chooseTargetFor(unit, gs) {
    const enemies = gatherEnemyTargets(unit.owner, gs);
    if (!enemies.length) return null;
    enemies.sort((a, b) => {
      const da = manhattan(unit, a);
      const db = manhattan(unit, b);
      if (da !== db) return da - db;
      return (a.hp || 9999) - (b.hp || 9999);
    });
    return enemies[0];
  }

  // Try to place units for AI (owner 2). Strategy: try the priciest first (so AI uses its energy effectively)
  function aiBuyAndPlace(gs) {
    if (!gs || !window.UNIT_TYPES) return;
    const types = Object.keys(UNIT_TYPES);
    // sort by descending cost
    types.sort((a, b) => (UNIT_TYPES[b].cost || 0) - (UNIT_TYPES[a].cost || 0));

    // find AI spawner
    const sp = (gs.spawners || []).find(s => s.owner === 2);
    if (!sp) return;

    // Try to buy/place while AI has energy, but avoid infinite loops
    let safety = 0;
    while (safety < 8) {
      safety++;
      let placed = false;
      for (const type of types) {
        const tpl = UNIT_TYPES[type];
        if (!tpl) continue;
        const cost = tpl.cost || 0;
        if ((gs.p2energy || 0) < cost) continue;
        // prevent multiple copies of unique units if desired (keeps parity with shop removed-once behavior)
        if (gs.units && gs.units.some(u => u.owner === 2 && u.type === type)) continue;
        // Try to use helper placeUnitNearSpawner if present
        let success = false;
        if (typeof placeUnitNearSpawner === 'function') {
          try { success = placeUnitNearSpawner(type, 2); } catch (e) { success = false; }
        } else if (typeof placeUnit === 'function') {
          // fallback: attempt to find adjacent tile and place
          const opts = (typeof getAdjacentEmptyTiles === 'function') ? getAdjacentEmptyTiles(sp.x, sp.y, gs) : [];
          if (opts && opts.length) {
            const t = opts[Math.floor(Math.random() * opts.length)];
            try { success = placeUnit(type, t.x, t.y, 2); } catch (e) { success = false; }
          }
        }
        if (success) {
          gs.p2energy = Math.max(0, (gs.p2energy || 0) - cost);
          placed = true;
          break;
        }
      }
      if (!placed) break;
    }
  }

  // Determine reachable set for a unit (uses computeReachable if available)
  function getReachableSet(unit) {
    if (!unit) return new Set();
    if (typeof computeReachable === 'function') {
      try {
        const s = computeReachable(unit);
        if (s && typeof s.has === 'function') return s;
      } catch (e) { /* ignore */ }
    }
    return new Set();
  }

  // Choose a tile (x,y) from reachable set that minimizes distance to target
  function chooseBestMoveTile(unit, reachableSet, target) {
    if (!reachableSet || !target) return null;
    let best = null; let bestDist = Infinity;
    for (const key of reachableSet) {
      const [sx, sy] = key.split(',').map(n => +n);
      if (Number.isNaN(sx) || Number.isNaN(sy)) continue;
      // skip if tile occupied by a unit (safety)
      if (typeof unitAt === 'function' && unitAt(sx, sy)) continue;
      // skip hearts or walls
      if (typeof isHeartAt === 'function' && isHeartAt(sx, sy, window.gameState || null)) continue;
      if (typeof isWallAt === 'function' && isWallAt(sx, sy, window.gameState || null)) continue;
      const dist = Math.abs(sx - target.x) + Math.abs(sy - target.y);
      if (dist < bestDist) { best = { x: sx, y: sy }; bestDist = dist; }
    }
    return best;
  }

  // Try to move unit toward target (single move). Uses moveUnit/canMoveTo if available.
  function aiMoveTowards(unit, target, gs) {
    if (!unit || !target) return false;
    // If unit already adjacent and cannot attack, do nothing
    const curDist = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);
    // if unit can directly attack target, prefer not to move
    if (typeof canAttack === 'function' && canAttack(unit, target.x, target.y)) return false;

    const reachableSet = getReachableSet(unit);
    if (reachableSet && reachableSet.size > 0) {
      const best = chooseBestMoveTile(unit, reachableSet, target);
      if (best) {
        if (typeof moveUnit === 'function') {
          try { return moveUnit(unit, best.x, best.y); } catch (e) { return false; }
        }
      }
    }

    // fallback: try greedy single-step toward target using canMoveTo/moveUnit
    const candidates = [
      { x: unit.x + 1, y: unit.y },
      { x: unit.x - 1, y: unit.y },
      { x: unit.x, y: unit.y + 1 },
      { x: unit.x, y: unit.y - 1 }
    ];
    candidates.sort((a, b) => (Math.abs(a.x - target.x) + Math.abs(a.y - target.y)) - (Math.abs(b.x - target.x) + Math.abs(b.y - target.y)));
    for (const c of candidates) {
      if (!inBounds(c.x, c.y)) continue;
      if (typeof canMoveTo === 'function' && !canMoveTo(unit, c.x, c.y)) continue;
      try {
        if (typeof moveUnit === 'function') { if (moveUnit(unit, c.x, c.y)) return true; }
      } catch (e) { /* ignore */ }
    }
    return false;
  }

  // AI action for a unit
  function aiActUnit(unit, gs) {
    if (!unit || unit.owner !== 2) return;
    if (typeof unit.actionsLeft !== 'number') unit.actionsLeft = 2;
    // loop until no actions left or we've attempted reasonable times
    let loopSafety = 0;
    while (unit.actionsLeft > 0 && loopSafety < 4) {
      loopSafety++;
      // 1) Try to attack best target in range
      let attacked = false;
      if (typeof canAttack === 'function') {
        // check all tiles within unit.range (manhattan)
        const range = (unit.range || 0);
        const attackCandidates = [];
        for (let dy = -range; dy <= range; dy++) {
          for (let dx = -range; dx <= range; dx++) {
            const tx = unit.x + dx, ty = unit.y + dy;
            if (!inBounds(tx, ty)) continue;
            const man = Math.abs(dx) + Math.abs(dy);
            if (man > range) continue;
            try {
              if (canAttack(unit, tx, ty)) {
                // prefer units (lowest hp) then hearts
                const targetUnit = (typeof unitAt === 'function') ? unitAt(tx, ty) : null;
                if (targetUnit) attackCandidates.push({ x: tx, y: ty, hp: targetUnit.hp, kind: 'unit' });
                else if (typeof isHeartAt === 'function' && isHeartAt(tx, ty, gs)) attackCandidates.push({ x: tx, y: ty, hp: 9999, kind: 'heart' });
              }
            } catch (e) { /* ignore */ }
          }
        }
        if (attackCandidates.length) {
          attackCandidates.sort((a, b) => a.hp - b.hp);
          const t = attackCandidates[0];
          if (typeof attack === 'function') {
            try { attack(unit, t.x, t.y); attacked = true; }
            catch (e) { attacked = false; }
          }
        }
      }

      if (attacked) continue; // re-evaluate if unit still has actions

      // 2) If builder, try to build a bridge on adjacent water (if no bridge), else build a wall near enemies
      const tpl = (UNIT_TYPES && UNIT_TYPES[unit.type]) || {};
      if (tpl.isBuilder) {
        let didBuild = false;
        // adjacent tiles
        const adj = [{ x: unit.x + 1, y: unit.y }, { x: unit.x - 1, y: unit.y }, { x: unit.x, y: unit.y + 1 }, { x: unit.x, y: unit.y - 1 }];
        for (const a of adj) {
          if (!inBounds(a.x, a.y)) continue;
          if (typeof isWaterAt === 'function' && typeof isBridgeAt === 'function') {
            try {
              if (isWaterAt(a.x, a.y, gs) && !isBridgeAt(a.x, a.y, gs)) {
                gs.bridges = gs.bridges || [];
                gs.bridges.push({ x: a.x, y: a.y });
                unit.actionsLeft = Math.max(0, unit.actionsLeft - 1);
                didBuild = true;
                break;
              }
            } catch (e) { /* ignore */ }
          }
        }
        if (didBuild) { if (typeof updateGrid === 'function') updateGrid(); if (typeof updateUI === 'function') updateUI(); continue; }

        // otherwise attempt to place a wall adjacent to nearest enemy (if adjacent and empty)
        const nearest = chooseTargetFor(unit, gs);
        if (nearest) {
          // try adjacent tile near the enemy that is adjacent to builder
          const nearAdj = [{ x: nearest.x + 1, y: nearest.y }, { x: nearest.x - 1, y: nearest.y }, { x: nearest.x, y: nearest.y + 1 }, { x: nearest.x, y: nearest.y - 1 }];
          for (const t of nearAdj) {
            if (!inBounds(t.x, t.y)) continue;
            if (typeof isWallAt === 'function' && isWallAt(t.x, t.y, gs)) continue;
            if (typeof unitAt === 'function' && unitAt(t.x, t.y)) continue;
            if (typeof isHeartAt === 'function' && isHeartAt(t.x, t.y, gs)) continue;
            // ensure builder can reach tile (must be adjacent)
            if (Math.abs(unit.x - t.x) + Math.abs(unit.y - t.y) !== 1) continue;
            gs.walls = gs.walls || [];
            gs.walls.push({ x: t.x, y: t.y });
            unit.actionsLeft = Math.max(0, unit.actionsLeft - 1);
            if (typeof updateGrid === 'function') updateGrid();
            if (typeof updateUI === 'function') updateUI();
            didBuild = true;
            break;
          }
        }
        if (didBuild) continue;
      }

      // 3) Move toward nearest enemy
      const target = chooseTargetFor(unit, gs);
      const moved = aiMoveTowards(unit, target, gs);
      if (moved) continue;

      // 4) Nothing else to do -> break
      break;
    } // end unit action loop
  }

  // Main AI turn entrypoint
  function aiTakeTurn(gameStateParam) {
    const gs = gameStateParam || (window.gameState || null);
    if (!gs) return;
    // Ensure we only act during AI's turn
    if (gs.currentPlayer !== 2) return;

    try {
      // 1) Buy / place
      aiBuyAndPlace(gs);

      // 2) Act with each AI unit (use a copy of units list for iteration)
      const aiUnits = (gs.units || []).filter(u => u.owner === 2).slice();
      for (const u of aiUnits) {
        // find actual live reference (units may die)
        const live = (gs.units || []).find(x => x.id === u.id);
        if (!live) continue;
        // Ensure it has actions
        if (typeof live.actionsLeft !== 'number') live.actionsLeft = 2;
        aiActUnit(live, gs);
      }

      // 3) Final UI update then end turn
      if (typeof updateGrid === 'function') try { updateGrid(); } catch (e) { /*ignore*/ }
      if (typeof updateUI === 'function') try { updateUI(); } catch (e) { /*ignore*/ }

      // Give UI a short moment then end turn
      if (typeof endTurn === 'function') {
        setTimeout(() => {
          try { endTurn(); } catch (e) { if (gs) gs.currentPlayer = 1; }
        }, 220);
      } else {
        // fallback: switch to player
        gs.currentPlayer = 1;
      }
    } catch (err) {
      console.error('AI error', err);
      // attempt to gracefully end turn anyway
      if (typeof endTurn === 'function') endTurn();
      else if (gs) gs.currentPlayer = 1;
    }
  }

  // expose to global
  window.aiTakeTurn = aiTakeTurn;
})();
