import test from 'node:test';
import assert from 'node:assert/strict';

import {
  Cell,
  Status,
  chord,
  computeAdjacency,
  createGame,
  isOver,
  minesRemaining,
  normalizeConfig,
  reveal,
  toCoords,
  toggleFlag,
  toIndex,
  toText,
} from '../src/js/engine.js';
import { at, gameFromMap } from './helpers.js';

/* --- Configuração --------------------------------------------------------- */

test('normalizeConfig aceita valores válidos e arredonda', () => {
  assert.deepEqual(normalizeConfig({ rows: 9, cols: 9, mines: 10 }), { rows: 9, cols: 9, mines: 10 });
  assert.deepEqual(normalizeConfig({ rows: '16', cols: '30', mines: '99' }), {
    rows: 16,
    cols: 30,
    mines: 99,
  });
});

test('normalizeConfig recusa tabuleiros impossíveis', () => {
  assert.throws(() => normalizeConfig({ rows: 1, cols: 5, mines: 1 }), RangeError);
  assert.throws(() => normalizeConfig({ rows: 5, cols: 5, mines: 25 }), RangeError);
  assert.throws(() => normalizeConfig({ rows: 5, cols: 5, mines: 0 }), RangeError);
  assert.throws(() => normalizeConfig({ rows: 61, cols: 5, mines: 3 }), RangeError);
  assert.throws(() => normalizeConfig({ rows: NaN, cols: 5, mines: 3 }), RangeError);
});

test('createGame começa vazio e pronto', () => {
  const game = createGame({ rows: 9, cols: 9, mines: 10, seed: 1 });
  assert.equal(game.status, Status.READY);
  assert.equal(game.placed, false);
  assert.equal(game.revealedCount, 0);
  assert.equal(game.total, 81);
  assert.equal(minesRemaining(game), 10);
  assert.equal(game.cells.every((c) => c === Cell.HIDDEN), true);
});

test('coordenadas e índices se convertem nos dois sentidos', () => {
  const game = createGame({ rows: 5, cols: 7, mines: 3, seed: 1 });
  assert.deepEqual(toCoords(game, 0), { row: 1, col: 1 });
  assert.deepEqual(toCoords(game, 8), { row: 2, col: 2 });
  assert.equal(toIndex(game, 1, 1), 8);
  assert.equal(toIndex(game, -1, 0), -1);
  assert.equal(toIndex(game, 0, 7), -1);
});

/* --- Primeira jogada ------------------------------------------------------ */

test('a primeira célula aberta nunca tem mina', () => {
  for (let seed = 0; seed < 60; seed++) {
    const game = createGame({ rows: 9, cols: 9, mines: 70, seed });
    const first = seed % game.total;
    reveal(game, first);
    assert.equal(game.mines[first], 0, `semente ${seed} colocou mina no primeiro clique`);
  }
});

test('com primeira jogada segura, a vizinhança do clique também fica livre', () => {
  for (let seed = 0; seed < 30; seed++) {
    const game = createGame({ rows: 12, cols: 12, mines: 20, seed, safeFirstClick: true });
    const first = at(game, 5, 5);
    const result = reveal(game, first);
    assert.equal(game.adjacent[first], 0);
    assert.ok(result.changed.length >= 9, 'a primeira jogada deve abrir uma clareira');
  }
});

test('sem a opção de clareira, apenas a célula clicada é garantida', () => {
  const game = createGame({ rows: 9, cols: 9, mines: 10, seed: 5, safeFirstClick: false });
  const first = at(game, 4, 4);
  reveal(game, first);
  assert.equal(game.mines[first], 0);
});

test('a mesma semente reproduz o mesmo tabuleiro', () => {
  const a = createGame({ rows: 10, cols: 10, mines: 15, seed: 2026 });
  const b = createGame({ rows: 10, cols: 10, mines: 15, seed: 2026 });
  reveal(a, 0);
  reveal(b, 0);
  assert.deepEqual([...a.mines], [...b.mines]);
});

test('o número de minas colocadas é exatamente o pedido', () => {
  const game = createGame({ rows: 16, cols: 30, mines: 99, seed: 8 });
  reveal(game, 0);
  assert.equal(game.mines.reduce((sum, m) => sum + m, 0), 99);
});

/* --- Revelação ------------------------------------------------------------ */

test('abrir uma célula vazia espalha até as bordas numeradas', () => {
  const game = gameFromMap([
    '.....',
    '.....',
    '..*..',
    '.....',
    '.....',
  ]);
  reveal(game, at(game, 0, 0));
  // Abrem as 24 células livres; a mina fica de fora (e ganha bandeira na vitória).
  assert.equal(game.revealedCount, 24);
  assert.equal(game.cells[at(game, 2, 2)], Cell.FLAGGED);
  assert.equal(game.status, Status.WON);
});

test('abrir um número não espalha', () => {
  const game = gameFromMap([
    '*....',
    '.....',
    '.....',
  ]);
  const result = reveal(game, at(game, 0, 1));
  assert.deepEqual(result.changed, [at(game, 0, 1)]);
  assert.equal(game.revealedCount, 1);
});

test('a cascata não passa por cima de bandeiras', () => {
  const game = gameFromMap([
    '.....',
    '.....',
    '....*',
  ]);
  const flagged = at(game, 0, 2);
  toggleFlag(game, flagged);
  reveal(game, at(game, 0, 0));
  assert.equal(game.cells[flagged], Cell.FLAGGED);
});

test('não é possível abrir uma célula marcada', () => {
  const game = gameFromMap(['..', '.*']);
  const index = at(game, 0, 0);
  toggleFlag(game, index);
  const result = reveal(game, index);
  assert.equal(result.changed.length, 0);
  assert.equal(game.cells[index], Cell.FLAGGED);
});

test('abrir uma mina encerra a partida e revela o campo', () => {
  const game = gameFromMap([
    '*..',
    '...',
    '..*',
  ]);
  const result = reveal(game, at(game, 0, 0));
  assert.equal(game.status, Status.LOST);
  assert.equal(result.exploded, at(game, 0, 0));
  assert.equal(game.explodedIndex, at(game, 0, 0));
  assert.equal(game.cells[at(game, 2, 2)], Cell.REVEALED, 'as outras minas aparecem');
  assert.equal(isOver(game), true);
});

test('bandeiras erradas continuam marcadas ao perder e entram na lista de mudanças', () => {
  const game = gameFromMap([
    '*..',
    '...',
    '...',
  ]);
  const wrong = at(game, 2, 2);
  toggleFlag(game, wrong);
  const result = reveal(game, at(game, 0, 0));
  assert.equal(game.cells[wrong], Cell.FLAGGED);
  assert.ok(result.changed.includes(wrong));
});

test('nada acontece depois do fim da partida', () => {
  const game = gameFromMap(['*.', '..']);
  reveal(game, at(game, 0, 0));
  const after = reveal(game, at(game, 1, 1));
  assert.equal(after.changed.length, 0);
  assert.equal(toggleFlag(game, at(game, 1, 1)).changed.length, 0);
});

/* --- Bandeiras ------------------------------------------------------------ */

test('a bandeira alterna e atualiza o contador', () => {
  const game = gameFromMap(['..', '.*']);
  const index = at(game, 0, 0);
  toggleFlag(game, index);
  assert.equal(game.cells[index], Cell.FLAGGED);
  assert.equal(minesRemaining(game), 0);
  toggleFlag(game, index);
  assert.equal(game.cells[index], Cell.HIDDEN);
  assert.equal(minesRemaining(game), 1);
});

test('com interrogação ativa, o ciclo é fechada → bandeira → ? → fechada', () => {
  const game = gameFromMap(['..', '.*']);
  const index = at(game, 0, 0);
  const options = { allowQuestion: true };
  toggleFlag(game, index, options);
  assert.equal(game.cells[index], Cell.FLAGGED);
  toggleFlag(game, index, options);
  assert.equal(game.cells[index], Cell.QUESTION);
  assert.equal(game.flagCount, 0);
  toggleFlag(game, index, options);
  assert.equal(game.cells[index], Cell.HIDDEN);
});

test('célula com interrogação ainda pode ser aberta', () => {
  const game = gameFromMap(['...', '..*']);
  const index = at(game, 0, 0);
  toggleFlag(game, index, { allowQuestion: true });
  toggleFlag(game, index, { allowQuestion: true });
  assert.equal(game.cells[index], Cell.QUESTION);
  reveal(game, index);
  assert.equal(game.cells[index], Cell.REVEALED);
});

test('não é possível marcar uma célula já aberta', () => {
  const game = gameFromMap(['..', '.*']);
  reveal(game, at(game, 0, 0));
  assert.equal(toggleFlag(game, at(game, 0, 0)).changed.length, 0);
});

/* --- Abrir vizinhos (chord) ---------------------------------------------- */

test('o chord abre os vizinhos quando as bandeiras batem com o número', () => {
  const game = gameFromMap([
    '*..',
    '...',
    '...',
  ]);
  const numberCell = at(game, 0, 1);
  reveal(game, numberCell);
  assert.equal(game.adjacent[numberCell], 1);
  toggleFlag(game, at(game, 0, 0));
  const result = chord(game, numberCell);
  assert.ok(result.changed.length > 0);
  assert.equal(game.cells[at(game, 1, 1)], Cell.REVEALED);
});

test('o chord não faz nada quando as bandeiras não batem', () => {
  const game = gameFromMap([
    '*..',
    '...',
    '...',
  ]);
  const numberCell = at(game, 0, 1);
  reveal(game, numberCell);
  const result = chord(game, numberCell);
  assert.equal(result.changed.length, 0);
  assert.ok(result.invalid.length > 0, 'devolve os vizinhos para o aviso visual');
  assert.equal(game.status, Status.PLAYING);
});

test('o chord com bandeira errada explode', () => {
  const game = gameFromMap([
    '*..',
    '...',
    '...',
  ]);
  const numberCell = at(game, 0, 1);
  reveal(game, numberCell);
  toggleFlag(game, at(game, 1, 1)); // bandeira no lugar errado
  const result = chord(game, numberCell);
  assert.equal(game.status, Status.LOST);
  assert.equal(result.exploded, at(game, 0, 0));
});

test('o chord ignora células fechadas e números zerados', () => {
  const game = gameFromMap(['...', '..*']);
  assert.equal(chord(game, at(game, 0, 0)).changed.length, 0, 'célula fechada');
  reveal(game, at(game, 0, 0));
  assert.equal(game.adjacent[at(game, 0, 0)], 0);
  assert.equal(chord(game, at(game, 0, 0)).changed.length, 0, 'número zero');
});

/* --- Vitória -------------------------------------------------------------- */

test('vence ao abrir todas as células livres e marca as minas restantes', () => {
  const game = gameFromMap([
    '*..',
    '...',
    '..*',
  ]);
  reveal(game, at(game, 0, 1));
  reveal(game, at(game, 0, 2));
  reveal(game, at(game, 1, 0));
  reveal(game, at(game, 1, 1));
  reveal(game, at(game, 1, 2));
  reveal(game, at(game, 2, 0));
  reveal(game, at(game, 2, 1));
  assert.equal(game.status, Status.WON);
  assert.equal(game.flagCount, 2, 'as minas restantes ganham bandeira automática');
  assert.equal(minesRemaining(game), 0);
  assert.ok(game.finishedAt >= game.startedAt);
});

/* --- Utilidades ----------------------------------------------------------- */

test('computeAdjacency conta as minas ao redor', () => {
  const game = gameFromMap([
    '*.*',
    '...',
    '...',
  ]);
  assert.equal(game.adjacent[at(game, 0, 1)], 2);
  assert.equal(game.adjacent[at(game, 1, 1)], 2);
  assert.equal(game.adjacent[at(game, 2, 0)], 0);
});

test('toText mostra o tabuleiro como o jogador o vê', () => {
  const game = gameFromMap(['*..', '...']);
  reveal(game, at(game, 1, 2));
  toggleFlag(game, at(game, 0, 0));
  assert.equal(toText(game), 'F1.\n#1.');
  assert.equal(toText(game, { showMines: true }).includes('F'), true);
});
