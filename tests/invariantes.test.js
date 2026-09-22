/**
 * Testes de invariante: em vez de checar casos escolhidos a dedo, joga centenas de
 * partidas aleatórias com o motor e o solucionador de verdade e exige que certas
 * afirmações valham em todas elas.
 *
 * Pegam o tipo de erro que um teste pontual deixa passar: uma dedução que mente em
 * um formato raro de fronteira, um contador que desanda depois de uma sequência
 * específica de bandeiras, uma vitória declarada cedo. As sementes são fixas, então
 * uma falha é sempre reproduzível.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Cell, Status, createGame, isOver, minesRemaining, reveal, toggleFlag } from '../src/js/engine.js';
import { deduce } from '../src/js/solver.js';
import { generateMines } from '../src/js/generator.js';
import { buildNeighborIndex } from '../src/js/board.js';
import { mulberry32 } from '../src/js/rng.js';

const PARTIDAS = 200;

/** O tabuleiro como o jogador o vê — é só isso que o solucionador pode usar. */
function playerView(game) {
  const revealed = new Uint8Array(game.total);
  const flagged = new Uint8Array(game.total);
  for (let i = 0; i < game.total; i++) {
    if (game.cells[i] === Cell.REVEALED) revealed[i] = 1;
    else if (game.cells[i] === Cell.FLAGGED) flagged[i] = 1;
  }
  return { revealed, flagged };
}

/**
 * `revealedCount` mede o progresso rumo à vitória, não as células pintadas de
 * aberto: ao perder, o motor expõe as minas sem contá-las (e é essa a leitura
 * certa — contá-las quebraria a checagem de vitória). Por isso `livresAbertas`
 * ignora as minas, e é ela que precisa casar com o contador.
 */
function contar(game) {
  let flags = 0;
  let livresAbertas = 0;
  let duvidas = 0;
  for (let i = 0; i < game.total; i++) {
    if (game.cells[i] === Cell.FLAGGED) flags++;
    else if (game.cells[i] === Cell.REVEALED && !game.mines[i]) livresAbertas++;
    else if (game.cells[i] === Cell.QUESTION) duvidas++;
  }
  return { flags, livresAbertas, duvidas };
}

/**
 * Joga uma partida até o fim: segue as deduções enquanto existirem e, quando
 * travam, abre uma célula livre qualquer para destravar (o objetivo é percorrer
 * muitos estados, não vencer).
 */
function jogarAteOFim(game, random, aoDeduzir) {
  let passos = 0;
  while (!isOver(game) && passos++ < 5000) {
    const { revealed, flagged } = playerView(game);
    const step = deduce({
      adjacent: game.adjacent,
      neighbors: game.neighbors,
      total: game.total,
      mineCount: game.mineCount,
      revealed,
      flagged,
    });
    aoDeduzir(step);

    if (!step.safe.length && !step.mines.length) {
      const livres = [];
      for (let i = 0; i < game.total; i++) {
        if (!game.mines[i] && game.cells[i] !== Cell.REVEALED && game.cells[i] !== Cell.FLAGGED) livres.push(i);
      }
      if (!livres.length) return;
      reveal(game, livres[Math.floor(random() * livres.length)]);
      continue;
    }
    for (const i of step.mines) if (game.cells[i] !== Cell.FLAGGED) toggleFlag(game, i);
    for (const i of step.safe) if (!isOver(game)) reveal(game, i);
  }
}

test('o solucionador nunca afirma o que é falso', () => {
  for (let s = 0; s < PARTIDAS; s++) {
    const random = mulberry32(s + 1);
    const rows = 4 + Math.floor(random() * 10);
    const cols = 4 + Math.floor(random() * 10);
    const total = rows * cols;
    const game = createGame({
      rows,
      cols,
      mines: 1 + Math.floor(random() * (total * 0.28)),
      seed: s + 1,
      safeFirstClick: random() < 0.5,
    });
    reveal(game, Math.floor(random() * total));

    jogarAteOFim(game, random, (step) => {
      for (const i of step.safe) {
        assert.equal(game.mines[i], 0, `semente ${s + 1}: deduziu segura a célula ${i}, que tem mina (${step.rule})`);
      }
      for (const i of step.mines) {
        assert.equal(game.mines[i], 1, `semente ${s + 1}: deduziu mina na célula ${i}, que é livre (${step.rule})`);
      }
    });
  }
});

test('os contadores do motor acompanham o tabuleiro', () => {
  for (let s = 0; s < PARTIDAS; s++) {
    const random = mulberry32(1000 + s);
    const rows = 4 + Math.floor(random() * 10);
    const cols = 4 + Math.floor(random() * 10);
    const total = rows * cols;
    const game = createGame({
      rows,
      cols,
      mines: 1 + Math.floor(random() * (total * 0.28)),
      seed: 1000 + s,
    });
    reveal(game, Math.floor(random() * total));

    // Mexe nas bandeiras no meio do caminho para exercitar o ciclo completo,
    // inclusive a interrogação, que tem contador próprio.
    jogarAteOFim(game, random, () => {
      const alvo = Math.floor(random() * total);
      if (game.cells[alvo] !== Cell.REVEALED) toggleFlag(game, alvo, { allowQuestion: true });
    });

    const { flags, livresAbertas, duvidas } = contar(game);
    assert.equal(game.flagCount, flags, `semente ${1000 + s}: flagCount fora de sincronia`);
    assert.equal(game.revealedCount, livresAbertas, `semente ${1000 + s}: revealedCount fora de sincronia`);
    assert.equal(game.questionCount, duvidas, `semente ${1000 + s}: questionCount fora de sincronia`);
  }
});

test('vitória e derrota só acontecem quando de fato aconteceram', () => {
  let vitorias = 0;
  let derrotas = 0;
  for (let s = 0; s < PARTIDAS; s++) {
    const random = mulberry32(2000 + s);
    const rows = 4 + Math.floor(random() * 8);
    const cols = 4 + Math.floor(random() * 8);
    const total = rows * cols;
    const game = createGame({
      rows,
      cols,
      mines: 1 + Math.floor(random() * (total * 0.22)),
      seed: 2000 + s,
    });
    reveal(game, Math.floor(random() * total));

    // O roteiro de dedução só abre células livres, então por si só nunca perde:
    // em metade das amostras pisamos numa mina de propósito, senão o caminho da
    // derrota não rodaria e o teste passaria sem testar metade do que promete.
    if (s % 2 === 0) {
      for (let i = 0; i < total; i++) {
        if (game.mines[i]) {
          reveal(game, i);
          break;
        }
      }
    } else {
      jogarAteOFim(game, random, () => {});
    }

    if (game.status === Status.WON) {
      vitorias++;
      const { livresAbertas } = contar(game);
      assert.equal(livresAbertas, total - game.mineCount, 'venceu sem abrir todas as células livres');
      assert.equal(minesRemaining(game), 0, 'venceu com o contador de minas fora de zero');
      for (let i = 0; i < total; i++) {
        assert.ok(!(game.mines[i] && game.cells[i] === Cell.REVEALED), 'venceu com uma mina aberta');
      }
    }
    if (game.status === Status.LOST) {
      derrotas++;
      assert.equal(game.mines[game.explodedIndex], 1, 'perdeu sem mina na célula que explodiu');
    }
  }
  // Se um lado nunca aparecer, o teste está passando sem exercitar o que promete.
  assert.ok(vitorias > 0, 'nenhuma vitória nas amostras');
  assert.ok(derrotas > 0, 'nenhuma derrota nas amostras');
});

test('o modo sem chute entrega tabuleiros que fecham só com lógica', () => {
  // Confere a promessa central do jogo nas três dificuldades clássicas: o que o
  // gerador aceitou é mesmo resolvível sem palpite, jogando de verdade.
  const niveis = [
    { rows: 9, cols: 9, mines: 10 },
    { rows: 16, cols: 16, mines: 40 },
    { rows: 16, cols: 30, mines: 99 },
  ];
  for (const [n, nivel] of niveis.entries()) {
    const neighbors = buildNeighborIndex(nivel.rows, nivel.cols);
    const total = nivel.rows * nivel.cols;
    const safeIndex = Math.floor(total / 2);
    for (let s = 0; s < 4; s++) {
      const semente = 300 + n * 10 + s;
      const gerado = generateMines({
        rows: nivel.rows,
        cols: nivel.cols,
        mineCount: nivel.mines,
        safeIndex,
        neighbors,
        random: mulberry32(semente),
        noGuess: true,
      });
      if (!gerado.solvable) continue; // estourou o orçamento: degradar é permitido

      const game = createGame({ ...nivel, seed: semente });
      game.mines = gerado.mines;
      game.adjacent = new Uint8Array(total);
      for (let i = 0; i < total; i++) {
        if (game.mines[i]) continue;
        const base = i * 8;
        let volta = 0;
        for (let k = 0; k < neighbors.counts[i]; k++) {
          if (game.mines[neighbors.offsets[base + k]]) volta++;
        }
        game.adjacent[i] = volta;
      }
      game.placed = true;
      game.status = Status.PLAYING;
      reveal(game, safeIndex);

      let travou = false;
      jogarAteOFim(game, mulberry32(semente), (step) => {
        if (!step.safe.length && !step.mines.length && !isOver(game)) travou = true;
      });
      assert.ok(!travou, `semente ${semente}: aceito como sem chute, mas a dedução travou`);
      assert.equal(game.status, Status.WON, `semente ${semente}: sem chute que não terminou em vitória`);
    }
  }
});
