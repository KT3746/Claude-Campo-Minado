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

/* --- Desistência determinística ------------------------------------------ */

// 16×30 com 150 minas (31%): nenhum sorteio fecha só com lógica, então o
// gerador sempre desiste. É o cenário em que a velocidade do aparelho mudava o
// tabuleiro — e com ele o link compartilhado.
const SEM_SAIDA = { mineCount: 150, safeIndex: 240, noGuess: true, maxWork: 480 * 200 };

test('ao desistir, devolve o tabuleiro clássico daquela semente', () => {
  const { rows, cols, neighbors } = setup(16, 30);
  const semChute = generateMines({ rows, cols, neighbors, ...SEM_SAIDA, random: mulberry32(77) });
  const classico = generateMines({ rows, cols, neighbors, ...SEM_SAIDA, noGuess: false, random: mulberry32(77) });
  assert.equal(semChute.solvable, false);
  assert.deepEqual([...semChute.mines], [...classico.mines]);
});

test('o tabuleiro de uma desistência não depende do relógio', () => {
  // Antes, o gerador devolvia "o último sorteio que coube no tempo": um aparelho
  // rápido e um lento chegavam a tabuleiros diferentes com a mesma semente.
  const { rows, cols, neighbors } = setup(16, 30);
  const rapido = generateMines({ rows, cols, neighbors, ...SEM_SAIDA, random: mulberry32(9), budgetMs: 1e9 });
  const lento = generateMines({ rows, cols, neighbors, ...SEM_SAIDA, random: mulberry32(9), budgetMs: 0 });
  assert.ok(rapido.attempts > lento.attempts, 'o cenário precisa de fato cortar em pontos diferentes');
  assert.deepEqual([...rapido.mines], [...lento.mines]);
});

test('o orçamento de trabalho limita as tentativas pelo tamanho do tabuleiro', () => {
  const { rows, cols, neighbors } = setup(16, 30);
  const { attempts } = generateMines({
    rows,
    cols,
    neighbors,
    ...SEM_SAIDA,
    random: mulberry32(3),
    maxWork: 480 * 50,
    budgetMs: 1e9,
  });
  assert.equal(attempts, 50);
});

test('a mesma semente gera o mesmo tabuleiro', () => {
  const { rows, cols, neighbors } = setup(12, 12);
  const options = { rows, cols, mineCount: 20, safeIndex: 30, neighbors, noGuess: true };
  const a = generateMines({ ...options, random: mulberry32(4242) });
  const b = generateMines({ ...options, random: mulberry32(4242) });
  assert.deepEqual([...a.mines], [...b.mines]);
  assert.equal(a.attempts, b.attempts);
});
