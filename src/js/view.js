/**
 * Camada visual do tabuleiro.
 *
 * Responsável por criar as células uma única vez por partida e, a partir daí,
 * repintar apenas as que mudaram. Também cuida da acessibilidade da grade:
 * rótulos descritivos por célula e "roving tabindex" (só a célula focada entra
 * na ordem de tabulação, como manda o padrão de grade do WAI-ARIA).
 */

import { Cell, Status, toCoords } from './engine.js';

const ICON_FLAG = '<svg class="cell-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-flag"></use></svg>';
const ICON_MINE = '<svg class="cell-icon" viewBox="0 0 32 32" aria-hidden="true"><use href="#i-mine"></use></svg>';

export function createBoardView(root) {
  /** @type {HTMLButtonElement[]} */
  let cells = [];
  /** @type {any} */
  let game = null;
  let focusIndex = 0;
  /** @type {Map<number, number>} */
  const pendingCleanups = new Map();

  /** Monta a grade do zero para uma nova partida. */
  function mount(nextGame) {
    game = nextGame;
    root.textContent = '';
    root.style.setProperty('--rows', String(game.rows));
    root.style.setProperty('--cols', String(game.cols));
    root.setAttribute('aria-rowcount', String(game.rows));
    root.setAttribute('aria-colcount', String(game.cols));
    cells = new Array(game.total);

    const fragment = document.createDocumentFragment();
    for (let r = 0; r < game.rows; r++) {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'row');
      row.setAttribute('aria-rowindex', String(r + 1));
      for (let c = 0; c < game.cols; c++) {
        const index = r * game.cols + c;
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-colindex', String(c + 1));
        cell.dataset.i = String(index);
        cell.tabIndex = -1;
        cells[index] = cell;
        row.append(cell);
      }
      fragment.append(row);
    }
    root.append(fragment);
    focusIndex = Math.min(focusIndex, game.total - 1);
    cells[focusIndex].tabIndex = 0;
    paintAll();
  }

  /** Texto lido por leitores de tela para uma célula. */
  function describe(index) {
    const { row, col } = toCoords(game, index);
    const state = game.cells[index];
    const isMine = game.mines[index] === 1;
    let what;
    if (state === Cell.FLAGGED) {
      what = game.status === Status.LOST && !isMine ? 'bandeira errada' : 'com bandeira';
    } else if (state === Cell.QUESTION) {
      what = 'marcada com interrogação';
    } else if (state !== Cell.REVEALED) {
      what = 'fechada';
    } else if (isMine) {
      what = index === game.explodedIndex ? 'mina que explodiu' : 'mina';
    } else {
      const n = game.adjacent[index];
      what = n === 0 ? 'vazia' : `${n} ${n === 1 ? 'mina ao redor' : 'minas ao redor'}`;
    }
    return `Linha ${row}, coluna ${col}: ${what}`;
  }

  /** Repinta uma célula a partir do estado do motor. */
  function paint(index) {
    const cell = cells[index];
    if (!cell) return;
    const state = game.cells[index];
    const isMine = game.mines[index] === 1;
    const over = game.status === Status.WON || game.status === Status.LOST;

    let className = 'cell';
    let html = '';
    let text = '';
    let number = '';

    if (state === Cell.FLAGGED) {
      className += ' is-flag';
      if (over && game.status === Status.LOST && !isMine) className += ' is-wrong';
      html = ICON_FLAG;
    } else if (state === Cell.QUESTION) {
      className += ' is-question';
      text = '?';
    } else if (state === Cell.REVEALED) {
      className += ' is-open';
      if (isMine) {
        className += index === game.explodedIndex ? ' is-mine is-exploded' : ' is-mine';
        html = ICON_MINE;
      } else {
        const n = game.adjacent[index];
        if (n > 0) {
          number = String(n);
          text = number;
          if (!over) className += ' can-chord';
        }
      }
    }

    cell.className = className;
    if (number) cell.dataset.n = number;
    else delete cell.dataset.n;
    if (html) cell.innerHTML = html;
    else cell.textContent = text;
    cell.setAttribute('aria-label', describe(index));
    if (over) cell.setAttribute('aria-disabled', 'true');
    else cell.removeAttribute('aria-disabled');
  }

  function paintAll() {
    for (let i = 0; i < game.total; i++) paint(i);
  }

  /**
   * Repinta várias células, opcionalmente com a animação de cascata —
   * o atraso de cada uma acompanha a ordem em que o motor as abriu.
   */
  function paintMany(indices, { animate = false } = {}) {
    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      paint(index);
      if (animate && indices.length > 1) {
        cells[index].style.setProperty('--d', String(Math.min(i, 60)));
        cells[index].classList.add('is-revealing');
      }
    }
  }

  /** Aplica uma classe temporária (destaques e feedbacks curtos). */
  function flash(index, className, ms = 600) {
    const cell = cells[index];
    if (!cell) return;
    const previous = pendingCleanups.get(index);
    if (previous) clearTimeout(previous);
    cell.classList.remove(className);
    void cell.offsetWidth; // força o reinício da animação
    cell.classList.add(className);
    pendingCleanups.set(
      index,
      setTimeout(() => {
        cell.classList.remove(className);
        pendingCleanups.delete(index);
      }, ms),
    );
  }

  /** Onda de comemoração ao vencer. */
  function cheer() {
    const origin = game.firstIndex >= 0 ? game.firstIndex : 0;
    const or = Math.floor(origin / game.cols);
    const oc = origin % game.cols;
    for (let i = 0; i < game.total; i++) {
      const distance = Math.abs(Math.floor(i / game.cols) - or) + Math.abs((i % game.cols) - oc);
      cells[i].style.setProperty('--d', String(distance));
      cells[i].classList.add('is-cheer');
    }
    setTimeout(() => {
      for (const cell of cells) cell.classList.remove('is-cheer');
    }, 1600);
  }

  function setPressed(index, pressed) {
    cells[index]?.classList.toggle('is-pressed', pressed);
  }

  function clearPressed() {
    for (const cell of cells) cell.classList.remove('is-pressed');
  }

  /** Move o foco (roving tabindex) para uma célula. */
  function focusCell(index, { focus = true } = {}) {
    if (index < 0 || index >= cells.length) return;
    cells[focusIndex]?.setAttribute('tabindex', '-1');
    focusIndex = index;
    const cell = cells[index];
    cell.tabIndex = 0;
    if (focus) cell.focus({ preventScroll: false });
  }

  function shake() {
    root.classList.remove('is-shaking');
    void root.offsetWidth;
    root.classList.add('is-shaking');
    setTimeout(() => root.classList.remove('is-shaking'), 600);
  }

  return {
    mount,
    paint,
    paintAll,
    paintMany,
    flash,
    cheer,
    shake,
    setPressed,
    clearPressed,
    focusCell,
    get focusIndex() {
      return focusIndex;
    },
    cellAt: (index) => cells[index],
  };
}
