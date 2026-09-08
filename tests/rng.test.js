import test from 'node:test';
import assert from 'node:assert/strict';

import { mulberry32, randomSeed, seedFromText, shuffle } from '../src/js/rng.js';

test('mulberry32 é determinístico para a mesma semente', () => {
  const a = mulberry32(12345);
  const b = mulberry32(12345);
  const first = Array.from({ length: 20 }, () => a());
  const second = Array.from({ length: 20 }, () => b());
  assert.deepEqual(first, second);
});

test('mulberry32 devolve valores em [0, 1)', () => {
  const random = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const value = random();
    assert.ok(value >= 0 && value < 1, `valor fora do intervalo: ${value}`);
  }
});

test('sementes diferentes geram sequências diferentes', () => {
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test('seedFromText aceita números e texto livre', () => {
  assert.equal(seedFromText('42'), 42);
  assert.equal(seedFromText(' 2026 '), 2026);
  assert.equal(seedFromText('campo minado'), seedFromText('campo minado'));
  assert.notEqual(seedFromText('campo'), seedFromText('minado'));
  assert.ok(Number.isInteger(seedFromText('qualquer coisa')));
});

test('randomSeed devolve inteiro de 32 bits sem sinal', () => {
  for (let i = 0; i < 50; i++) {
    const seed = randomSeed();
    assert.ok(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff);
  }
});

test('shuffle preserva os elementos', () => {
  const random = mulberry32(3);
  const list = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = shuffle([...list], random);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), list);
});
