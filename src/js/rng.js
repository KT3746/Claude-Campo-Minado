/**
 * Gerador de números pseudoaleatórios determinístico (mulberry32).
 *
 * Um PRNG com semente torna as partidas reproduzíveis: a mesma semente gera
 * exatamente o mesmo tabuleiro, o que permite compartilhar desafios e escrever
 * testes confiáveis para a lógica do jogo.
 */

/**
 * @param {number} seed inteiro sem sinal de 32 bits
 * @returns {() => number} função que devolve floats em [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sorteia uma semente de 32 bits usando a fonte de entropia disponível. */
export function randomSeed() {
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === 'function') {
    return c.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/**
 * Converte texto livre em uma semente numérica estável (hash FNV-1a de 32 bits).
 * Aceita também números já formatados ("123456").
 * @param {string} text
 */
export function seedFromText(text) {
  const trimmed = String(text).trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  let hash = 0x811c9dc5;
  for (let i = 0; i < trimmed.length; i++) {
    hash ^= trimmed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Embaralhamento Fisher-Yates in-place.
 * @template T
 * @param {T[]|Int32Array} list
 * @param {() => number} random
 */
export function shuffle(list, random) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}
