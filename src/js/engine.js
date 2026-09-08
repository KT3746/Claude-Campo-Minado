/**
 * Motor do Campo Minado — lógica pura, sem qualquer dependência de DOM.
 *
 * O tabuleiro é representado por arrays tipados achatados (índice = linha * colunas + coluna),
 * o que mantém o custo de memória baixo e as varreduras rápidas mesmo em tabuleiros grandes.
 * Todas as operações devolvem a lista de células alteradas, para que a camada visual
 * atualize apenas o necessário em vez de redesenhar o tabuleiro inteiro.
 */

import { buildNeighborIndex, computeAdjacency } from './board.js';
import { generateMines } from './generator.js';
import { mulberry32, randomSeed } from './rng.js';

export { buildNeighborIndex, computeAdjacency };

/** Estado de uma célula. */
export const Cell = Object.freeze({
  HIDDEN: 0,
  REVEALED: 1,
  FLAGGED: 2,
  QUESTION: 3,
});

/** Estado da partida. */
export const Status = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
});

const MAX_DIMENSION = 60;

/**
 * Valida e normaliza uma configuração de dificuldade.
 * Lança `RangeError` com mensagem em português para entradas impossíveis.
 * @param {{rows:number, cols:number, mines:number}} config
 */
export function normalizeConfig({ rows, cols, mines }) {
  const r = Math.floor(Number(rows));
  const c = Math.floor(Number(cols));
  const m = Math.floor(Number(mines));
  if (!Number.isFinite(r) || !Number.isFinite(c) || !Number.isFinite(m)) {
    throw new RangeError('Dimensões e número de minas precisam ser numéricos.');
  }
  if (r < 2 || c < 2) throw new RangeError('O tabuleiro precisa ter ao menos 2 linhas e 2 colunas.');
  if (r > MAX_DIMENSION || c > MAX_DIMENSION) {
    throw new RangeError(`O tabuleiro não pode passar de ${MAX_DIMENSION} linhas ou colunas.`);
  }
  const total = r * c;
  if (m < 1) throw new RangeError('É preciso ao menos 1 mina.');
  if (m > total - 1) throw new RangeError('Precisa sobrar ao menos uma célula livre.');
  return { rows: r, cols: c, mines: m };
}

/**
 * Cria uma partida. As minas só são posicionadas na primeira revelação,
 * garantindo que o primeiro clique nunca exploda.
 *
 * @param {object} options
 * @param {number} options.rows
 * @param {number} options.cols
 * @param {number} options.mines
 * @param {number} [options.seed]
 * @param {boolean} [options.noGuess] gerar tabuleiro solúvel sem chute
 * @param {boolean} [options.safeFirstClick] primeira jogada abre uma área vazia
 */
export function createGame({ rows, cols, mines, seed, noGuess = false, safeFirstClick = true }) {
  const config = normalizeConfig({ rows, cols, mines });
  const total = config.rows * config.cols;
  const usedSeed = seed === undefined || seed === null ? randomSeed() : seed >>> 0;
  return {
    rows: config.rows,
    cols: config.cols,
    mineCount: config.mines,
    total,
    seed: usedSeed,
    noGuess,
    safeFirstClick,
    neighbors: buildNeighborIndex(config.rows, config.cols),
    mines: new Uint8Array(total),
    adjacent: new Uint8Array(total),
    cells: new Uint8Array(total),
    status: Status.READY,
    placed: false,
    guaranteedSolvable: false,
    generationAttempts: 0,
    revealedCount: 0,
    flagCount: 0,
    questionCount: 0,
    firstIndex: -1,
    explodedIndex: -1,
    startedAt: 0,
    finishedAt: 0,
  };
}

/** Converte índice achatado em coordenadas 1-indexadas (para leitores de tela). */
export function toCoords(game, index) {
  return { row: Math.floor(index / game.cols) + 1, col: (index % game.cols) + 1 };
}

/** Índice a partir de linha/coluna 0-indexadas, ou -1 fora do tabuleiro. */
export function toIndex(game, row, col) {
  if (row < 0 || col < 0 || row >= game.rows || col >= game.cols) return -1;
  return row * game.cols + col;
}

/** Minas restantes segundo as bandeiras colocadas (pode ser negativo). */
export function minesRemaining(game) {
  return game.mineCount - game.flagCount;
}

/** A partida terminou? */
export function isOver(game) {
  return game.status === Status.WON || game.status === Status.LOST;
}

function emptyResult(game) {
  return { changed: [], status: game.status, exploded: -1, invalid: [] };
}

function placeMinesFor(game, safeIndex) {
  const random = mulberry32(game.seed);
  const result = generateMines({
    rows: game.rows,
    cols: game.cols,
    mineCount: game.mineCount,
    safeIndex,
    neighbors: game.neighbors,
    random,
    noGuess: game.noGuess,
    safeArea: game.safeFirstClick,
  });
  game.mines = result.mines;
  game.adjacent = computeAdjacency(game.mines, game.neighbors);
  game.guaranteedSolvable = result.solvable;
  game.generationAttempts = result.attempts;
  game.placed = true;
  game.firstIndex = safeIndex;
}

/** Inunda a partir de `start`, revelando células vazias e suas bordas numeradas. */
function floodReveal(game, start, changed) {
  const queue = [start];
  game.cells[start] = Cell.REVEALED;
  game.revealedCount++;
  changed.push(start);
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head];
    if (game.adjacent[index] !== 0) continue;
    const base = index * 8;
    const n = game.neighbors.counts[index];
    for (let k = 0; k < n; k++) {
      const nb = game.neighbors.offsets[base + k];
      const state = game.cells[nb];
      if (state === Cell.REVEALED || state === Cell.FLAGGED) continue;
      if (state === Cell.QUESTION) game.questionCount--;
      game.cells[nb] = Cell.REVEALED;
      game.revealedCount++;
      changed.push(nb);
      queue.push(nb);
    }
  }
}

function finishAsLoss(game, index, changed) {
  game.status = Status.LOST;
  game.explodedIndex = index;
  game.finishedAt = now();
  game.cells[index] = Cell.REVEALED;
  changed.push(index);
  for (let i = 0; i < game.total; i++) {
    if (i === index) continue;
    const isMine = game.mines[i] === 1;
    const state = game.cells[i];
    if (isMine && state !== Cell.FLAGGED) {
      game.cells[i] = Cell.REVEALED;
      changed.push(i);
    } else if (!isMine && state === Cell.FLAGGED) {
      // bandeira errada: continua marcada, a interface a exibe riscada
      changed.push(i);
    }
  }
}

function finishAsWin(game, changed) {
  game.status = Status.WON;
  game.finishedAt = now();
  for (let i = 0; i < game.total; i++) {
    if (game.mines[i] && game.cells[i] !== Cell.FLAGGED) {
      if (game.cells[i] === Cell.QUESTION) game.questionCount--;
      game.cells[i] = Cell.FLAGGED;
      game.flagCount++;
      changed.push(i);
    }
  }
}

function checkWin(game, changed) {
  if (game.revealedCount === game.total - game.mineCount) finishAsWin(game, changed);
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Revela uma célula.
 * @returns {{changed:number[], status:string, exploded:number, invalid:number[]}}
 */
export function reveal(game, index) {
  if (isOver(game) || index < 0 || index >= game.total) return emptyResult(game);
  const state = game.cells[index];
  if (state === Cell.REVEALED || state === Cell.FLAGGED) return emptyResult(game);

  if (!game.placed) {
    placeMinesFor(game, index);
    game.status = Status.PLAYING;
    game.startedAt = now();
  }

  const changed = [];
  if (state === Cell.QUESTION) game.questionCount--;

  if (game.mines[index]) {
    finishAsLoss(game, index, changed);
    return { changed, status: game.status, exploded: index, invalid: [] };
  }

  floodReveal(game, index, changed);
  checkWin(game, changed);
  return { changed, status: game.status, exploded: -1, invalid: [] };
}

/**
 * Alterna bandeira (e interrogação, se habilitada) em uma célula oculta.
 * @param {object} game
 * @param {number} index
 * @param {{allowQuestion?: boolean}} [options]
 */
export function toggleFlag(game, index, { allowQuestion = false } = {}) {
  if (isOver(game) || index < 0 || index >= game.total) return emptyResult(game);
  const state = game.cells[index];
  if (state === Cell.REVEALED) return emptyResult(game);

  if (state === Cell.HIDDEN) {
    game.cells[index] = Cell.FLAGGED;
    game.flagCount++;
  } else if (state === Cell.FLAGGED) {
    game.flagCount--;
    if (allowQuestion) {
      game.cells[index] = Cell.QUESTION;
      game.questionCount++;
    } else {
      game.cells[index] = Cell.HIDDEN;
    }
  } else {
    game.cells[index] = Cell.HIDDEN;
    game.questionCount--;
  }
  return { changed: [index], status: game.status, exploded: -1, invalid: [] };
}

/**
 * Abre de uma vez os vizinhos ocultos de um número já revelado, desde que a
 * quantidade de bandeiras ao redor corresponda ao número ("chording").
 * Quando não corresponde, devolve os vizinhos em `invalid` para um feedback visual.
 */
export function chord(game, index) {
  if (isOver(game) || index < 0 || index >= game.total) return emptyResult(game);
  if (game.cells[index] !== Cell.REVEALED) return emptyResult(game);
  const number = game.adjacent[index];
  if (number === 0) return emptyResult(game);

  const base = index * 8;
  const n = game.neighbors.counts[index];
  let flags = 0;
  const targets = [];
  for (let k = 0; k < n; k++) {
    const nb = game.neighbors.offsets[base + k];
    const state = game.cells[nb];
    if (state === Cell.FLAGGED) flags++;
    else if (state !== Cell.REVEALED) targets.push(nb);
  }

  if (flags !== number || targets.length === 0) {
    return { changed: [], status: game.status, exploded: -1, invalid: targets };
  }

  const changed = [];
  let exploded = -1;
  for (const target of targets) {
    if (game.cells[target] === Cell.QUESTION) game.questionCount--;
    if (game.mines[target]) {
      finishAsLoss(game, target, changed);
      exploded = target;
      return { changed, status: game.status, exploded, invalid: [] };
    }
    if (game.cells[target] === Cell.REVEALED) continue;
    floodReveal(game, target, changed);
  }
  checkWin(game, changed);
  return { changed, status: game.status, exploded, invalid: [] };
}

/**
 * Índices das minas ainda não marcadas — usado pela dica.
 * @returns {number[]}
 */
export function hiddenSafeCells(game) {
  const safe = [];
  for (let i = 0; i < game.total; i++) {
    if (!game.mines[i] && game.cells[i] !== Cell.REVEALED) safe.push(i);
  }
  return safe;
}

/** Serializa o tabuleiro em texto (linhas), útil para depuração e testes. */
export function toText(game, { showMines = false } = {}) {
  const lines = [];
  for (let r = 0; r < game.rows; r++) {
    let line = '';
    for (let c = 0; c < game.cols; c++) {
      const i = r * game.cols + c;
      const state = game.cells[i];
      if (state === Cell.FLAGGED) line += 'F';
      else if (state === Cell.QUESTION) line += '?';
      else if (state === Cell.REVEALED) line += game.mines[i] ? '*' : game.adjacent[i] || '.';
      else line += showMines && game.mines[i] ? 'x' : '#';
    }
    lines.push(line);
  }
  return lines.join('\n');
}
