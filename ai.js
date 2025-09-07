// ai.js – Fixed AI with proper energy management and strategic decision-making
(function(){
  'use strict';
  const log = (...a)=>{ try{ console.debug('[AI]',...a);}catch(e){} };

  // find APIs
  function findApi(){
    return {
      placeUnit: (window.__nexus_game && window.__nexus_game.placeUnit) || window.placeUnit || null,
      moveUnit: (window.__nexus_game && window.__nexus_game.moveUnit) || window.moveUnit || null,
      attackUnit: (window.__nexus_game && window.__nexus_game.attackUnit) || window.attackUnit || null,
      endTurn: (window.__nexus_game && window.__nexus_game.endTurn) || window.endTurn || null,
      getState: (window.__nexus_game && window.__nexus_game.getState) || (window.__nexus_game && (()=>window.__nexus_game.state)) || null,
      updateUI: (window.__nexus_game && window.__nexus_game.updateUI) || null,
      unitDefs: window.UNIT_TYPES || window.UNIT_MAP || window.UNIT_DEFS || null
    };
  }

  function getState(api){
    if (!api) api = findApi();
    if (api.getState && typeof api.getState === 'function') {
      try { return api.getState(); } catch(e){}
    }
    // fallback to global state if present
    if (window.__nexus_game && window.__nexus_game.state) {
      // Create a copy to avoid mutations
      const s = window.__nexus_game.state;
      return {
        board: s.board,
        players: s.players,
        currentPlayer: s.currentPlayer,
        turnNumber: s.turnNumber
      };
    }
    if (window.gameState) return window.gameState;
    if (window.state) return window.state;
    return null;
  }

  function buildUnitMap(defs){
    if (!defs) return {};
    if (Array.isArray(defs)){
      const out = {};
      defs.forEach(d=>{ if (d && (d.id||d.key)) out[d.id || d.key] = d; });
      return out;
    }
    return defs;
  }

  // helper to get AI energy safely - FIXED to use proper path
  function getAiEnergy(gs){
    if (!gs) return 0;
    // The correct path based on game.js structure
    if (gs.players && gs.players[2] && typeof gs.players[2].energy === 'number') {
      return gs.players[2].energy;
    }
    return 0;
  }

  // FIXED: Proper unit placement that deducts energy
  function tryPlace(api, defId, x, y, owner){
    if (!api || !api.placeUnit) return false;
    if (!defId) return false;
    
    try {
      // Get the unit definition to check cost
      const unitMap = buildUnitMap(api.unitDefs || window.UNIT_TYPES || {});
      const def = unitMap[defId];
      if (!def || !def.cost) return false;
      
      // Get current state to check energy
      const state = getState(api);
      if (!state) return false;
      
      const currentEnergy = getAiEnergy(state);
      if (currentEnergy < def.cost) {
        log('Not enough energy for', defId, '- need', def.cost, 'have', currentEnergy);
        return false;
      }
      
      // Try to place the unit
      const result = api.placeUnit(defId, x, y, owner);
      if (result !== false) {
        // Deduct energy from the AI player
        if (window.__nexus_game && window.__nexus_game.state && window.__nexus_game.state.players) {
          window.__nexus_game.state.players[2].energy -= def.cost;
          log('Placed', defId, 'at', x, y, '- Cost:', def.cost, '- Remaining energy:', window.__nexus_game.state.players[2].energy);
        }
        return true;
      }
    } catch(e) {
      log('Error in tryPlace:', e);
    }
    return false;
  }

  // find spawnable locations (adjacent to spawners or controlled territory)
  function findSpawnableLocations(gs){
    const locations = [];
    if (!gs || !gs.board) return locations;
    
    // Find all cells adjacent to AI-owned spawners
    for (let y = 0; y < gs.board.length; y++) {
      for (let x = 0; x < gs.board[y].length; x++) {
        const cell = gs.board[y][x];
        if (cell.spawner && cell.spawner.owner === 2) {
          // Check all 8 adjacent cells
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < gs.board[0].length && ny < gs.board.length) {
                const adjCell = gs.board[ny][nx];
                if (!adjCell.unit && adjCell.terrain !== 'mountain') {
                  // Check if this location is already in our list
                  if (!locations.some(loc => loc.x === nx && loc.y === ny)) {
                    locations.push({x: nx, y: ny, terrain: adjCell.terrain});
                  }
                }
              }
            }
          }
        }
      }
    }
    return locations;
  }

  // pick unit to buy: strategic choice based on what we have and need
  function chooseBuy(unitMap, budget, existingUnits){
    const arr = Object.entries(unitMap).map(([k,v])=> ({
      key:k, 
      def:v, 
      cost: v.cost || 0,
      value: calculateUnitValue(v, existingUnits)
    }));
    
    // Filter buyable units (within budget, not summon-only)
    const buyable = arr.filter(a => 
      a.cost > 0 && 
      a.cost <= budget && 
      !a.def.summonOnly &&
      !a.def.isTerrain
    );
    
    if (!buyable.length) return null;
    
    // Sort by value/cost ratio (higher is better)
    buyable.sort((a,b) => {
      const ratioA = a.value / a.cost;
      const ratioB = b.value / b.cost;
      return ratioB - ratioA;
    });
    
    // Take the best value unit we can afford
    return buyable[0];
  }

  // Calculate strategic value of a unit type
  function calculateUnitValue(def, existingUnits) {
    let value = 10; // base value
    
    // Stats contribution
    value += (def.hp || 1) * 2;
    value += (def.attack || def.atk || 1) * 3;
    value += (def.range || 1) * 2;
    value += (def.move || 1) * 1.5;
    
    // Diversity bonus - prefer units we don't have many of
    const countOfType = existingUnits.filter(u => u.defId === (def.id || def.name)).length;
    if (countOfType === 0) value *= 1.5; // First of its kind
    else if (countOfType === 1) value *= 1.2; // Second unit
    else value *= 0.8; // Diminishing returns
    
    // Special unit type bonuses
    if (def.range > 1) value *= 1.3; // Ranged units are valuable
    if (def.move >= 3) value *= 1.2; // Fast units for map control
    if (def.waterOnly) value *= 0.7; // Water units are situational
    
    return value;
  }

  // Find the best target for a unit
  function findBestTarget(unit, enemies, gs) {
    if (!enemies.length) return null;
    
    const targets = enemies.map(enemy => {
      const dist = Math.abs(enemy.x - unit.x) + Math.abs(enemy.y - unit.y);
      const range = unit.range || 1;
      
      // Calculate threat/priority score
      let score = 0;
      
      // Can we attack it now?
      if (dist <= range) score += 100;
      
      // Low health enemies are high priority
      score += (10 - enemy.hp) * 5;
      
      // High damage enemies are threats
      score += (enemy.attack || 1) * 2;
      
      // Enemies near our spawners/nexuses are high priority
      for (let y = 0; y < gs.board.length; y++) {
        for (let x = 0; x < gs.board[y].length; x++) {
          const cell = gs.board[y][x];
          if ((cell.spawner && cell.spawner.owner === 2) || 
              (cell.nexus && cell.nexus.owner === 2)) {
            const threatDist = Math.abs(enemy.x - x) + Math.abs(enemy.y - y);
            if (threatDist <= 2) score += 20;
          }
        }
      }
      
      // Distance penalty (prefer closer targets)
      score -= dist * 2;
      
      return { enemy, dist, score };
    });
    
    targets.sort((a, b) => b.score - a.score);
    return targets[0]?.enemy || null;
  }

  // Calculate best move toward a target
  function calculateBestMove(unit, target, gs) {
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    let bestMove = null;
    let bestScore = -Infinity;
    
    for (const [dx,dy] of dirs) {
      const nx = unit.x + dx, ny = unit.y + dy;
      
      // Check bounds
      if (nx < 0 || ny < 0 || nx >= gs.board[0].length || ny >= gs.board.length) continue;
      
      const cell = gs.board[ny][nx];
      
      // Check if occupied or impassable
      if (cell.unit) continue;
      if (cell.terrain === 'mountain') continue; // Simplified - should check unit abilities
      if (cell.terrain === 'water' && !unit.waterOnly) continue; // Check if unit can cross water
      
      // Calculate score for this move
      let score = 0;
      
      // Distance to target
      const newDist = Math.abs(target.x - nx) + Math.abs(target.y - ny);
      score -= newDist * 10; // Closer is better
      
      // Avoid dangerous positions (next to strong enemies)
      for (let y = 0; y < gs.board.length; y++) {
        for (let x = 0; x < gs.board[y].length; x++) {
          const c = gs.board[y][x];
          if (c.unit && c.unit.owner !== unit.owner) {
            const enemyDist = Math.abs(nx - x) + Math.abs(ny - y);
            if (enemyDist === 1 && c.unit.attack > unit.hp) {
              score -= 20; // Avoid strong enemies
            }
          }
        }
      }
      
      // Prefer capturing objectives
      if (cell.spawner && cell.spawner.owner !== 2) score += 15;
      if (cell.nexus && cell.nexus.owner !== 2) score += 25;
      
      if (score > bestScore) {
        bestScore = score;
        bestMove = {x: nx, y: ny};
      }
    }
    
    return bestMove;
  }

  // main AI turn function
  function aiTakeTurn(gameStateArg){
    const api = findApi();
    const gs = gameStateArg || getState(api);
    if (!gs) { 
      log('No state for AI'); 
      if (api.endTurn) setTimeout(()=>api.endTurn(), 150); 
      return; 
    }

    const unitMap = buildUnitMap(api.unitDefs || window.UNIT_TYPES || window.UNIT_MAP || window.UNIT_DEFS || {});
    let aiEnergy = getAiEnergy(gs);
    log('AI turn start - Energy:', aiEnergy);

    // Collect existing AI units
    const aiUnits = [];
    if (gs.board) {
      for (let y = 0; y < gs.board.length; y++) {
        for (let x = 0; x < gs.board[y].length; x++) {
          const cell = gs.board[y][x];
          if (cell.unit && cell.unit.owner === 2) {
            aiUnits.push({...cell.unit, x, y}); // Include coordinates
          }
        }
      }
    }

    // PURCHASE PHASE - Buy units strategically
    const spawnableLocations = findSpawnableLocations(gs);
    let purchaseAttempts = 0;
    const maxPurchases = 3; // Limit purchases per turn to be more strategic
    
    while (purchaseAttempts < maxPurchases && spawnableLocations.length > 0 && aiEnergy > 0) {
      const pick = chooseBuy(unitMap, aiEnergy, aiUnits);
      if (!pick || pick.cost > aiEnergy) {
        log('Cannot afford any more units. Best pick cost:', pick?.cost, 'Energy:', aiEnergy);
        break;
      }
      
      // Choose best spawn location (prefer forward positions)
      let bestSpot = null;
      let bestSpotScore = -Infinity;
      
      for (const spot of spawnableLocations) {
        let score = 0;
        
        // Prefer spots closer to enemy
        for (let y = 0; y < gs.board.length; y++) {
          for (let x = 0; x < gs.board[y].length; x++) {
            const cell = gs.board[y][x];
            if (cell.unit && cell.unit.owner === 1) {
              const dist = Math.abs(spot.x - x) + Math.abs(spot.y - y);
              score -= dist; // Closer to enemies is better
            }
          }
        }
        
        // Avoid water for non-water units
        if (spot.terrain === 'water' && !pick.def.waterOnly) score -= 100;
        
        // Prefer plain terrain
        if (spot.terrain === 'plain') score += 5;
        
        if (score > bestSpotScore) {
          bestSpotScore = score;
          bestSpot = spot;
        }
      }
      
      if (!bestSpot) {
        log('No suitable spawn location found');
        break;
      }
      
      // Try to place the unit (tryPlace now handles energy deduction)
      const placed = tryPlace(api, pick.key, bestSpot.x, bestSpot.y, 2);
      if (placed) {
        aiEnergy = getAiEnergy(getState(api)); // Get updated energy after placement
        
        // Remove this location from available spots
        const idx = spawnableLocations.findIndex(loc => loc.x === bestSpot.x && loc.y === bestSpot.y);
        if (idx !== -1) spawnableLocations.splice(idx, 1);
        
        // Update AI units list with new unit
        aiUnits.push({
          defId: pick.key,
          x: bestSpot.x,
          y: bestSpot.y,
          owner: 2,
          hp: pick.def.hp || 1,
          attack: pick.def.attack || pick.def.atk || 1,
          range: pick.def.range || 1,
          move: pick.def.move || 1,
          actionsLeft: 2
        });
      } else {
        log('Failed to place', pick.key, 'at', bestSpot);
      }
      
      purchaseAttempts++;
    }

    // Sync UI after purchases
    if (api.updateUI) try{ api.updateUI(); }catch(e){}

    // ACTION PHASE - Move and attack with units
    try {
      // Get fresh state after purchases
      const currentState = getState(api);
      const myActiveUnits = [];
      
      // Collect AI units with actions remaining
      if (currentState.board) {
        for (let y = 0; y < currentState.board.length; y++) {
          for (let x = 0; x < currentState.board[y].length; x++) {
            const cell = currentState.board[y][x];
            if (cell.unit && cell.unit.owner === 2 && (cell.unit.actionsLeft || 0) > 0) {
              myActiveUnits.push({...cell.unit, x, y}); // Include coordinates
            }
          }
        }
      }
      
      // Sort units by priority (ranged units act first, then by position)
      myActiveUnits.sort((a, b) => {
        const rangeA = a.range || 1;
        const rangeB = b.range || 1;
        if (rangeA !== rangeB) return rangeB - rangeA; // Ranged units first
        return a.y - b.y; // Top units first (closer to player)
      });
      
      log('AI has', myActiveUnits.length, 'active units');
      
      // Act with each unit
      for (const unit of myActiveUnits) {
        if (!unit || (unit.actionsLeft || 0) <= 0) continue;
        
        // Collect all enemy units
        const enemies = [];
        const latestState = getState(api); // Get fresh state for each unit
        if (latestState.board) {
          for (let y = 0; y < latestState.board.length; y++) {
            for (let x = 0; x < latestState.board[y].length; x++) {
              const cell = latestState.board[y][x];
              if (cell.unit && cell.unit.owner === 1) {
                enemies.push({...cell.unit, x, y});
              }
            }
          }
        }
        
        log('Unit at', unit.x, unit.y, 'has', unit.actionsLeft, 'actions, sees', enemies.length, 'enemies');
        
        // Use all available actions
        while ((unit.actionsLeft || 0) > 0) {
          let actionTaken = false;
          
          // Find best target
          const target = findBestTarget(unit, enemies, latestState);
          if (!target) {
            log('No target found for unit at', unit.x, unit.y);
            break;
          }
          
          const dist = Math.abs(target.x - unit.x) + Math.abs(target.y - unit.y);
          const range = unit.range || 1;
          
          // If in range, attack
          if (dist <= range) {
            if (api.attackUnit) {
              try {
                const result = api.attackUnit(unit, target.x, target.y);
                if (result !== false) {
                  actionTaken = true;
                  unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
                  log('AI unit at', unit.x, unit.y, 'attacked target at', target.x, target.y);
                  
                  // Update target HP or remove if killed
                  target.hp -= (unit.attack || 1);
                  if (target.hp <= 0) {
                    const idx = enemies.indexOf(target);
                    if (idx !== -1) enemies.splice(idx, 1);
                  }
                }
              } catch(e) { 
                log('Attack failed:', e); 
              }
            }
          } else {
            // Move toward target
            const bestMove = calculateBestMove(unit, target, latestState);
            if (bestMove && api.moveUnit) {
              try {
                const result = api.moveUnit(unit, bestMove.x, bestMove.y);
                if (result !== false) {
                  actionTaken = true;
                  unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
                  log('AI unit moved from', unit.x, unit.y, 'to', bestMove.x, bestMove.y);
                  unit.x = bestMove.x;
                  unit.y = bestMove.y;
                }
              } catch(e) { 
                log('Move failed:', e); 
              }
            }
          }
          
          // If no action was taken, try next unit
          if (!actionTaken) {
            log('No action taken for unit at', unit.x, unit.y);
            break;
          }
        }
      }
    } catch(e){
      log('AI action phase error:', e);
    }

    // Final UI update
    if (api.updateUI) try{ api.updateUI(); }catch(e){}

    // End AI turn
    if (api.endTurn && typeof api.endTurn === 'function') {
      setTimeout(()=>{ 
        try{ 
          api.endTurn(); 
          log('AI turn ended');
        } catch(e){ 
          log('endTurn fail:', e); 
        } 
      }, 300);
    } else {
      log('No endTurn API found – AI finished but cannot end turn.');
    }
  }

  window.aiTakeTurn = aiTakeTurn;
  if (!window.ai_take_turn) window.ai_take_turn = aiTakeTurn;
  log('ai.js loaded – Fixed AI with proper energy management ready');
})();