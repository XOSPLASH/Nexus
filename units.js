// units.js
// Unit definitions for Nexus. Exports window.UNIT_TYPES and window.UNIT_MAP
// Each unit has up to two abilities. Abilities with `action` functions
// are defensive: they attempt to use the game's public API if available,
// and return an object like { changed: true/false, msg: "..." }.

/* Example usage from game code:
   const defs = window.UNIT_TYPES;
   const soldierDef = defs['soldier'];
   // When using active ability it's invoked as: def.abilities[0].action(unit, api)
*/

(function(){
  'use strict';

  const unitList = {
    // basic melee soldier
    soldier: {
      id: 'soldier',
      name: 'Soldier',
      symbol: '⚔',
      description: 'Reliable frontline infantry. Cheap and versatile.',
      cost: 3,
      hp: 6,
      atk: 2,
      range: 1,
      move: 2,
      // abilities: 1 active, 1 passive
      abilities: [
        {
          name: 'Charge',
          type: 'active',
          text: 'Move up to 1 tile and immediately attack an adjacent enemy.',
          // action: tries to find an adjacent enemy and attack using api.attackUnit(attacker, tx, ty)
          action: function(unit, api){
            try {
              if (!api) return { changed:false, msg: 'Game API unavailable.' };
              // try multiple api names for compatibility
              const state = api.getState ? api.getState() : (api.getPublicState ? api.getPublicState() : (window.__nexus_game && window.__nexus_game.state));
              if (!state) return { changed:false, msg: 'State unavailable.' };
              // some engines expose a flat units array, others expose board; try to locate unit list
              let enemies = [];
              if (state.units && Array.isArray(state.units)) {
                enemies = state.units;
              } else if (state.board) {
                for (let yy=0; yy<state.board.length; yy++){
                  for (let xx=0; xx<state.board[yy].length; xx++){
                    const c = state.board[yy][xx];
                    if (c && c.unit) enemies.push(c.unit);
                  }
                }
              }
              const adj = enemies.find(e => e && e.owner !== unit.owner && Math.abs(e.x - unit.x) + Math.abs(e.y - unit.y) === 1);
              if (adj) {
                // attack via several possible API names
                if (api.attackUnit) {
                  api.attackUnit(unit, adj.x, adj.y);
                  return { changed:true, msg: 'Charged and attacked.' };
                } else if (api.attackAt) {
                  api.attackAt(unit, adj.x, adj.y);
                  return { changed:true, msg: 'Charged and attacked.' };
                } else if (window.__nexus_game && window.__nexus_game.attackAt) {
                  window.__nexus_game.attackAt(unit, adj.x, adj.y);
                  return { changed:true, msg: 'Charged and attacked.' };
                } else if (window.__nexus_game && window.__nexus_game.attackUnit) {
                  window.__nexus_game.attackUnit(unit, adj.x, adj.y);
                  return { changed:true, msg: 'Charged and attacked.' };
                } else {
                  return { changed:false, msg:'Attack API missing.' };
                }
              } else {
                return { changed:false, msg:'No adjacent enemy to charge.' };
              }
            } catch (e) {
              console.error('Charge ability error', e);
              return { changed:false, msg:'Ability failed.' };
            }
          }
        },
        {
          name: 'Resolute',
          type: 'passive',
          text: 'Takes slightly less damage from non-crit hits.',
        }
      ]
    },

    // ranged unit
    archer: {
      id: 'archer',
      name: 'Archer',
      symbol: '🏹',
      description: 'Ranged unit. Best at keeping enemies at distance.',
      cost: 4,
      hp: 4,
      atk: 2,
      range: 3,
      move: 2,
      abilities: [
        {
          name: 'Volley',
          type: 'active',
          text: 'Shoot the nearest enemy within range.',
          action: function(unit, api){
            try {
              if (!api) return {changed:false, msg:'Game API unavailable.'};
              const state = api.getState ? api.getState() : (api.getPublicState ? api.getPublicState() : (window.__nexus_game && window.__nexus_game.state));
              if (!state) return {changed:false, msg:'State unavailable.'};
              let enemies = [];
              if (state.units && Array.isArray(state.units)) {
                enemies = state.units;
              } else if (state.board) {
                for (let yy=0; yy<state.board.length; yy++){
                  for (let xx=0; xx<state.board[yy].length; xx++){
                    const c = state.board[yy][xx];
                    if (c && c.unit) enemies.push(c.unit);
                  }
                }
              }
              enemies.sort((a,b) => (Math.abs(a.x-unit.x)+Math.abs(a.y-unit.y)) - (Math.abs(b.x-unit.x)+Math.abs(b.y-unit.y)));
              const target = enemies.find(e => Math.abs(e.x-unit.x) + Math.abs(e.y-unit.y) <= (unit.range || 3));
              if (!target) return {changed:false, msg:'No target in range.'};
              if (api.attackUnit) {
                api.attackUnit(unit, target.x, target.y);
                return {changed:true, msg:'Volley fired.'};
              } else if (api.attackAt) {
                api.attackAt(unit, target.x, target.y);
                return {changed:true, msg:'Volley fired.'};
              } else if (window.__nexus_game && window.__nexus_game.attackAt) {
                window.__nexus_game.attackAt(unit, target.x, target.y);
                return {changed:true, msg:'Volley fired.'};
              } else {
                return {changed:false, msg:'Attack API missing.'};
              }
            } catch(e) {
              console.error('Volley error', e);
              return {changed:false, msg:'Ability failed.'};
            }
          }
        },
        {
          name: 'Eagle Eye',
          type: 'passive',
          text: 'Ignores a small part of enemy defense.',
        }
      ]
    },

    // builder who can create small bridges (represented as special "bridge" tile entries if the game API supports it)
    builder: {
      id: 'builder',
      name: 'Builder',
      symbol: '🔧',
      description: 'Can construct small bridges to cross water.',
      cost: 5,
      hp: 5,
      atk: 1,
      range: 1,
      move: 2,
      abilities: [
        {
          name: 'Build Bridge',
          type: 'active',
          text: 'Create a bridge on an adjacent water tile (if supported).',
          action: function(unit, api){
            try {
              if (!api) return {changed:false, msg:'Game API unavailable.'};
              const state = api.getState ? api.getState() : (api.getPublicState ? api.getPublicState() : (window.__nexus_game && window.__nexus_game.state));
              if (!state) return {changed:false, msg:'State unavailable.'};
              // find adjacent water tile
              const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
              for (const [dx,dy] of dirs) {
                const nx = unit.x + dx, ny = unit.y + dy;
                const inb = state.board && state.board[ny] && state.board[ny][nx];
                if (inb && state.board[ny][nx].terrain === 'water') {
                  // try to place a bridge using a game API if provided
                  // prefer a dedicated API function (api.placeBridge) else attempt placeUnit of a 'bridge' def
                  if (typeof api.placeBridge === 'function') {
                    api.placeBridge(nx, ny);
                    if (api.updateUI) api.updateUI();
                    return {changed:true, msg:'Bridge built.'};
                  }
                  // try placeUnit of a def named 'bridge' (game can implement that unit-to-terrain mapping)
                  if (api.placeUnit) {
                    const ok = api.placeUnit('bridge', nx, ny);
                    if (ok !== false) {
                      if (api.updateUI) api.updateUI();
                      return {changed:true, msg:'Bridge built.'};
                    }
                  }
                  // fallback: modify board directly if available (last resort)
                  if (window.__nexus_game && window.__nexus_game.state && window.__nexus_game.state.board) {
                    window.__nexus_game.state.board[ny][nx].terrain = 'bridge';
                    if (api.updateUI) api.updateUI();
                    return {changed:true, msg:'Bridge created (direct state change).'};
                  }
                  return {changed:false, msg:'Bridge creation not supported by game API.'};
                }
              }
              return {changed:false, msg:'No adjacent water to build bridge.'};
            } catch(e) {
              console.error('Build Bridge error', e);
              return {changed:false, msg:'Ability failed.'};
            }
          }
        },
        {
          name: 'Handy',
          type: 'passive',
          text: 'Builds and repair more efficiently (flavor).'
        }
      ]
    },

    // naval unit (must be placed on water)
    naval: {
      id: 'naval',
      name: 'Gunship',
      symbol: '⛵',
      description: 'Naval craft — must be placed on water. Strong movement on water.',
      cost: 6,
      hp: 7,
      atk: 3,
      range: 2,
      move: 3,
      waterOnly: true,
      abilities: [
        {
          name: 'Bombard',
          type: 'active',
          text: 'Strike a target within 2 tiles from water.',
          action: function(unit, api){
            try {
              if (!api) return {changed:false, msg:'Game API unavailable.'};
              const state = api.getState ? api.getState() : (api.getPublicState ? api.getPublicState() : (window.__nexus_game && window.__nexus_game.state));
              if (!state) return {changed:false, msg:'State unavailable.'};
              let enemies = [];
              if (state.units && Array.isArray(state.units)) {
                enemies = state.units;
              } else if (state.board) {
                for (let yy=0; yy<state.board.length; yy++){
                  for (let xx=0; xx<state.board[yy].length; xx++){
                    const c = state.board[yy][xx];
                    if (c && c.unit) enemies.push(c.unit);
                  }
                }
              }
              enemies.sort((a,b)=> (Math.abs(a.x-unit.x)+Math.abs(a.y-unit.y)) - (Math.abs(b.x-unit.x)+Math.abs(b.y-unit.y)));
              const target = enemies.find(e => Math.abs(e.x-unit.x) + Math.abs(e.y-unit.y) <= (unit.range || 2));
              if (!target) return {changed:false, msg:'No target in range.'};
              if (api.attackUnit) { api.attackUnit(unit, target.x, target.y); return {changed:true, msg:'Bombardment!' }; }
              if (api.attackAt) { api.attackAt(unit, target.x, target.y); return {changed:true, msg:'Bombardment!' }; }
              if (window.__nexus_game && window.__nexus_game.attackAt) { window.__nexus_game.attackAt(unit, target.x, target.y); return {changed:true, msg:'Bombardment!' }; }
              return {changed:false, msg:'Attack API missing.'};
            } catch(e){
              console.error('Bombard error', e); return {changed:false, msg:'Ability failed.'};
            }
          }
        },
        {
          name: 'Seaborne',
          type: 'passive',
          text: 'Excellent movement on water.'
        }
      ]
    },

    // healer
    medic: {
      id: 'medic',
      name: 'Medic',
      symbol: '✚',
      description: 'Heals adjacent friendly units.',
      cost: 5,
      hp: 5,
      atk: 1,
      range: 1,
      move: 2,
      abilities: [
        {
          name: 'Heal',
          type: 'active',
          text: 'Restore 3 HP to an adjacent friendly unit.',
          action: function(unit, api){
            try {
              if (!api) return {changed:false, msg:'Game API unavailable.'};
              const state = api.getState ? api.getState() : (api.getPublicState ? api.getPublicState() : (window.__nexus_game && window.__nexus_game.state));
              if (!state) return {changed:false, msg:'State unavailable.'};
              // gather allies from possible structures
              let allies = [];
              if (state.units && Array.isArray(state.units)) {
                allies = state.units.filter(u=>u && u.owner === unit.owner && (Math.abs(u.x-unit.x)+Math.abs(u.y-unit.y) === 1));
              } else if (state.board) {
                for (let yy=0; yy<state.board.length; yy++){
                  for (let xx=0; xx<state.board[yy].length; xx++){
                    const c = state.board[yy][xx];
                    if (c && c.unit && c.unit.owner === unit.owner && (Math.abs(c.x-unit.x)+Math.abs(c.y-unit.y) === 1)) allies.push(c.unit);
                  }
                }
              }
              if (!allies.length) return {changed:false, msg:'No adjacent ally to heal.'};
              const target = allies[0];
              // Try to modify via API (if present)
              if (typeof api.modifyUnitHp === 'function') {
                api.modifyUnitHp(target, +3);
                if (api.updateUI) api.updateUI();
                return {changed:true, msg:'Healed ally.'};
              }
              // fallback: direct state mutation (best-effort)
              if (window.__nexus_game && window.__nexus_game.state) {
                const s = window.__nexus_game.state;
                // find live unit instance on s.board
                for (let yy=0; yy<s.board.length; yy++){
                  for (let xx=0; xx<s.board[yy].length; xx++){
                    const c = s.board[yy][xx];
                    if (c && c.unit && c.unit.id === target.id) {
                      c.unit.hp = (c.unit.hp || 0) + 3;
                      if (api.updateUI) api.updateUI();
                      return {changed:true, msg:'Healed ally (direct).'};
                    }
                  }
                }
              }
              return {changed:false, msg:'Heal API not supported.'};
            } catch(e){
              console.error('Heal error', e); return {changed:false, msg:'Ability failed.'};
            }
          }
        },
        {
          name: 'Tender',
          type: 'passive',
          text: 'Heals are slightly more effective (flavor).'
        }
      ]
    },

    // scout: cheap fast unit
    scout: {
      id: 'scout',
      name: 'Scout',
      symbol: '🔎',
      description: 'Fast mover. Useful for capturing objectives and scouting.',
      cost: 2,
      hp: 3,
      atk: 1,
      range: 1,
      move: 4,
      abilities: [
        {
          name: 'Dash',
          type: 'active',
          text: 'Move 2 extra tiles this turn (consumes action).',
          action: function(unit, api){
            // This ability is intended to be handled by game.js (modify unit.move or actionsLeft).
            // Here we just return a message if API cannot do it.
            if (!api) return {changed:false, msg:'Game API unavailable.'};
            if (typeof api.boostMove === 'function') {
              api.boostMove(unit, 2);
              if (api.updateUI) api.updateUI();
              return {changed:true, msg:'DASH! (move boosted)'};
            }
            return {changed:false, msg:'Dash not supported by API.'};
          }
        },
        {
          name: 'Light Foot',
          type: 'passive',
          text: 'Harder to hit in open terrain.'
        }
      ]
    },

    // tank: slow, high hp/atk
    tank: {
      id: 'tank',
      name: 'Tank',
      symbol: '⛨',
      description: 'Armored unit. Slow but hits hard and soaks damage.',
      cost: 8,
      hp: 12,
      atk: 4,
      range: 1,
      move: 1,
      abilities: [
        {
          name: 'Overrun',
          type: 'active',
          text: 'Push and hit a target tile (flavor).',
          action: function(unit, api){
            // simplified: attempt to attack nearest enemy
            try {
              if (!api) return {changed:false, msg:'Game API unavailable.'};
              const state = api.getState ? api.getState() : (api.getPublicState ? api.getPublicState() : (window.__nexus_game && window.__nexus_game.state));
              if (!state) return {changed:false, msg:'State unavailable.'};
              let enemies = [];
              if (state.units && Array.isArray(state.units)) enemies = state.units;
              else if (state.board) {
                for (let yy=0; yy<state.board.length; yy++){
                  for (let xx=0; xx<state.board[yy].length; xx++){
                    const c = state.board[yy][xx];
                    if (c && c.unit) enemies.push(c.unit);
                  }
                }
              }
              enemies = enemies.filter(u=>u && u.owner !== unit.owner);
              if (!enemies.length) return {changed:false, msg:'No enemies.'};
              enemies.sort((a,b)=> (Math.abs(a.x-unit.x)+Math.abs(a.y-unit.y)) - (Math.abs(b.x-unit.x)+Math.abs(b.y-unit.y)));
              const target = enemies[0];
              if (api.attackUnit) { api.attackUnit(unit, target.x, target.y); return {changed:true, msg:'Overrun!'} }
              if (api.attackAt) { api.attackAt(unit, target.x, target.y); return {changed:true, msg:'Overrun!'} }
              if (window.__nexus_game && window.__nexus_game.attackAt) { window.__nexus_game.attackAt(unit, target.x, target.y); return {changed:true, msg:'Overrun!'} }
              return {changed:false, msg:'Attack API missing.'};
            } catch(e){ console.error('Overrun error',e); return {changed:false, msg:'Ability failed.'}; }
          }
        },
        {
          name: 'Bulwark',
          type: 'passive',
          text: 'Reduces incoming damage (flavor).'
        }
      ]
    },

    // shadow unit (user mentioned adding shadow realm earlier)
    shadow: {
      id: 'shadow',
      name: 'Shade',
      symbol: '☽',
      description: 'Units from the shadow realm. Special mechanics can be added.',
      cost: 7,
      hp: 5,
      atk: 3,
      range: 1,
      move: 3,
      abilities: [
        {
          name: 'Vanish',
          type: 'active',
          text: 'Become hidden for a single turn (requires engine support).',
          action: function(unit, api){
            if (!api) return {changed:false, msg:'Game API unavailable.'};
            if (typeof api.setUnitFlag === 'function') {
              api.setUnitFlag(unit, 'hidden', 1);
              if (api.updateUI) api.updateUI();
              return {changed:true, msg:'Unit vanished.'};
            }
            if (window.__nexus_game && window.__nexus_game.state) {
              // best-effort: set a flag on the live unit instance
              const s = window.__nexus_game.state;
              for (let yy=0; yy<s.board.length; yy++){
                for (let xx=0; xx<s.board[yy].length; xx++){
                  const c = s.board[yy][xx];
                  if (c && c.unit && c.unit.id === unit.id) {
                    c.unit._hidden = 1;
                    if (api.updateUI) api.updateUI();
                    return {changed:true, msg:'Vanish (direct).'};
                  }
                }
              }
            }
            return {changed:false, msg:'Vanish not supported.'};
          }
        },
        {
          name: 'Nightstalker',
          type: 'passive',
          text: 'Stronger when adjacent to other shadow units.'
        }
      ]
    },

    // wolf (summon-only, not shown in shop)
    wolf: {
      id: 'wolf',
      name: 'Wolf',
      symbol: '🐺',
      description: 'A summoned beast. Not available in shop.',
      cost: 0,
      hp: 3,
      atk: 2,
      range: 1,
      move: 3,
      summonOnly: true, // do not include in shop
      abilities: [
        {
          name: 'Feral',
          type: 'passive',
          text: 'Attacks with ferocity.'
        }
      ]
    },

    // bridge placeholder (not in shop) - some abilities try to place this
    bridge: {
      id: 'bridge',
      name: 'Bridge',
      symbol: '⛩',
      description: 'A constructed bridge tile — normally not a purchasable unit.',
      cost: 0,
      hp: 999,
      atk: 0,
      range: 0,
      move: 0,
      isTerrain: true,
      summonOnly: true,
      abilities: []
    }
  };

  // expose maps in two friendly ways
  window.UNIT_TYPES = window.UNIT_TYPES || unitList;
  window.UNIT_MAP = window.UNIT_MAP || unitList;
})();
