/**
 * Estruturas básicas do tabuleiro, compartilhadas entre o motor e o gerador.
 * Ficam em um módulo próprio para que gerador e motor não dependam um do outro
 * de forma circular.
 */

/**
 * Pré-calcula os vizinhos de cada célula em um array achatado (8 posições por célula).
 * Evita recalcular limites de borda em cada varredura — a operação mais quente do jogo.
 * @param {number} rows
 * @param {number} cols
 * @returns {{offsets: Int32Array, counts: Uint8Array}}
 */
export function buildNeighborIndex(rows, cols) {
  const total = rows * cols;
  const offsets = new Int32Array(total * 8).fill(-1);
  const counts = new Uint8Array(total);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      let n = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
          offsets[i * 8 + n] = rr * cols + cc;
          n++;
        }
      }
      counts[i] = n;
    }
  }
  return { offsets, counts };
}

/**
 * Conta quantas minas cercam cada célula livre.
 * @param {Uint8Array} mines
 * @param {{offsets: Int32Array, counts: Uint8Array}} neighbors
 * @returns {Uint8Array}
 */
export function computeAdjacency(mines, neighbors) {
  const total = mines.length;
  const adjacent = new Uint8Array(total);
  for (let i = 0; i < total; i++) {
    if (mines[i]) continue;
    let count = 0;
    const base = i * 8;
    const n = neighbors.counts[i];
    for (let k = 0; k < n; k++) {
      if (mines[neighbors.offsets[base + k]]) count++;
    }
    adjacent[i] = count;
  }
  return adjacent;
}
