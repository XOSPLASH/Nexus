// units.js
// Unit templates and per-unit ability implementations.
// Each ability takes (unit, gameState) and MUST consume 1 action by decrementing unit.actionsLeft.

const UNIT_TYPES = {
  scout: {
    name: "Scout",
    category: "Basic",
    description: "Fast recon unit with vision abilities.",
    cost: 2,
    hp: 10,
    attack: 3,
    range: 2,
    move: 3,
    symbol: "👁️",
    canAttackOverWalls: false,
    abilities: [
      {
        name: "Sprint (+1 move this turn)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.tempMove = (unit.tempMove || 0) + 1;
          unit.actionsLeft--;
          return { msg: "Sprint: +1 move this turn." };
        }
      },
      {
        name: "Reveal (show enemy positions)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          const enemies = gameState.units.filter(u => u.owner !== unit.owner);
          enemies.forEach(e => e.revealed = true);
          unit.actionsLeft--;
          return { msg: "Revealed all enemy positions!" };
        }
      }
    ]
  },

  warrior: {
    name: "Warrior",
    category: "Basic",
    description: "Strong melee fighter, good for frontline battles.",
    cost: 4,
    hp: 16,
    attack: 6,
    range: 1,
    move: 2,
    symbol: "⚔️",
    canAttackOverWalls: false,
    abilities: [
      {
        name: "Fortify (+4 HP)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.hp = Math.min(unit.hp + 4, UNIT_TYPES[unit.type].hp);
          unit.actionsLeft--;
          return { msg: "Fortify: healed +4 HP." };
        }
      },
      {
        name: "Charge (move+attack)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.tempMove = (unit.tempMove || 0) + 2;
          unit.tempAttack = (unit.tempAttack || 0) + 2;
          unit.actionsLeft--;
          return { msg: "Charge: +2 move and +2 attack this turn!" };
        }
      }
    ]
  },

  archer: {
    name: "Archer",
    category: "Basic",
    description: "Ranged attacker that can shoot over walls.",
    cost: 3,
    hp: 12,
    attack: 5,
    range: 3,
    move: 2,
    symbol: "🏹",
    canAttackOverWalls: true,
    abilities: [
      {
        name: "Pierce (+1 range)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.rangeBoost = (unit.rangeBoost || 0) + 1;
          unit.actionsLeft--;
          return { msg: "Pierce: +1 range this turn." };
        }
      },
      {
        name: "Volley (area damage)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          const enemies = gameState.units.filter(u => u.owner !== unit.owner);
          let hits = 0;
          enemies.forEach(e => {
            const dist = Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y);
            if (dist <= unit.range + (unit.rangeBoost || 0)) {
              e.hp -= 2;
              hits++;
            }
          });
          gameState.units = gameState.units.filter(u => u.hp > 0);
          unit.actionsLeft--;
          return { msg: `Volley hit ${hits} enemies for 2 damage each!` };
        }
      }
    ]
  },

  sniper: {
    name: "Sniper",
    category: "Advanced",
    description: "High damage, long range specialist.",
    cost: 5,
    hp: 9,
    attack: 9,
    range: 4,
    move: 1,
    symbol: "🎯",
    canAttackOverWalls: true,
    abilities: [
      {
        name: "Focus (+4 next attack)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.tempAttack = (unit.tempAttack || 0) + 4;
          unit.actionsLeft--;
          return { msg: "Focus: +4 next attack." };
        }
      },
      {
        name: "Headshot (instant kill <5 HP)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.headshotActive = true;
          unit.actionsLeft--;
          return { msg: "Headshot ready! Next attack on low HP enemy is instant kill." };
        }
      }
    ]
  },

  tank: {
    name: "Tank",
    category: "Advanced",
    description: "Heavy armor, can block attacks and repair.",
    cost: 6,
    hp: 22,
    attack: 8,
    range: 1,
    move: 1,
    symbol: "🛡️",
    canBreakWalls: true,
    abilities: [
      {
        name: "Repair (+6 HP)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.hp = Math.min(unit.hp + 6, UNIT_TYPES[unit.type].hp);
          unit.actionsLeft--;
          return { msg: "Repair: +6 HP." };
        }
      },
      {
        name: "Shield Wall (block damage)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.shielded = true;
          unit.actionsLeft--;
          return { msg: "Shield Wall: next attack blocked!" };
        }
      }
    ]
  },

  builder: {
    name: "Builder",
    category: "Support",
    description: "Utility unit that can build/break walls and bridges.",
    cost: 3,
    hp: 10,
    attack: 2,
    range: 1,
    move: 2,
    symbol: "🔨",
    isBuilder: true,
    abilities: [
      {
        name: "Build Bridge",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          gameState.builderAction = 'bridge';
          unit.actionsLeft--;
          return { msg: "Builder: click adjacent water to build bridge." };
        }
      },
      {
        name: "Fortify Nexus (+5 HP to heart)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          const nexus = gameState.nexuses.find(n => n.x === unit.x && n.y === unit.y);
          if (nexus && nexus.owner === unit.owner) {
            if (unit.owner === 1) gameState.p1hp += 3;
            else gameState.p2hp += 3;
            unit.actionsLeft--;
            return { msg: "Fortified! +3 HP to your heart." };
          }
          unit.actionsLeft--;
          return { msg: "Must be on your nexus to fortify." };
        }
      }
    ]
  },

  mage: {
    name: "Mage",
    category: "Advanced",
    description: "Magic user with teleport and freeze powers.",
    cost: 5,
    hp: 11,
    attack: 4,
    range: 2,
    move: 2,
    symbol: "🧙",
    canAttackOverWalls: true,
    abilities: [
      {
        name: "Teleport (move anywhere)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.teleporting = true;
          unit.actionsLeft--;
          return { msg: "Click any empty tile to teleport!" };
        }
      },
      {
        name: "Freeze (stun enemy)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.freezeNext = true;
          unit.actionsLeft--;
          return { msg: "Next attack will freeze enemy for 1 turn!" };
        }
      }
    ]
  },

  assassin: {
    name: "Assassin",
    category: "Advanced",
    description: "Stealthy melee unit that excels at surprise attacks.",
    cost: 4,
    hp: 8,
    attack: 7,
    range: 1,
    move: 3,
    symbol: "🗡️",
    abilities: [
      {
        name: "Stealth (invisible 1 turn)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.invisible = true;
          unit.actionsLeft--;
          return { msg: "Invisible for this turn!" };
        }
      },
      {
        name: "Backstab (2x damage)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.backstabReady = true;
          unit.actionsLeft--;
          return { msg: "Next attack deals double damage!" };
        }
      }
    ]
  },

  cavalry: {
    name: "Cavalry",
    category: "Advanced",
    description: "Fast unit that can trample enemies and rally allies.",
    cost: 5,
    hp: 14,
    attack: 5,
    range: 1,
    move: 4,
    symbol: "🐴",
    abilities: [
      {
        name: "Trample (damage on move)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.trampling = true;
          unit.actionsLeft--;
          return { msg: "Next move deals 3 damage to adjacent enemies!" };
        }
      },
      {
        name: "Rally (boost allies)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          const allies = gameState.units.filter(u => u.owner === unit.owner && u.id !== unit.id);
          let boosted = 0;
          allies.forEach(a => {
            const dist = Math.abs(a.x - unit.x) + Math.abs(a.y - unit.y);
            if (dist <= 2) {
              a.tempAttack = (a.tempAttack || 0) + 2;
              a.tempMove = (a.tempMove || 0) + 1;
              boosted++;
            }
          });
          unit.actionsLeft--;
          return { msg: `Rally! Boosted ${boosted} nearby allies.` };
        }
      }
    ]
  },

  naval: {
    name: "Naval Unit",
    category: "Naval",
    description: "Water-only ship with bombard and transport abilities.",
    cost: 4,
    hp: 15,
    attack: 5,
    range: 2,
    move: 3,
    symbol: "⛵",
    waterOnly: true,
    abilities: [
      {
        name: "Bombardment (ranged AOE)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.bombardReady = true;
          unit.actionsLeft--;
          return { msg: "Click target for 3x3 bombardment (3 damage)!" };
        }
      },
      {
        name: "Transport (carry unit)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          if (unit.carrying) {
            const adj = getAdjacentTiles(unit.x, unit.y, gameState);
            const landTiles = adj.filter(t => !isWaterAt(t.x, t.y, gameState) && !unitAt(t.x, t.y));
            if (landTiles.length > 0) {
              const tile = landTiles[0];
              unit.carrying.x = tile.x;
              unit.carrying.y = tile.y;
              gameState.units.push(unit.carrying);
              delete unit.carrying;
              unit.actionsLeft--;
              return { msg: "Unit deployed!" };
            }
            return { msg: "No valid landing spot." };
          }
          unit.transportMode = true;
          unit.actionsLeft--;
          return { msg: "Click adjacent ally to transport." };
        }
      }
    ]
  },

  healer: {
    name: "Healer",
    category: "Support",
    description: "Support unit that restores allies' health.",
    cost: 3,
    hp: 10,
    attack: 1,
    range: 2,
    move: 2,
    symbol: "💊",
    abilities: [
      {
        name: "Heal Ally (+5 HP)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          unit.healMode = true;
          unit.actionsLeft--;
          return { msg: "Click ally within range to heal." };
        }
      },
      {
        name: "Mass Heal (all allies +2)",
        action(unit, gameState) {
          if (unit.actionsLeft <= 0) return { msg: "No actions left." };
          const allies = gameState.units.filter(u => u.owner === unit.owner);
          allies.forEach(a => {
            const maxHp = UNIT_TYPES[a.type].hp;
            a.hp = Math.min(a.hp + 2, maxHp);
          });
          unit.actionsLeft--;
          return { msg: "Mass Heal restored +2 HP to all allies." };
        }
      }
    ]
  }
};
