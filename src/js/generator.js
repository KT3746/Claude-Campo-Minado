/**
 * Geração dos campos minados.
 *
 * Dois modos:
 *  - Clássico: minas sorteadas em qualquer lugar fora da área do primeiro clique.
 *  - Sem chute: sorteia repetidamente até encontrar um tabuleiro que o
 *    solucionador lógico consiga resolver do começo ao fim, ou seja, uma partida
 *    que nunca obriga o jogador a apostar. Se o orçamento de tempo acabar,
 *    devolve o melhor tabuleiro sorteado com `solvable: false`, e a interface
 *    avisa que aquela partida pode exigir um palpite.
 */

import { computeAdjacency } from './board.js';
import { solveFrom } from './solver.js';

const DEFAULT_BUDGET_MS = 1200;
const DEFAULT_MAX_ATTEMPTS = 30000;

/**
 * Células proibidas para minas: o primeiro clique e, quando cabe, seus vizinhos
 * (assim a primeira jogada sempre abre uma clareira em vez de um número solitário).
 * @returns {Set<number>}
 */
export function safeZone({ safeIndex, neighbors, total, mineCount, safeArea }) {
  if (safeIndex < 0) return new Set();
  const zone = new Set([safeIndex]);
  if (!safeArea) return zone;
  const base = safeIndex * 8;
  const n = neighbors.counts[safeIndex];
  for (let k = 0; k < n; k++) zone.add(neighbors.offsets[base + k]);
  // Se não sobrarem células suficientes para as minas, encolhe para o clique.
  if (total - zone.size < mineCount) return new Set([safeIndex]);
  return zone;
}

/**
 * Sorteia uma distribuição de minas respeitando a zona segura.
 * Usa uma seleção parcial de Fisher-Yates: O(minas) trocas, sem embaralhar tudo.
 */
function placeRandom({ total, mineCount, zone, random, mines }) {
  mines.fill(0);
  const candidates = new Int32Array(total - zone.size);
  let c = 0;
  for (let i = 0; i < total; i++) {
    if (!zone.has(i)) candidates[c++] = i;
  }
  const limit = Math.min(mineCount, candidates.length);
  for (let i = 0; i < limit; i++) {
    const j = i + Math.floor(random() * (candidates.length - i));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
    mines[candidates[i]] = 1;
  }
  return mines;
}

/**
 * @param {object} params
 * @param {number} params.rows
 * @param {number} params.cols
 * @param {number} params.mineCount
 * @param {number} params.safeIndex índice do primeiro clique
 * @param {{offsets: Int32Array, counts: Uint8Array}} params.neighbors
 * @param {() => number} params.random
 * @param {boolean} [params.noGuess]
 * @param {boolean} [params.safeArea]
 * @param {number} [params.budgetMs]
 * @param {number} [params.maxAttempts]
 * @returns {{mines: Uint8Array, solvable: boolean, attempts: number}}
 */
export function generateMines({
  rows,
  cols,
  mineCount,
  safeIndex,
  neighbors,
  random,
  noGuess = false,
  safeArea = true,
  budgetMs = DEFAULT_BUDGET_MS,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
}) {
  const total = rows * cols;
  const zone = safeZone({ safeIndex, neighbors, total, mineCount, safeArea });
  const mines = new Uint8Array(total);

  if (!noGuess) {
    placeRandom({ total, mineCount, zone, random, mines });
    return { mines, solvable: false, attempts: 1 };
  }

  const deadline = Date.now() + budgetMs;
  let attempts = 0;
  while (attempts < maxAttempts) {
    attempts++;
    placeRandom({ total, mineCount, zone, random, mines });
    const adjacent = computeAdjacency(mines, neighbors);
    const { solvable } = solveFrom({
      mines,
      adjacent,
      neighbors,
      total,
      mineCount,
      start: safeIndex,
    });
    if (solvable) return { mines, solvable: true, attempts };
    // Checa o relógio a cada 32 tentativas: Date.now() é caro no laço quente.
    if ((attempts & 31) === 0 && Date.now() > deadline) break;
  }
  return { mines, solvable: false, attempts };
}
