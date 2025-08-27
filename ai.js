// ai.js - simple but smarter AI that uses functions exported by game.js
// Expects functions like placeUnitNearSpawner, unitAt, canAttack, canMoveTo, moveUnit, attack, updateGrid to exist.

function aiTakeTurn(gameStateLocal) {
  const gs = window.gameState || gameStateLocal || window.gameState;
  // 1) Try to place a unit if AI has energy and there is an available type not yet placed
  const aiEnergy = gs.p2energy;
  const unitOrder = ['scout','archer','warrior','builder','sniper','tank'];
  for (const t of unitOrder) {
    if (UNIT_TYPES[t] && aiEnergy >= UNIT_TYPES[t].cost && !gs.units.some(u => u.owner === 2 && u.type === t)) {
      // attempt spawn near AI spawner
      const ok = placeUnitNearSpawner(t, 2);
      if (ok) {
        gs.p2energy -= UNIT_TYPES[t].cost;
        break;
      }
    }
  }

  // 2) For each AI unit: attack if possible else move towards nearest player unit/heart/nexus
  const aiUnits = gs.units.filter(u => u.owner === 2);
  const playerUnits = gs.units.filter(u => u.owner === 1);

  for (const unit of aiUnits) {
    while (unit.actionsLeft > 0) {
      // try to attack player heart if in range
      if (gs.hearts && gs.hearts[0]) {
        const pHeart = gs.hearts.find(h => h.owner === 1);
        if (pHeart && canAttack(unit, pHeart.x, pHeart.y)) {
          attack(unit, pHeart.x, pHeart.y);
          continue;
        }
      }

      // try to attack nearest player unit
      if (playerUnits.length) {
        // find nearest alive
        playerUnits.sort((a,b) => (Math.abs(a.x-unit.x)+Math.abs(a.y-unit.y)) - (Math.abs(b.x-unit.x)+Math.abs(b.y-unit.y)));
        const target = playerUnits[0];
        if (target) {
          if (canAttack(unit, target.x, target.y)) {
            attack(unit, target.x, target.y);
            continue;
          } else {
            // move toward them
            const nx = unit.x + Math.sign(target.x - unit.x);
            const ny = unit.y + Math.sign(target.y - unit.y);
            if (canMoveTo(unit, nx, ny)) { moveUnit(unit, nx, ny); continue; }
            // try alternate axis
            const nx2 = unit.x;
            const ny2 = unit.y + Math.sign(target.y - unit.y);
            if (canMoveTo(unit, nx2, ny2)) { moveUnit(unit, nx2, ny2); continue; }
          }
        }
      }

      // if nothing else, move toward nearest uncaptured nexus
      if (gs.nexuses && gs.nexuses.length) {
        const uncaptured = gs.nexuses.find(n => n.owner !== 2);
        if (uncaptured) {
          const nx = unit.x + Math.sign(uncaptured.x - unit.x);
          const ny = unit.y + Math.sign(uncaptured.y - unit.y);
          if (canMoveTo(unit, nx, ny)) { moveUnit(unit, nx, ny); continue; }
        }
      }

      // nothing to do -> break
      break;
    }
  }

  // finished AI actions -> end AI turn
  updateGrid();
  updateUI();
  // switch back to player
  setTimeout(() => {
    // call endTurn() in global scope that switches back to player
    if (typeof endTurn === 'function') endTurn();
    else {
      // fallback: set current player to 1
      if (window.gameState) window.gameState.currentPlayer = 1;
    }
  }, 400);
}