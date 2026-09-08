import test from 'node:test';
import assert from 'node:assert/strict';

import { buildNeighborIndex, computeAdjacency } from '../src/js/board.js';
import { generateMines, safeZone } from '../src/js/generator.js';
import { solveFrom } from '../src/js/solver.js';
import { mulberry32 } from '../src/js/rng.js';

function setup(rows, cols) {
  return { rows, cols, total: rows * cols, neighbors: buildNeighborIndex(rows, cols) };
}

const countMines = (mines) => mines.reduce((sum, m) => sum + m, 0);

test('safeZone protege o clique e os oito vizinhos', () => {
  const { neighbors, total } = setup(9, 9);
  const zone = safeZone({ safeIndex: 40, neighbors, total, mineCount: 10, safeArea: true });
  assert.equal(zone.size, 9);
  assert.ok(zone.has(40));
});

test('safeZone encolhe quando não sobram células para as minas', () => {
  const { neighbors, total } = setup(4, 4);
  const zone = safeZone({ safeIndex: 5, neighbors, total, mineCount: 15, safeArea: true });
  assert.deepEqual([...zone], [5]);
});

test('safeZone com clareira desligada protege só o clique', () => {
  const { neighbors, total } = setup(9, 9);
  const zone = safeZone({ safeIndex: 40, neighbors, total, mineCount: 10, safeArea: false });
  assert.deepEqual([...zone], [40]);
});

test('o modo clássico coloca a quantidade certa de minas fora da zona segura', () => {
  const { rows, cols, neighbors, total } = setup(16, 30);
  for (let seed = 0; seed < 10; seed++) {
    const safeIndex = (seed * 53) % total;
    const { mines } = generateMines({
      rows,
      cols,
      mineCount: 99,
      safeIndex,
      neighbors,
      random: mulberry32(seed),
    });
    assert.equal(countMines(mines), 99);
    const zone = safeZone({ safeIndex, neighbors, total, mineCount: 99, safeArea: true });
    for (const cell of zone) assert.equal(mines[cell], 0);
  }
});

test('o modo sem chute entrega tabuleiros que a lógica resolve sozinha', () => {
  const { rows, cols, neighbors, total } = setup(9, 9);
  for (let seed = 0; seed < 8; seed++) {
    const safeIndex = 40;
    const { mines, solvable } = generateMines({
      rows,
      cols,
      mineCount: 10,
      safeIndex,
      neighbors,
      random: mulberry32(seed),
      noGuess: true,
    });
    assert.equal(solvable, true, `semente ${seed} não achou tabuleiro dedutível`);
    assert.equal(countMines(mines), 10);
    const check = solveFrom({
      mines,
      adjacent: computeAdjacency(mines, neighbors),
      neighbors,
      total,
      mineCount: 10,
      start: safeIndex,
    });
    assert.equal(check.solvable, true, 'o tabuleiro devolvido precisa passar no solucionador');
  }
});

test('o modo sem chute funciona no nível especialista dentro do orçamento', () => {
  const { rows, cols, neighbors } = setup(16, 30);
  const { mines, solvable, attempts } = generateMines({
    rows,
    cols,
    mineCount: 99,
    safeIndex: 240,
    neighbors,
    random: mulberry32(2026),
    noGuess: true,
    budgetMs: 5000,
  });
  assert.equal(solvable, true);
  assert.equal(countMines(mines), 99);
  assert.ok(attempts >= 1);
});

test('quando o orçamento acaba, devolve um tabuleiro válido marcado como não garantido', () => {
  const { rows, cols, neighbors } = setup(16, 30);
  const { mines, solvable } = generateMines({
    rows,
    cols,
    mineCount: 200,
    safeIndex: 240,
    neighbors,
    random: mulberry32(1),
    noGuess: true,
    budgetMs: 0,
    maxAttempts: 32,
  });
  assert.equal(solvable, false);
  assert.equal(countMines(mines), 200, 'mesmo sem garantia, o tabuleiro é jogável');
});

test('a mesma semente gera o mesmo tabuleiro', () => {
  const { rows, cols, neighbors } = setup(12, 12);
  const options = { rows, cols, mineCount: 20, safeIndex: 30, neighbors, noGuess: true };
  const a = generateMines({ ...options, random: mulberry32(4242) });
  const b = generateMines({ ...options, random: mulberry32(4242) });
  assert.deepEqual([...a.mines], [...b.mines]);
  assert.equal(a.attempts, b.attempts);
});
