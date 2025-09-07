// spawner.js – spawner ownership & helper logic for Nexus
(function(){
  'use strict';

  /**
   * Check whether a player can spawn at (x,y) on the given state.
   * Rule: tile must be empty and adjacent (8 dirs) to a spawner owned by the player.
   * Neutral spawners (owner === null) do NOT permit spawning until captured.
   */
  function canSpawnAt(state, x, y, player) {
    if (!state || !state.board) return false;
    const BOARD_SIZE = state.board.length;
    if (y < 0 || y >= BOARD_SIZE || x < 0 || x >= BOARD_SIZE) return false;
    const cell = state.board[y][x];
    if (!cell || cell.unit) return false;

    for (let sy = 0; sy < BOARD_SIZE; sy++) {
      for (let sx = 0; sx < BOARD_SIZE; sx++) {
        const s = state.board[sy][sx];
        if (s && s.spawner) {
          // only allow if spawner is owned by this player
          if (s.spawner.owner === player) {
            if (Math.abs(sx - x) <= 1 && Math.abs(sy - y) <= 1) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  /**
   * Capture spawners when a unit is standing on them at end of turn.
   * If a unit stands on a spawner and its owner differs, the spawner flips to that unit's owner.
   */
  function captureSpawners(state) {
    if (!state || !state.board) return;
    const BOARD_SIZE = state.board.length;
    for (let y=0;y<BOARD_SIZE;y++){
      for (let x=0;x<BOARD_SIZE;x++){
        const c = state.board[y][x];
        if (c && c.spawner && c.unit) {
          if (c.spawner.owner !== c.unit.owner) {
            c.spawner.owner = c.unit.owner;
          }
        }
      }
    }
  }

  window.NexusSpawners = window.NexusSpawners || {};
  window.NexusSpawners.canSpawnAt = canSpawnAt;
  window.NexusSpawners.captureSpawners = captureSpawners;
})();
