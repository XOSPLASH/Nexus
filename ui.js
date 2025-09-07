// ui.js — improved spawn-highlight + UI helpers for Nexus
(function () {
  'use strict';

  const gridEl = document.getElementById('grid') || document.querySelector('.grid');
  const shopListEl = document.getElementById('shop-list') || document.getElementById('shop-groups') || document.querySelector('.shop-list');

  function getGameState() {
    return (window.__nexus_game && window.__nexus_game.state) ? window.__nexus_game.state : null;
  }

  function clearSpawnHighlights() {
    if (!gridEl) return;
    gridEl.querySelectorAll('.highlight-overlay.spawn-highlight').forEach(el => el.remove());
  }

  function addSpawnOverlayAt(x, y) {
    if (!gridEl) return;
    const state = getGameState();
    if (!state) return;
    const BOARD_SIZE = state.board.length;
    if (! (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) ) return;
    const idx = y * BOARD_SIZE + x;
    const cellEl = gridEl.children[idx];
    if (!cellEl) return;
    if (cellEl.querySelector('.highlight-overlay.spawn-highlight')) return;
    const overlay = document.createElement('div');
    overlay.className = 'highlight-overlay spawn-highlight';
    cellEl.appendChild(overlay);
  }

  // Uses NexusSpawners.canSpawnAt when available (preferred)
  function canSpawnAtWrapper(x, y, owner) {
    const state = getGameState();
    if (!state) return false;
    if (window.NexusSpawners && typeof window.NexusSpawners.canSpawnAt === 'function') {
      return window.NexusSpawners.canSpawnAt(state, x, y, owner);
    }
    // fallback: simple local check (same as older logic)
    for (let sy=0; sy<state.board.length; sy++){
      for (let sx=0; sx<state.board.length; sx++){
        const s = state.board[sy][sx];
        if (s && s.spawner && s.spawner.owner === owner) {
          if (Math.abs(sx - x) <= 1 && Math.abs(sy - y) <= 1) return true;
        }
      }
    }
    return false;
  }

  function terrainAllowsPlacement(def, cell) {
    if (!def || !cell) return false;
    if (def.waterOnly) return (cell.terrain === 'water' || cell.terrain === 'bridge');
    if (!def.waterOnly && cell.terrain === 'water') return false;
    if (cell.terrain === 'mountain' && !def.canClimbMountain) return false;
    return true;
  }

  function highlightSpawnableTiles(def, player) {
    clearSpawnHighlights();
    const state = getGameState();
    if (!state || !def) return;
    const BOARD_SIZE = state.board.length;
    for (let y = 0; y < BOARD_SIZE; y++) {
      for (let x = 0; x < BOARD_SIZE; x++) {
        const cell = state.board[y][x];
        if (cell.unit) continue;
        if (!canSpawnAtWrapper(x, y, player)) continue;
        if (!terrainAllowsPlacement(def, cell)) continue;
        addSpawnOverlayAt(x, y);
      }
    }
  }

  function refreshSpawnHighlightsIfPending() {
    const state = getGameState();
    if (!state) return;
    const pick = state.pendingShopSelection && state.pendingShopSelection[state.currentPlayer];
    if (!pick || !pick.def) { clearSpawnHighlights(); return; }
    highlightSpawnableTiles(pick.def, state.currentPlayer);
  }

  if (shopListEl) {
    shopListEl.addEventListener('click', (ev) => {
      const item = ev.target.closest('.shop-item');
      if (!item) return;
      const defKey = item.dataset.defKey;
      const def = (window.UNIT_TYPES && window.UNIT_TYPES[defKey]) || (window.UNIT_MAP && window.UNIT_MAP[defKey]);
      const state = getGameState();
      const player = state ? state.currentPlayer : 1;
      if (def) highlightSpawnableTiles(def, player);
      else clearSpawnHighlights();
    });
  }

  if (gridEl) {
    gridEl.addEventListener('click', (ev) => {
      setTimeout(() => refreshSpawnHighlightsIfPending(), 60);
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearSpawnHighlights();
  });

  window.__nexus_ui = window.__nexus_ui || {};
  window.__nexus_ui.highlightSpawnableTiles = highlightSpawnableTiles;
  window.__nexus_ui.clearSpawnHighlights = clearSpawnHighlights;
  window.__nexus_ui.refreshSpawnHighlightsIfPending = refreshSpawnHighlightsIfPending;

  setTimeout(() => refreshSpawnHighlightsIfPending(), 150);

})();
