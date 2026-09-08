/** Utilitários compartilhados pelos testes. */

import { computeAdjacency, createGame, Status } from '../src/js/engine.js';

/**
 * Monta uma partida a partir de um mapa em texto, com as minas já posicionadas.
 * Use `*` para mina e qualquer outro caractere para célula livre.
 *
 * @param {string[]} map linhas do tabuleiro
 * @param {object} [options]
 */
export function gameFromMap(map, options = {}) {
  const rows = map.length;
  const cols = map[0].length;
  const flat = map.join('');
  const mineCount = [...flat].filter((ch) => ch === '*').length;
  const game = createGame({ rows, cols, mines: mineCount, seed: 1, ...options });
  game.mines = Uint8Array.from(flat, (ch) => (ch === '*' ? 1 : 0));
  game.adjacent = computeAdjacency(game.mines, game.neighbors);
  game.placed = true;
  game.status = Status.PLAYING;
  game.startedAt = 0;
  return game;
}

/** Índice achatado a partir de linha/coluna 0-indexadas. */
export const at = (game, row, col) => row * game.cols + col;
