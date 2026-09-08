import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNeighborIndex, computeAdjacency } from '../src/js/board.js';
import { deduce, solveFrom } from '../src/js/solver.js';
import { mulberry32 } from '../src/js/rng.js';
import { at, gameFromMap } from './helpers.js';

/** Constrói os argumentos do solucionador a partir de um mapa e de um estado visível. */
function context(map, { revealed = [], flagged = [] } = {}) {
  const game = gameFromMap(map);
  const revealedArr = new Uint8Array(game.total);
  const flaggedArr = new Uint8Array(game.total);
  for (const [r, c] of revealed) revealedArr[at(game, r, c)] = 1;
  for (const [r, c] of flagged) flaggedArr[at(game, r, c)] = 1;
  return {
    game,
    args: {
      adjacent: game.adjacent,
      neighbors: game.neighbors,
      total: game.total,
      mineCount: game.mineCount,
      revealed: revealedArr,
      flagged: flaggedArr,
    },
  };
}

test('regra simples: número já satisfeito libera os vizinhos', () => {
  // O "1" em (1,1) já tem a mina marcada, então (1,2) e (2,x) são seguros.
  const { game, args } = context(
    ['*..', '...', '...'],
    { revealed: [[1, 1]], flagged: [[0, 0]] },
  );
  const step = deduce(args);
  assert.equal(step.rule, 'simples');
  assert.ok(step.safe.includes(at(game, 1, 2)));
  assert.equal(step.mines.length, 0);
});

test('regra simples: número igual ao total de ocultas marca as minas', () => {
  // Canto (0,0) aberto com "1": só resta (1,1) escondida entre seus vizinhos.
  const { game, args } = context(
    ['...', '.*.', '...'],
    { revealed: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 2], [2, 0], [2, 1], [2, 2]] },
  );
  const step = deduce(args);
  assert.deepEqual(step.mines, [at(game, 1, 1)]);
});

test('regra de subconjunto resolve o padrão 1-2-1', () => {
  // Só a linha de baixo está aberta (1-2-1 na parte de dentro). Nenhuma regra
  // simples resolve; a comparação entre restrições vizinhas, sim.
  const { game, args } = context(
    ['.*.*.', '.....'],
    { revealed: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] },
  );
  const step = deduce(args);
  assert.equal(step.rule, 'subconjunto');
  assert.deepEqual(step.safe, [at(game, 0, 2)]);
});

test('contagem global: sem minas restantes, tudo é seguro', () => {
  const { game, args } = context(
    ['*..', '...', '...'],
    { revealed: [[0, 1], [1, 0], [1, 1]], flagged: [[0, 0]] },
  );
  const step = deduce(args);
  assert.equal(step.safe.includes(at(game, 2, 2)), true);
});

test('sem informação suficiente, deduce não inventa nada', () => {
  const { args } = context(['....', '.**.', '....'], { revealed: [] });
  const step = deduce(args);
  assert.equal(step.safe.length, 0);
  assert.equal(step.mines.length, 0);
  assert.equal(step.rule, null);
});

test('solveFrom resolve um tabuleiro puramente lógico', () => {
  const game = gameFromMap([
    '.....',
    '..*..',
    '.....',
    '..*..',
    '.....',
  ]);
  const { solvable, revealed } = solveFrom({
    mines: game.mines,
    adjacent: game.adjacent,
    neighbors: game.neighbors,
    total: game.total,
    mineCount: game.mineCount,
    start: at(game, 0, 0),
  });
  assert.equal(solvable, true);
  assert.equal(
    revealed.reduce((sum, v) => sum + v, 0),
    game.total - game.mineCount,
  );
  // Nenhuma mina foi aberta.
  for (let i = 0; i < game.total; i++) {
    assert.ok(!(revealed[i] && game.mines[i]), 'o solucionador nunca abre uma mina');
  }
});

test('solveFrom recusa um tabuleiro que exige palpite', () => {
  // Clássico "50/50" no canto: as duas células do fundo são indistinguíveis.
  const game = gameFromMap([
    '....',
    '....',
    '.**.',
    '*..*',
  ]);
  const { solvable } = solveFrom({
    mines: game.mines,
    adjacent: game.adjacent,
    neighbors: game.neighbors,
    total: game.total,
    mineCount: game.mineCount,
    start: at(game, 0, 0),
  });
  assert.equal(solvable, false);
});

test('solveFrom desiste quando a primeira célula é uma mina', () => {
  const game = gameFromMap(['*.', '..']);
  const { solvable } = solveFrom({
    mines: game.mines,
    adjacent: game.adjacent,
    neighbors: game.neighbors,
    total: game.total,
    mineCount: game.mineCount,
    start: 0,
  });
  assert.equal(solvable, false);
});

test('deduce nunca aponta como segura uma célula com mina (estado consistente)', () => {
  // Varre vários tabuleiros aleatórios resolvendo passo a passo.
  for (let seed = 0; seed < 25; seed++) {
    const rows = 8;
    const cols = 8;
    const total = rows * cols;
    const mines = new Uint8Array(total);
    const random = mulberry32(seed + 1);
    let placed = 0;
    while (placed < 10) {
      const index = Math.floor(random() * total);
      if (!mines[index] && index !== 0) {
        mines[index] = 1;
        placed++;
      }
    }
    const neighbors = buildNeighborIndex(rows, cols);
    const adjacent = computeAdjacency(mines, neighbors);
    const revealed = new Uint8Array(total);
    const flagged = new Uint8Array(total);
    revealed[0] = mines[0] ? 0 : 1;
    for (let step = 0; step < 40; step++) {
      const found = deduce({ adjacent, neighbors, total, mineCount: 10, revealed, flagged });
      if (!found.safe.length && !found.mines.length) break;
      for (const cell of found.safe) {
        assert.equal(mines[cell], 0, 'deduziu como segura uma célula com mina');
        revealed[cell] = 1;
      }
      for (const cell of found.mines) {
        assert.equal(mines[cell], 1, 'deduziu como mina uma célula segura');
        flagged[cell] = 1;
      }
    }
  }
});
