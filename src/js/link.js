/**
 * Link compartilhável da partida: o hash que guarda dificuldade, tamanho e semente.
 *
 * Montagem e leitura vivem no mesmo módulo de propósito. Antes eram dois trechos
 * separados em `app.js`, e eles discordavam: a barra de endereço incluía as
 * dimensões do tabuleiro personalizado, mas o botão de copiar as esquecia — quem
 * recebia o link caía no tabuleiro padrão dele, não no que o link prometia.
 * Sem DOM, para ser testável em Node.
 */

import { normalizeConfig } from './engine.js';
import { seedFromText } from './rng.js';

/**
 * Hash que descreve a partida atual.
 * @param {{difficulty: string, seed: number, rows: number, cols: number, mines: number}} game
 * @returns {string} começando com `#`
 */
export function buildHash({ difficulty, seed, rows, cols, mines }) {
  const params = new URLSearchParams({ dif: difficulty, semente: String(seed) });
  // Só o tabuleiro personalizado precisa carregar as medidas: as dificuldades
  // clássicas já são definidas pelo próprio nome.
  if (difficulty === 'personalizado') {
    params.set('l', String(rows));
    params.set('c', String(cols));
    params.set('m', String(mines));
  }
  return `#${params}`;
}

/**
 * Lê um hash de partida. Devolve apenas o que o link realmente especifica, para
 * que quem chama preserve as próprias preferências no resto. Link inválido não
 * lança: simplesmente não devolve aquele campo.
 *
 * @param {string} hash com ou sem o `#` inicial
 * @returns {{difficulty?: string, custom?: {rows:number, cols:number, mines:number}, seed?: number, problem?: string}}
 */
export function parseHash(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ''));
  const result = {};

  const difficulty = params.get('dif');
  if (difficulty) result.difficulty = difficulty;

  if (difficulty === 'personalizado') {
    try {
      result.custom = normalizeConfig({
        rows: Number(params.get('l')),
        cols: Number(params.get('c')),
        mines: Number(params.get('m')),
      });
    } catch (error) {
      // Medidas ausentes ou impossíveis: quem chama decide o que fazer sem elas,
      // mas recebe o motivo para contar ao jogador por que o link não valeu.
      delete result.difficulty;
      result.problem = `Link com tabuleiro inválido: ${error.message}`;
    }
  }

  const seed = params.get('semente');
  if (seed !== null && seed.trim() !== '') result.seed = seedFromText(seed);

  return result;
}
