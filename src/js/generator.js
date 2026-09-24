/**
 * Geração dos campos minados.
 *
 * Dois modos:
 *  - Clássico: minas sorteadas em qualquer lugar fora da área do primeiro clique.
 *  - Sem chute: sorteia repetidamente até encontrar um tabuleiro que o
 *    solucionador lógico consiga resolver do começo ao fim, ou seja, uma partida
 *    que nunca obriga o jogador a apostar. Se o orçamento acabar, devolve o
 *    tabuleiro clássico daquela semente com `solvable: false`, e a interface
 *    avisa que aquela partida pode exigir um palpite.
 *
 * O orçamento é medido em trabalho (tentativas × células), não em tempo, para
 * que a mesma semente dê o mesmo tabuleiro em qualquer aparelho — é isso que
 * sustenta o link compartilhado. Medido: até 24% de minas, todo sorteio acha um
 * tabuleiro sem chute bem antes do limite (o especialista, com 21%, em no máximo
 * ~100 tentativas); a partir de ~28% nenhum acha, por mais que se tente. O limite
 * serve para desistir cedo desses casos sem saída.
 *
 * O relógio continua existindo, mas só como rede de segurança para aparelhos
 * muito lentos. Quando desiste, por qualquer motivo, o gerador devolve o
 * primeiro sorteio — que só depende da semente —, nunca "o último que coube no
 * tempo", que dependeria da velocidade do aparelho.
 */

import { computeAdjacency } from './board.js';
import { solveFrom } from './solver.js';

const DEFAULT_MAX_WORK = 3_000_000;
const DEFAULT_MAX_ATTEMPTS = 30000;
const DEFAULT_BUDGET_MS = 2500;

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
 * @param {number} [params.maxWork] orçamento em células sorteadas e resolvidas
 *   (tentativas × células) — o limite determinístico
 * @param {number} [params.maxAttempts]
 * @param {number} [params.budgetMs] rede de segurança para aparelhos lentos
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
  maxWork = DEFAULT_MAX_WORK,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
  budgetMs = DEFAULT_BUDGET_MS,
}) {
  const total = rows * cols;
  const zone = safeZone({ safeIndex, neighbors, total, mineCount, safeArea });
  const mines = new Uint8Array(total);

  if (!noGuess) {
    placeRandom({ total, mineCount, zone, random, mines });
    return { mines, solvable: false, attempts: 1 };
  }

  const limit = Math.max(1, Math.min(maxAttempts, Math.floor(maxWork / total)));
  const deadline = Date.now() + budgetMs;
  /** @type {Uint8Array|null} */
  let first = null;
  let attempts = 0;
  while (attempts < limit) {
    attempts++;
    placeRandom({ total, mineCount, zone, random, mines });
    // O primeiro sorteio é exatamente o tabuleiro do modo clássico para esta
    // semente: é o que devolvemos se desistirmos.
    if (first === null) first = mines.slice();
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
  return { mines: first, solvable: false, attempts };
}
