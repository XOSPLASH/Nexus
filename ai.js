// ai.js - Enhanced enemy AI logic with better error handling and strategic improvements

function getValidMoves(unit, gameState) {
  if (!unit || !gameState) return [];
  
  const moves = [];
  const maxSteps = (unit.move || 0) + (unit.tempMove || 0);
  
  // Simple BFS to find valid moves within range
  const visited = new Set([`${unit.x},${unit.y}`]);
  const queue = [{ x: unit.x, y: unit.y, dist: 0 }];
  
  while (queue.length > 0) {
    const current = queue.shift();
    
    if (current.dist < maxSteps) {
      const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
      
      for (const [dx, dy] of directions) {
        const newX = current.x + dx;
        const newY = current.y + dy;
        const key = `${newX},${newY}`;
        
        if (visited.has(key)) continue;
        if (!inBounds(newX, newY)) continue;
        
        // Check if move is valid using existing canMoveTo function
        if (typeof canMoveTo === 'function' && canMoveTo(unit, newX, newY)) {
          moves.push({ x: newX, y: newY });
          visited.add(key);
          queue.push({ x: newX, y: newY, dist: current.dist + 1 });
        }
      }
    }
  }
  
  return moves;
}

function getUnitsInRange(unit, gameState) {
  if (!unit || !gameState || !Array.isArray(gameState.units)) return [];
  
  const range = (unit.range || 0) + (unit.rangeBoost || 0);
  const targets = [];
  
  for (const target of gameState.units) {
    if (target.owner === unit.owner) continue;
    
    const distance = Math.abs(unit.x - target.x) + Math.abs(unit.y - target.y);
    if (distance <= range) {
      targets.push(target);
    }
  }
  
  return targets;
}

function getHeartsInRange(unit, gameState) {
  if (!unit || !gameState || !Array.isArray(gameState.hearts)) return [];
  
  const range = (unit.range || 0) + (unit.rangeBoost || 0);
  const targets = [];
  
  for (const heart of gameState.hearts) {
    if (heart.owner === unit.owner) continue;
    
    const distance = Math.abs(unit.x - heart.x) + Math.abs(unit.y - heart.y);
    if (distance <= range) {
      targets.push(heart);
    }
  }
  
  return targets;
}

function attackUnit(attacker, target, gameState) {
  if (!attacker || !target || !gameState) return false;
  
  // Use the global attack function if available
  if (typeof attack === 'function') {
    return attack(attacker, target.x, target.y);
  }
  
  // Fallback manual attack logic
  let damage = (attacker.attack || 0) + (attacker.tempAttack || 0);
  
  // Apply defense bonuses
  if (target.defenseBonus) {
    damage = Math.max(1, damage - target.defenseBonus);
  }
  
  // Handle shields
  if (target.shielded) {
    damage = 0;
    target.shielded = false;
  } else {
    target.hp = Math.max(0, (target.hp || 0) - damage);
  }
  
  // Apply status effects
  if (attacker.freezeNext) {
    target.frozen = true;
    attacker.freezeNext = false;
  }
  
  // Remove dead units
  if (target.hp <= 0) {
    gameState.units = gameState.units.filter(u => u.id !== target.id);
  }
  
  // Consume attacker's action
  attacker.actionsLeft = Math.max(0, (attacker.actionsLeft || 0) - 1);
  
  return true;
}

function isValidPlacement(x, y, owner, gameState) {
  if (!inBounds || !inBounds(x, y)) return false;
  if (typeof unitAt === 'function' && unitAt(x, y)) return false;
  
  // Check for terrain obstacles
  if (typeof isWallAt === 'function' && isWallAt(x, y)) return false;
  if (typeof isHeartAt === 'function' && isHeartAt(x, y)) return false;
  if (typeof isNexusAt === 'function' && isNexusAt(x, y)) return false;
  
  return true;
}

function evaluateUnitPurchase(unitType, gameState) {
  const unit = UNIT_TYPES[unitType];
  if (!unit) return 0;
  
  const aiUnits = (gameState.units || []).filter(u => u.owner === 2);
  const playerUnits = (gameState.units || []).filter(u => u.owner === 1);
  
  let score = 0;
  
  // Basic value scoring
  score += (unit.hp || 0) * 0.5;
  score += (unit.attack || 0) * 2;
  score += (unit.range || 0) * 1.5;
  score += (unit.move || 0) * 1;
  
  // Strategic bonuses based on current board state
  if (unit.canCrossWater && (gameState.water || []).length > 5) {
    score += 10; // Water crossing is valuable on water-heavy maps
  }
  
  if (unit.canFly && (gameState.mountains || []).length > 3) {
    score += 8; // Flying is valuable on mountainous maps
  }
  
  if (unit.isBuilder && (gameState.water || []).length > 8) {
    score += 12; // Builders are crucial for water-heavy maps
  }
  
  // Balance considerations
  if (aiUnits.length === 0) {
    // First unit - prioritize versatile units
    if (unitType === 'warrior' || unitType === 'archer') score += 15;
  }
  
  if (aiUnits.length >= 3) {
    // Late game - prioritize powerful units
    if (unit.cost >= 5) score += 10;
  }
  
  // Don't buy duplicates (existing restriction in place unit)
  if (aiUnits.some(u => u.type === unitType)) {
    score = 0;
  }
  
  return score;
}

function findBestUnitToBuy(gameState) {
  const aiEnergy = gameState.players?.[2]?.energy ?? gameState.p2energy ?? 0;
  
  if (!UNIT_TYPES || aiEnergy < 2) return null;
  
  const affordableUnits = Object.keys(UNIT_TYPES)
    .filter(key => (UNIT_TYPES[key].cost || 0) <= aiEnergy)
    .map(key => ({
      type: key,
      score: evaluateUnitPurchase(key, gameState),
      cost: UNIT_TYPES[key].cost || 0
    }))
    .filter(u => u.score > 0)
    .sort((a, b) => b.score - a.score);
    
  return affordableUnits.length > 0 ? affordableUnits[0] : null;
}

function aiTakeTurn(gameState) {
  if (!gameState) {
    console.warn('No game state provided to AI');
    if (typeof endTurn === 'function') {
      setTimeout(() => endTurn(), 100);
    }
    return;
  }

  // Ensure players object exists and AI player is properly initialized
  if (!gameState.players) {
    gameState.players = {};
  }
  
  if (!gameState.players[2]) {
    gameState.players[2] = { 
      energy: gameState.p2energy || 0,
      hp: gameState.p2hp || 0 
    };
  }

  const ai = gameState.players[2];
  const aiUnits = (gameState.units || []).filter(u => u.owner === 2);

  // If no AI units and no energy, there's nothing the AI can do
  if (aiUnits.length === 0 && (ai.energy || gameState.p2energy || 0) < 2) {
    console.log('AI has no units and insufficient energy');
    if (typeof endTurn === 'function') {
      setTimeout(() => endTurn(), 100);
    }
    return;
  }

  try {
    // Phase 1: Strategic unit purchasing
    const bestPurchase = findBestUnitToBuy(gameState);
    
    if (bestPurchase && typeof UNIT_TYPES !== 'undefined' && UNIT_TYPES) {
      const spawners = (gameState.spawners || []).filter(s => s.owner === 2);
      
      if (spawners.length > 0) {
        const spawn = spawners[0]; // Use first spawner
        
        // Get adjacent tiles for placement
        let adjacentTiles = [];
        if (typeof getAdjacentEmptyTiles === 'function') {
          adjacentTiles = getAdjacentEmptyTiles(spawn.x, spawn.y, gameState);
        } else if (typeof getAdjacentTiles === 'function') {
          adjacentTiles = getAdjacentTiles(spawn.x, spawn.y)
            .filter(t => isValidPlacement(t.x, t.y, 2, gameState));
        }

        if (adjacentTiles.length > 0) {
          let placementSpot = null;
          const unitType = UNIT_TYPES[bestPurchase.type];
          
          // Special placement logic for water-only units
          if (unitType.waterOnly) {
            placementSpot = adjacentTiles.find(spot => 
              isWaterAt(spot.x, spot.y) || 
              getAdjacentTiles(spot.x, spot.y).some(adj => isWaterAt(adj.x, adj.y))
            );
          } else {
            // Regular placement - avoid water unless unit can cross it
            placementSpot = adjacentTiles.find(spot => 
              !isWaterAt(spot.x, spot.y) || 
              isBridgeAt(spot.x, spot.y) || 
              unitType.canCrossWater
            );
          }
          
          // Fallback to any valid spot
          if (!placementSpot && adjacentTiles.length > 0) {
            placementSpot = adjacentTiles[0];
          }
          
          if (placementSpot && typeof placeUnit === 'function') {
            if (placeUnit(bestPurchase.type, placementSpot.x, placementSpot.y, 2)) {
              // Subtract energy from the correct property
              const cost = bestPurchase.cost;
              if (ai.energy !== undefined) {
                ai.energy = Math.max(0, ai.energy - cost);
              } else {
                gameState.p2energy = Math.max(0, (gameState.p2energy || 0) - cost);
              }
              console.log(`AI purchased ${bestPurchase.type} for ${cost} energy`);
            }
          }
        }
      }
    }

    // Phase 2: Use unit abilities strategically
    const refreshedAiUnits = (gameState.units || []).filter(u => u.owner === 2);
    
    for (const unit of refreshedAiUnits) {
      if ((unit.actionsLeft || 0) <= 0) continue;
      if (unit.frozen) continue;

      // Use abilities if beneficial
      const unitTemplate = UNIT_TYPES[unit.type];
      if (unitTemplate && unitTemplate.abilities) {
        for (const ability of unitTemplate.abilities) {
          if ((unit.actionsLeft || 0) <= 0) break;
          
          // Strategic ability usage
          let useAbility = false;
          
          if (ability.name === 'Torpedo' || ability.name === 'Siege') {
            // Use damage abilities if enemies are in range
            const targets = getUnitsInRange(unit, gameState).filter(t => t.owner !== 2);
            const heartTargets = getHeartsInRange(unit, gameState);
            useAbility = targets.length > 0 || heartTargets.length > 0;
          } else if (ability.name === 'Shield') {
            // Use shield if not already shielded and enemies nearby
            const enemiesNearby = (gameState.units || []).some(u => 
              u.owner !== 2 && 
              Math.abs(u.x - unit.x) + Math.abs(u.y - unit.y) <= 3
            );
            useAbility = !unit.shielded && enemiesNearby;
          } else if (ability.name === 'Freeze') {
            // Use freeze if strong enemies are in range
            const strongTargets = getUnitsInRange(unit, gameState)
              .filter(t => t.owner !== 2 && (t.hp || 0) > 8);
            useAbility = strongTargets.length > 0;
          } else if (ability.name === 'Heal') {
            // Use heal if friendly units need healing
            const adjacentTiles = getAdjacentTiles ? getAdjacentTiles(unit.x, unit.y) : [];
            const woundedAllies = adjacentTiles.some(t => {
              const ally = unitAt ? unitAt(t.x, t.y) : null;
              if (!ally || ally.owner !== 2) return false;
              const maxHP = UNIT_TYPES[ally.type]?.hp || 0;
              return (ally.hp || 0) < maxHP;
            });
            useAbility = woundedAllies;
          } else if (ability.name === 'Charge') {
            // Use charge if we need extra movement to reach targets
            const targets = (gameState.units || []).filter(u => u.owner !== 2);
            const minDistToTarget = Math.min(...targets.map(t => 
              Math.abs(unit.x - t.x) + Math.abs(unit.y - t.y)
            ));
            useAbility = minDistToTarget > (unit.move || 0) + (unit.tempMove || 0);
          }
          
          if (useAbility) {
            try {
              ability.action(unit, gameState);
              break; // Only use one ability per turn
            } catch (e) {
              console.error('AI ability error:', e);
            }
          }
        }
      }
    }

    // Phase 3: Combat - prioritize high-value targets
    const combatUnits = refreshedAiUnits.filter(u => (u.actionsLeft || 0) > 0 && !u.frozen);
    
    for (const unit of combatUnits) {
      if ((unit.actionsLeft || 0) <= 0) continue;

      // First priority: Attack enemy hearts if possible
      const heartTargets = getHeartsInRange(unit, gameState);
      if (heartTargets.length > 0) {
        const heart = heartTargets[0];
        if (typeof canAttack === 'function' && canAttack(unit, heart.x, heart.y)) {
          if (typeof attack === 'function') {
            attack(unit, heart.x, heart.y);
            continue;
          }
        }
      }

      // Second priority: Attack enemy units
      const targets = getUnitsInRange(unit, gameState).filter(t => t.owner !== 2);
      
      if (targets.length > 0) {
        // Prioritize: low HP units first, then high-value units
        const priorityTarget = targets.reduce((best, current) => {
          const bestHP = best.hp || 0;
          const currentHP = current.hp || 0;
          const bestValue = (UNIT_TYPES[best.type]?.cost || 0);
          const currentValue = (UNIT_TYPES[current.type]?.cost || 0);
          
          // If one can be killed this turn, prioritize it
          const unitAttack = (unit.attack || 0) + (unit.tempAttack || 0);
          const canKillBest = bestHP <= unitAttack;
          const canKillCurrent = currentHP <= unitAttack;
          
          if (canKillCurrent && !canKillBest) return current;
          if (canKillBest && !canKillCurrent) return best;
          
          // If both or neither can be killed, choose higher value target
          if (currentValue > bestValue) return current;
          if (bestValue > currentValue) return best;
          
          // Finally, choose lower HP
          return currentHP < bestHP ? current : best;
        });
        
        if (typeof canAttack === 'function' && canAttack(unit, priorityTarget.x, priorityTarget.y)) {
          if (typeof attack === 'function') {
            attack(unit, priorityTarget.x, priorityTarget.y);
            continue; // Skip movement if we attacked
          }
        }
      }
    }

    // Phase 4: Movement - improved strategic positioning
    const movementUnits = refreshedAiUnits.filter(u => (u.actionsLeft || 0) > 0 && !u.frozen);
    
    for (const unit of movementUnits) {
      if ((unit.actionsLeft || 0) <= 0) continue;
      
      const moves = getValidMoves(unit, gameState);
      
      if (moves.length > 0) {
        let bestMove = null;
        let bestScore = -Infinity;
        
        const enemyUnits = (gameState.units || []).filter(u => u.owner === 1);
        const enemyHearts = (gameState.hearts || []).filter(h => h.owner === 1);
        const friendlyUnits = (gameState.units || []).filter(u => u.owner === 2 && u.id !== unit.id);
        
        for (const move of moves) {
          let score = 0;
          
          // Distance to enemy units (closer is better for attackers)
          for (const enemy of enemyUnits) {
            const dist = Math.abs(move.x - enemy.x) + Math.abs(move.y - enemy.y);
            const unitRange = (unit.range || 0) + (unit.rangeBonus || 0);
            
            if (dist <= unitRange) {
              score += 20; // Can attack from this position
            } else {
              score += Math.max(0, 10 - dist); // Closer is better
            }
          }
          
          // Distance to enemy hearts (priority targets)
          for (const heart of enemyHearts) {
            const dist = Math.abs(move.x - heart.x) + Math.abs(move.y - heart.y);
            const unitRange = (unit.range || 0) + (unit.rangeBonus || 0);
            
            if (dist <= unitRange) {
              score += 30; // Can attack heart from this position!
            } else {
              score += Math.max(0, 20 - dist); // Hearts are high priority
            }
          }
          
          // Distance to nexuses (capture objectives)
          for (const nexus of (gameState.nexuses || [])) {
            const dist = Math.abs(move.x - nexus.x) + Math.abs(move.y - nexus.y);
            if (dist === 0) {
              score += 25; // Standing on nexus for capture
            } else if (nexus.owner !== 2) {
              score += Math.max(0, 15 - dist); // Move towards uncaptured nexuses
            }
          }
          
          // Avoid clustering too much (mild penalty for being near friendlies)
          for (const friendly of friendlyUnits) {
            const dist = Math.abs(move.x - friendly.x) + Math.abs(move.y - friendly.y);
            if (dist <= 1) score -= 2; // Mild penalty for adjacent friendlies
          }
          
          // Terrain bonuses
          if (typeof isForestAt === 'function' && isForestAt(move.x, move.y)) {
            score += 5; // Forest gives defense bonus
          }
          
          // Avoid dangerous positions (near enemy units that can attack)
          for (const enemy of enemyUnits) {
            const dist = Math.abs(move.x - enemy.x) + Math.abs(move.y - enemy.y);
            const enemyRange = (enemy.range || 0) + (enemy.rangeBonus || 0);
            if (dist <= enemyRange && (enemy.actionsLeft || 0) > 0) {
              score -= 8; // Penalty for being in enemy attack range
            }
          }
          
          // Add some randomness to prevent predictable behavior
          score += Math.random() * 3;
          
          if (score > bestScore) {
            bestScore = score;
            bestMove = move;
          }
        }
        
        // Execute the best move
        if (bestMove && typeof moveUnit === 'function') {
          moveUnit(unit, bestMove.x, bestMove.y);
        } else if (bestMove) {
          // Fallback movement
          unit.x = bestMove.x;
          unit.y = bestMove.y;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          
          // Update forest defense bonus
          if (typeof isForestAt === 'function' && isForestAt(bestMove.x, bestMove.y)) {
            unit.defenseBonus = 2;
          } else {
            delete unit.defenseBonus;
          }
        }
      }
    }

    // Update the game display
    if (typeof updateGrid === 'function') updateGrid();
    if (typeof updateUI === 'function') updateUI();
    
  } catch (error) {
    console.error('AI turn error:', error);
  }

  // Always end the AI turn to prevent game locks
  setTimeout(() => {
    if (typeof endTurn === 'function') {
      endTurn();
    }
  }, 800); // Slightly longer delay to see AI actions
}

// Export functions
window.aiTakeTurn = aiTakeTurn;
window.getValidMoves = getValidMoves;
window.getUnitsInRange = getUnitsInRange;
window.attackUnit = attackUnit;