/**
 * Persistência local (preferências, recordes e estatísticas).
 *
 * Todo acesso ao `localStorage` é protegido: em janelas anônimas, com cookies
 * bloqueados ou quando a cota estoura, o jogo continua funcionando normalmente,
 * apenas sem lembrar nada entre sessões.
 */

const SETTINGS_KEY = 'campo-minado:settings:v1';
const STATS_KEY = 'campo-minado:stats:v1';

/** Preferências padrão. */
export const defaultSettings = Object.freeze({
  difficulty: 'iniciante',
  custom: { rows: 12, cols: 18, mines: 30 },
  theme: 'sistema', // 'sistema' | 'claro' | 'escuro'
  sound: true,
  vibration: true,
  noGuess: true,
  questionMarks: false,
  chordOnNumber: true,
  safeFirstClick: true,
  flagMode: false,
  zoom: 1,
  seenHelp: false,
});

function readJSON(key, fallback) {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    if (!raw) return structuredClone(fallback);
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

function writeJSON(key, value) {
  const storage = globalThis.localStorage;
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Lê as preferências mescladas com os padrões (tolerante a versões antigas). */
export function loadSettings() {
  const stored = readJSON(SETTINGS_KEY, defaultSettings);
  const merged = { ...structuredClone(defaultSettings), ...stored };
  merged.custom = { ...defaultSettings.custom, ...(stored.custom || {}) };
  return merged;
}

/** @param {object} settings */
export function saveSettings(settings) {
  return writeJSON(SETTINGS_KEY, settings);
}

/** Estatísticas de uma dificuldade. */
function emptyEntry() {
  return {
    played: 0,
    won: 0,
    bestTime: null,
    bestDate: null,
    totalTime: 0,
    streak: 0,
    bestStreak: 0,
  };
}

/** Lê todas as estatísticas. */
export function loadStats() {
  return readJSON(STATS_KEY, {});
}

/** @param {string} key dificuldade */
export function getStats(key) {
  const all = loadStats();
  return { ...emptyEntry(), ...(all[key] || {}) };
}

/**
 * Registra o resultado de uma partida.
 * @param {string} key identificador da dificuldade (ex.: "especialista" ou "custom:12x18:30")
 * @param {{won: boolean, seconds: number}} result
 * @returns {{entry: object, isRecord: boolean}}
 */
export function recordGame(key, { won, seconds }) {
  const all = loadStats();
  const entry = { ...emptyEntry(), ...(all[key] || {}) };
  entry.played++;
  let isRecord = false;
  if (won) {
    entry.won++;
    entry.totalTime += seconds;
    entry.streak++;
    entry.bestStreak = Math.max(entry.bestStreak, entry.streak);
    if (entry.bestTime === null || seconds < entry.bestTime) {
      entry.bestTime = seconds;
      entry.bestDate = new Date().toISOString();
      isRecord = true;
    }
  } else {
    entry.streak = 0;
  }
  all[key] = entry;
  writeJSON(STATS_KEY, all);
  return { entry, isRecord };
}

/** Apaga recordes e estatísticas. */
export function clearStats() {
  const storage = globalThis.localStorage;
  if (!storage) return false;
  try {
    storage.removeItem(STATS_KEY);
    return true;
  } catch {
    return false;
  }
}
