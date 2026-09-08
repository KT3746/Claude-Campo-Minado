import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

/** localStorage de mentira: o Node não tem um, e queremos testar as falhas também. */
function installStorage({ failing = false } = {}) {
  const data = new Map();
  globalThis.localStorage = {
    getItem: (key) => {
      if (failing) throw new Error('acesso bloqueado');
      return data.has(key) ? data.get(key) : null;
    },
    setItem: (key, value) => {
      if (failing) throw new Error('cota estourada');
      data.set(key, String(value));
    },
    removeItem: (key) => {
      if (failing) throw new Error('acesso bloqueado');
      data.delete(key);
    },
  };
  return data;
}

installStorage();
const { clearStats, defaultSettings, getStats, loadSettings, loadStats, recordGame, saveSettings } =
  await import('../src/js/storage.js');

let data = installStorage();
beforeEach(() => {
  data = installStorage();
});

test('sem nada salvo, devolve os padrões', () => {
  const settings = loadSettings();
  assert.equal(settings.difficulty, defaultSettings.difficulty);
  assert.equal(settings.noGuess, true);
  assert.deepEqual(settings.custom, defaultSettings.custom);
});

test('salva e recarrega as preferências', () => {
  const settings = loadSettings();
  settings.difficulty = 'especialista';
  settings.sound = false;
  assert.equal(saveSettings(settings), true);
  const reloaded = loadSettings();
  assert.equal(reloaded.difficulty, 'especialista');
  assert.equal(reloaded.sound, false);
});

test('preferências antigas ganham os campos novos', () => {
  data.set('campo-minado:settings:v1', JSON.stringify({ difficulty: 'intermediario' }));
  const settings = loadSettings();
  assert.equal(settings.difficulty, 'intermediario');
  assert.equal(settings.theme, defaultSettings.theme);
  assert.deepEqual(settings.custom, defaultSettings.custom);
});

test('conteúdo corrompido não derruba o jogo', () => {
  data.set('campo-minado:settings:v1', '{isto não é json');
  assert.deepEqual(loadSettings().difficulty, defaultSettings.difficulty);
  data.set('campo-minado:stats:v1', 'null');
  assert.deepEqual(loadStats(), {});
});

test('mudar os padrões não vaza para as preferências carregadas', () => {
  const settings = loadSettings();
  settings.custom.rows = 99;
  assert.notEqual(defaultSettings.custom.rows, 99);
});

test('registra vitórias, derrotas, recordes e sequências', () => {
  let result = recordGame('iniciante', { won: true, seconds: 30 });
  assert.equal(result.isRecord, true);
  assert.equal(result.entry.won, 1);
  assert.equal(result.entry.streak, 1);

  result = recordGame('iniciante', { won: true, seconds: 45 });
  assert.equal(result.isRecord, false, '45s não bate o recorde de 30s');
  assert.equal(result.entry.bestTime, 30);
  assert.equal(result.entry.streak, 2);
  assert.equal(result.entry.bestStreak, 2);

  result = recordGame('iniciante', { won: false, seconds: 12 });
  assert.equal(result.entry.streak, 0, 'perder zera a sequência');
  assert.equal(result.entry.bestStreak, 2, 'mas o recorde de sequência fica');
  assert.equal(result.entry.played, 3);

  result = recordGame('iniciante', { won: true, seconds: 20 });
  assert.equal(result.isRecord, true);
  assert.equal(result.entry.bestTime, 20);
  assert.ok(result.entry.bestDate, 'guarda a data do recorde');
});

test('cada dificuldade tem estatísticas próprias', () => {
  recordGame('iniciante', { won: true, seconds: 10 });
  recordGame('custom:5x5:3', { won: true, seconds: 4 });
  assert.equal(getStats('iniciante').bestTime, 10);
  assert.equal(getStats('custom:5x5:3').bestTime, 4);
  assert.equal(getStats('especialista').played, 0);
});

test('clearStats apaga tudo e mantém as preferências', () => {
  const settings = loadSettings();
  settings.difficulty = 'especialista';
  saveSettings(settings);
  recordGame('iniciante', { won: true, seconds: 10 });
  clearStats();
  assert.deepEqual(loadStats(), {});
  assert.equal(loadSettings().difficulty, 'especialista');
});

test('com o armazenamento bloqueado, o jogo continua com os padrões', () => {
  installStorage({ failing: true });
  assert.equal(loadSettings().difficulty, defaultSettings.difficulty);
  assert.equal(saveSettings({ difficulty: 'especialista' }), false);
  assert.deepEqual(loadStats(), {});
  assert.equal(clearStats(), false);
  const { entry } = recordGame('iniciante', { won: true, seconds: 5 });
  assert.equal(entry.played, 1, 'a partida ainda é contabilizada na memória');
});

test('sem localStorage nenhum, nada quebra', () => {
  delete globalThis.localStorage;
  assert.equal(loadSettings().difficulty, defaultSettings.difficulty);
  assert.equal(saveSettings({}), false, 'sem onde salvar, avisa que não salvou');
  assert.equal(clearStats(), false);
  installStorage();
});
