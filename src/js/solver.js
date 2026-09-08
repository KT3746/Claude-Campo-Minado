/**
 * Dedução lógica do Campo Minado.
 *
 * Usado para duas coisas:
 *  - gerar tabuleiros "sem chute" (o gerador só aceita um sorteio se este
 *    solucionador conseguir terminá-lo sem nunca apostar);
 *  - dar dicas honestas durante a partida, mostrando uma célula que o próprio
 *    jogador poderia ter provado ser segura.
 *
 * Técnicas, na ordem em que são tentadas:
 *  1. Regra simples — um número já satisfeito libera as ocultas ao redor; um
 *     número igual à quantidade de ocultas marca todas como minas.
 *  2. Regra de subconjunto — se as ocultas de A estão contidas nas de B, a
 *     diferença carrega exatamente `B − A` minas (resolve o clássico 1-2-1).
 *  3. Contagem global — usa as minas restantes; inclusive comparando a soma de
 *     restrições disjuntas com o total que falta, o que libera tudo fora da fronteira.
 */

/**
 * Monta as restrições visíveis: para cada número revelado, quais vizinhos
 * continuam ocultos e quantas minas ainda escondem.
 * @returns {{cells: number[][], mines: number[]}}
 */
function buildConstraints({ adjacent, neighbors, total, revealed, flagged }) {
  const { offsets, counts } = neighbors;
  const cells = [];
  const mines = [];
  for (let i = 0; i < total; i++) {
    if (!revealed[i] || adjacent[i] === 0) continue;
    const base = i * 8;
    const n = counts[i];
    let unknown = null;
    let flags = 0;
    for (let k = 0; k < n; k++) {
      const nb = offsets[base + k];
      if (flagged[nb]) flags++;
      else if (!revealed[nb]) (unknown ??= []).push(nb);
    }
    if (unknown === null) continue;
    cells.push(unknown);
    mines.push(adjacent[i] - flags);
  }
  return { cells, mines };
}

/**
 * Devolve tudo que pode ser provado a partir do estado atual do tabuleiro.
 * Não olha para a posição real das minas — apenas para o que o jogador vê.
 *
 * @param {object} params
 * @param {Uint8Array} params.adjacent
 * @param {{offsets: Int32Array, counts: Uint8Array}} params.neighbors
 * @param {number} params.total
 * @param {number} params.mineCount
 * @param {Uint8Array} params.revealed 1 = célula aberta
 * @param {Uint8Array} params.flagged 1 = célula marcada como mina
 * @returns {{safe: number[], mines: number[], rule: string|null}}
 */
export function deduce({ adjacent, neighbors, total, mineCount, revealed, flagged }) {
  const { cells: constraintCells, mines: constraintMines } = buildConstraints({
    adjacent,
    neighbors,
    total,
    revealed,
    flagged,
  });

  // --- 1. Regra simples ---
  const safe = [];
  const mines = [];
  for (let ci = 0; ci < constraintCells.length; ci++) {
    const cells = constraintCells[ci];
    const remaining = constraintMines[ci];
    if (remaining === 0) safe.push(...cells);
    else if (remaining === cells.length) mines.push(...cells);
  }
  if (safe.length || mines.length) {
    return { safe: unique(safe), mines: unique(mines), rule: 'simples' };
  }

  // --- 2. Regra de subconjunto ---
  const cellToConstraints = new Map();
  for (let ci = 0; ci < constraintCells.length; ci++) {
    for (const cell of constraintCells[ci]) {
      const list = cellToConstraints.get(cell);
      if (list) list.push(ci);
      else cellToConstraints.set(cell, [ci]);
    }
  }
  for (let ai = 0; ai < constraintCells.length; ai++) {
    const a = constraintCells[ai];
    const setA = new Set(a);
    const seen = new Set([ai]);
    for (const cell of a) {
      for (const bi of cellToConstraints.get(cell)) {
        if (seen.has(bi)) continue;
        seen.add(bi);
        const b = constraintCells[bi];
        if (b.length <= a.length) continue;
        let contained = true;
        for (const c of a) {
          if (!b.includes(c)) {
            contained = false;
            break;
          }
        }
        if (!contained) continue;
        const diffCells = b.filter((c) => !setA.has(c));
        const diffMines = constraintMines[bi] - constraintMines[ai];
        if (diffMines === 0) return { safe: diffCells, mines: [], rule: 'subconjunto' };
        if (diffMines === diffCells.length) return { safe: [], mines: diffCells, rule: 'subconjunto' };
      }
    }
  }

  // --- 3. Contagem global ---
  let flaggedCount = 0;
  const hidden = [];
  for (let i = 0; i < total; i++) {
    if (flagged[i]) flaggedCount++;
    else if (!revealed[i]) hidden.push(i);
  }
  const minesLeft = mineCount - flaggedCount;
  if (hidden.length > 0) {
    if (minesLeft === 0) return { safe: hidden, mines: [], rule: 'contagem' };
    if (minesLeft === hidden.length) return { safe: [], mines: hidden, rule: 'contagem' };
  }

  // Restrições disjuntas que já respondem por todas as minas restantes tornam
  // seguras todas as células fora da fronteira.
  const used = new Set();
  let sum = 0;
  for (let ci = 0; ci < constraintCells.length; ci++) {
    const cells = constraintCells[ci];
    let overlaps = false;
    for (const cell of cells) {
      if (used.has(cell)) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;
    for (const cell of cells) used.add(cell);
    sum += constraintMines[ci];
  }
  if (sum === minesLeft) {
    const outside = hidden.filter((cell) => !used.has(cell));
    if (outside.length) return { safe: outside, mines: [], rule: 'contagem' };
  }

  return { safe: [], mines: [], rule: null };
}

function unique(list) {
  return list.length > 1 ? [...new Set(list)] : list;
}

/**
 * Joga a partida inteira usando apenas dedução, a partir de uma primeira
 * abertura. Se em algum momento nada puder ser provado, o tabuleiro exigiria um
 * palpite e é considerado insolúvel.
 *
 * @param {object} params
 * @param {Uint8Array} params.mines posição real das minas (só para abrir células)
 * @param {Uint8Array} params.adjacent
 * @param {{offsets: Int32Array, counts: Uint8Array}} params.neighbors
 * @param {number} params.total
 * @param {number} params.mineCount
 * @param {number} params.start índice da primeira célula aberta
 * @returns {{solvable: boolean, revealed: Uint8Array, flagged: Uint8Array}}
 */
export function solveFrom({ mines, adjacent, neighbors, total, mineCount, start }) {
  const revealed = new Uint8Array(total);
  const flagged = new Uint8Array(total);
  const { offsets, counts } = neighbors;
  const queue = [];
  let revealedCount = 0;
  const target = total - mineCount;

  function open(index) {
    if (revealed[index] || flagged[index]) return true;
    if (mines[index]) return false; // dedução inválida: aborta o tabuleiro
    revealed[index] = 1;
    revealedCount++;
    if (adjacent[index] !== 0) return true;
    queue.length = 0;
    queue.push(index);
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const base = cur * 8;
      const n = counts[cur];
      for (let k = 0; k < n; k++) {
        const nb = offsets[base + k];
        if (revealed[nb] || flagged[nb]) continue;
        revealed[nb] = 1;
        revealedCount++;
        if (adjacent[nb] === 0) queue.push(nb);
      }
    }
    return true;
  }

  if (mines[start]) return { solvable: false, revealed, flagged };
  open(start);

  while (revealedCount < target) {
    const step = deduce({ adjacent, neighbors, total, mineCount, revealed, flagged });
    if (step.safe.length === 0 && step.mines.length === 0) {
      return { solvable: false, revealed, flagged };
    }
    for (const cell of step.safe) {
      if (!open(cell)) return { solvable: false, revealed, flagged };
    }
    for (const cell of step.mines) {
      if (!revealed[cell] && !flagged[cell]) flagged[cell] = 1;
    }
  }
  return { solvable: true, revealed, flagged };
}
