// units.js - Enhanced unit definitions with improved ability safety
// Each unit entry includes stats, cost, visual symbol, and optional abilities.
// Abilities are small functions that operate on (unit, gameState) and return an optional { msg: "..." }.

const UNIT_TYPES = {
  scout: {
    name: "Scout",
    cost: 2,
    hp: 6,
    attack: 1,
    range: 2,
    move: 4,
    symbol: "👁️",
    canCrossWater: false,
    canFly: false,
    description: "Fast recon unit. Low HP but high mobility.",
    abilities: [
      {
        name: "Reveal",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Give enemy units a temporary 'revealed' flag for 1 turn
          let revealedCount = 0;
          (gameState.units || []).forEach(u => { 
            if (u.owner !== unit.owner) {
              u.revealed = 2; // Lasts for 2 turns
              revealedCount++;
            }
          });
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: `Revealed ${revealedCount} enemy units for 2 turns.` };
        }
      },
      {
        name: "Sprint",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Scout gets extra movement for this turn
          unit.tempMove = (unit.tempMove || 0) + 3;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Sprint: +3 movement for this turn." };
        }
      }
    ]
  },

  warrior: {
    name: "Warrior",
    cost: 3,
    hp: 12,
    attack: 4,
    range: 1,
    move: 2,
    symbol: "🗡️",
    canCrossWater: false,
    canFly: false,
    description: "Frontline melee unit. Good damage and HP.",
    abilities: [
      {
        name: "Berserker",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Trade some HP for increased attack
          if (unit.hp <= 2) return { msg: "Too wounded to go berserk." };
          unit.hp = Math.max(1, unit.hp - 2);
          unit.tempAttack = (unit.tempAttack || 0) + 3;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Berserker rage: -2 HP, +3 attack this turn." };
        }
      },
      {
        name: "Taunt",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Force nearby enemies to target this unit (mark them as taunted)
          let tauntedCount = 0;
          const adjacentTiles = typeof getAdjacentTiles === 'function' ? 
            getAdjacentTiles(unit.x, unit.y) : 
            [[0,1], [0,-1], [1,0], [-1,0]].map(([dx,dy]) => ({x: unit.x + dx, y: unit.y + dy}));
            
          for (const tile of adjacentTiles) {
            const enemy = gameState.units.find(u => u.x === tile.x && u.y === tile.y && u.owner !== unit.owner);
            if (enemy) {
              enemy.taunted = unit.id; // Mark which unit taunted them
              tauntedCount++;
            }
          }
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: tauntedCount ? `Taunted ${tauntedCount} adjacent enemies.` : "No adjacent enemies to taunt." };
        }
      }
    ]
  },

  archer: {
    name: "Archer",
    cost: 3,
    hp: 8,
    attack: 3,
    range: 3,
    move: 2,
    symbol: "🏹",
    canCrossWater: false,
    canFly: false,
    description: "Ranged unit – hits from afar but fragile.",
    abilities: [
      {
        name: "Volley",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Simple effect: +1 range for this unit for this turn
          unit.rangeBoost = (unit.rangeBoost || 0) + 1;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Range increased by 1 for this turn." };
        }
      },
      {
        name: "Piercing Shot",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Next attack ignores defense bonuses and shields
          unit.piercingNext = true;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Next attack will pierce defenses and shields." };
        }
      }
    ]
  },

  builder: {
    name: "Builder",
    cost: 4,
    hp: 10,
    attack: 1,
    range: 1,
    move: 2,
    symbol: "⚒️",
    canCrossWater: false,
    canFly: false,
    isBuilder: true, // game.js uses this flag to show build/break/bridge buttons
    description: "Constructs walls and bridges. Vital for crossing waterways.",
    abilities: [
      {
        name: "Fortify",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Builder gains temporary defense bonus
          unit.defenseBonus = (unit.defenseBonus || 0) + 3;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Fortified: +3 defense bonus this turn." };
        }
      },
      {
        name: "Repair",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Heal adjacent friendly units and structures
          const adjacentTiles = typeof getAdjacentTiles === 'function' ? 
            getAdjacentTiles(unit.x, unit.y) : 
            [[0,1], [0,-1], [1,0], [-1,0]].map(([dx,dy]) => ({x: unit.x + dx, y: unit.y + dy}));
            
          let repaired = 0;
          for (const tile of adjacentTiles) {
            const ally = gameState.units.find(u => u.x === tile.x && u.y === tile.y && u.owner === unit.owner);
            if (ally && ally.hp < (UNIT_TYPES[ally.type]?.hp || 0)) {
              const maxHP = UNIT_TYPES[ally.type]?.hp || 0;
              const healAmount = Math.min(3, maxHP - ally.hp);
              ally.hp += healAmount;
              repaired++;
            }
          }
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: repaired ? `Repaired ${repaired} adjacent units.` : "No adjacent allies to repair." };
        }
      }
    ]
  },

  knight: {
    name: "Knight",
    cost: 5,
    hp: 16,
    attack: 5,
    range: 1,
    move: 3,
    symbol: "🐴",
    canCrossWater: false,
    canFly: false,
    description: "Armored unit with good mobility.",
    abilities: [
      {
        name: "Charge",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // +2 move temporarily (applied into tempMove), consumes action
          unit.tempMove = (unit.tempMove || 0) + 2;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Charged: move increased by 2 for this turn." };
        }
      },
      {
        name: "Trample",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Next attack also damages adjacent enemies to the target
          unit.trampleNext = true;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Next attack will damage adjacent enemies too." };
        }
      }
    ]
  },

  healer: {
    name: "Healer",
    cost: 4,
    hp: 9,
    attack: 0,
    range: 1,
    move: 2,
    symbol: "✨",
    canCrossWater: false,
    canFly: false,
    description: "Heals adjacent friendly units.",
    abilities: [
      {
        name: "Heal",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Use global function if available, otherwise fallback
          let adjacentTiles = [];
          if (typeof getAdjacentTiles === 'function') {
            adjacentTiles = getAdjacentTiles(unit.x, unit.y);
          } else {
            // Fallback adjacent tile calculation
            const directions = [[0,1], [0,-1], [1,0], [-1,0]];
            adjacentTiles = directions
              .map(([dx, dy]) => ({ x: unit.x + dx, y: unit.y + dy }))
              .filter(t => t.x >= 0 && t.y >= 0 && t.x < 11 && t.y < 11); // Assume 11x11 board
          }
          
          let healed = 0;
          for (const t of adjacentTiles) {
            const u = gameState.units.find(x => x.x === t.x && x.y === t.y && x.owner === unit.owner);
            if (u && u.hp < (UNIT_TYPES[u.type]?.hp || 0)) {
              const maxHP = UNIT_TYPES[u.type]?.hp || 0;
              const healAmount = Math.min(4, maxHP - u.hp);
              u.hp += healAmount;
              healed++;
            }
          }
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: healed ? `Healed ${healed} units by 4 HP each.` : "No adjacent friendly units to heal." };
        }
      },
      {
        name: "Sanctuary",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Grant temporary shields to all adjacent friendly units
          const adjacentTiles = typeof getAdjacentTiles === 'function' ? 
            getAdjacentTiles(unit.x, unit.y) : 
            [[0,1], [0,-1], [1,0], [-1,0]].map(([dx,dy]) => ({x: unit.x + dx, y: unit.y + dy}));
            
          let shielded = 0;
          for (const tile of adjacentTiles) {
            const ally = gameState.units.find(u => u.x === tile.x && u.y === tile.y && u.owner === unit.owner);
            if (ally && !ally.shielded) {
              ally.shielded = true;
              shielded++;
            }
          }
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: shielded ? `Granted shields to ${shielded} adjacent allies.` : "No adjacent allies to shield." };
        }
      }
    ]
  },

  shieldbearer: {
    name: "Shieldbearer",
    cost: 4,
    hp: 14,
    attack: 2,
    range: 1,
    move: 2,
    symbol: "🛡️",
    canCrossWater: false,
    canFly: false,
    description: "Provides shields to self. High survivability.",
    abilities: [
      {
        name: "Shield",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (unit.shielded) return { msg: "Already shielded." };
          unit.shielded = true;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Shield applied: next hit blocked." };
        }
      },
      {
        name: "Shield Wall",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Grant shields to all adjacent friendly units
          const adjacentTiles = typeof getAdjacentTiles === 'function' ? 
            getAdjacentTiles(unit.x, unit.y) : 
            [[0,1], [0,-1], [1,0], [-1,0]].map(([dx,dy]) => ({x: unit.x + dx, y: unit.y + dy}));
            
          let shielded = 0;
          for (const tile of adjacentTiles) {
            const ally = gameState.units.find(u => u.x === tile.x && u.y === tile.y && u.owner === unit.owner);
            if (ally && !ally.shielded) {
              ally.shielded = true;
              shielded++;
            }
          }
          // Also shield self if not already shielded
          if (!unit.shielded) {
            unit.shielded = true;
            shielded++;
          }
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: shielded ? `Shield Wall: granted shields to ${shielded} units.` : "Shield Wall activated." };
        }
      }
    ]
  },

  naval: {
    name: "Naval",
    cost: 4,
    hp: 10,
    attack: 3,
    range: 1,
    move: 3,
    symbol: "⛴️",
    waterOnly: true,      // primarily a water unit
    canCrossWater: true,  // can move across water tiles
    canFly: false,
    description: "Naval vessel – moves across connected water; placed on water or adjacent to water.",
    abilities: [
      {
        name: "Torpedo",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Naval special attack: extra damage this turn
          unit.tempAttack = (unit.tempAttack || 0) + 2;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Torpedo ready: +2 attack this turn." };
        }
      },
      {
        name: "Depth Charge",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Damage all enemy units within 2 tiles
          let damaged = 0;
          for (const enemy of gameState.units) {
            if (enemy.owner === unit.owner) continue;
            const dist = Math.abs(enemy.x - unit.x) + Math.abs(enemy.y - unit.y);
            if (dist <= 2) {
              const damage = enemy.shielded ? 0 : 2;
              if (enemy.shielded) {
                enemy.shielded = false;
              } else {
                enemy.hp = Math.max(0, enemy.hp - damage);
              }
              damaged++;
            }
          }
          
          // Remove dead units
          gameState.units = gameState.units.filter(u => u.hp > 0);
          
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: damaged ? `Depth charge damaged ${damaged} enemies.` : "No enemies in range." };
        }
      }
    ]
  },

  catapult: {
    name: "Catapult",
    cost: 6,
    hp: 10,
    attack: 5,
    range: 4,
    move: 1,
    symbol: "🗿",
    canCrossWater: false,
    canFly: false,
    description: "Long range siege unit. Weak in close combat.",
    abilities: [
      {
        name: "Siege",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // powerful attack: +3 attack this turn
          unit.tempAttack = (unit.tempAttack || 0) + 3;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Siege ready: +3 attack this turn." };
        }
      },
      {
        name: "Demolish",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState) return { msg: "Invalid game state." };
          
          // Destroy walls in a 2-tile radius
          let destroyed = 0;
          const range = 2;
          const wallsToRemove = [];
          
          for (let x = unit.x - range; x <= unit.x + range; x++) {
            for (let y = unit.y - range; y <= unit.y + range; y++) {
              const dist = Math.abs(x - unit.x) + Math.abs(y - unit.y);
              if (dist <= range) {
                const wallIndex = (gameState.walls || []).findIndex(w => w.x === x && w.y === y);
                if (wallIndex !== -1) {
                  wallsToRemove.push(wallIndex);
                  destroyed++;
                }
              }
            }
          }
          
          // Remove walls in reverse order to maintain indices
          wallsToRemove.sort((a, b) => b - a);
          for (const index of wallsToRemove) {
            gameState.walls.splice(index, 1);
          }
          
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: destroyed ? `Demolished ${destroyed} walls in range.` : "No walls in demolition range." };
        }
      }
    ]
  },

  mage: {
    name: "Mage",
    cost: 5,
    hp: 7,
    attack: 2,
    range: 3,
    move: 2,
    symbol: "🔮",
    canCrossWater: false,
    canFly: false,
    description: "Spellcaster with freeze ability and moderate range.",
    abilities: [
      {
        name: "Freeze",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Set freeze flag for next attack
          unit.freezeNext = true;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: "Next attack will freeze the target." };
        }
      },
      {
        name: "Teleport",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          // Mage can teleport to any unoccupied tile within 3 spaces
          unit.teleportReady = true;
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          
          // Highlight valid teleport locations
          if (typeof clearHighlights === 'function') clearHighlights();
          const range = 3;
          for (let x = Math.max(0, unit.x - range); x <= Math.min(10, unit.x + range); x++) {
            for (let y = Math.max(0, unit.y - range); y <= Math.min(10, unit.y + range); y++) {
              const dist = Math.abs(x - unit.x) + Math.abs(y - unit.y);
              if (dist <= range && dist > 0) {
                // Check if tile is free (no units, not blocked)
                const hasUnit = gameState.units && gameState.units.some(u => u.x === x && u.y === y);
                const isBlocked = (typeof isWallAt === 'function' && isWallAt(x, y)) ||
                                (typeof isHeartAt === 'function' && isHeartAt(x, y)) ||
                                (typeof isMountainAt === 'function' && isMountainAt(x, y));
                                
                if (!hasUnit && !isBlocked) {
                  const cell = typeof getCell === 'function' ? getCell(x, y) : null;
                  if (cell) cell.classList.add('highlight-move');
                }
              }
            }
          }
          
          return { msg: "Teleport ready: click any highlighted tile within 3 spaces." };
        }
      },
      {
        name: "Fireball",
        action(unit, gameState) {
          if (!unit || unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (!gameState || !Array.isArray(gameState.units)) return { msg: "Invalid game state." };
          
          // Area damage spell - damages all enemies within 2 tiles
          let damaged = 0;
          for (const enemy of gameState.units) {
            if (enemy.owner === unit.owner) continue;
            const dist = Math.abs(enemy.x - unit.x) + Math.abs(enemy.y - unit.y);
            if (dist <= 2) {
              const damage = enemy.shielded ? 0 : 3;
              if (enemy.shielded) {
                enemy.shielded = false;
              } else {
                enemy.hp = Math.max(0, enemy.hp - damage);
              }
              damaged++;
            }
          }
          
          // Remove dead units
          gameState.units = gameState.units.filter(u => u.hp > 0);
          
          unit.actionsLeft = Math.max(0, (unit.actionsLeft || 0) - 1);
          return { msg: damaged ? `Fireball hit ${damaged} enemies for 3 damage each.` : "No enemies in range." };
        }
      }
    ]
  }
};

// Expose UNIT_TYPES globally (expected by game.js)
window.UNIT_TYPES = UNIT_TYPES;