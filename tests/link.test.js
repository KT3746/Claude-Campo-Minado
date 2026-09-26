import test from 'node:test';
import assert from 'node:assert/strict';

import { buildHash, parseHash } from '../src/js/link.js';
import { seedFromText } from '../src/js/rng.js';

/* --- Montagem -------------------------------------------------------------- */

test('o hash de uma dificuldade clássica carrega nome e semente', () => {
  const hash = buildHash({ difficulty: 'especialista', seed: 42, rows: 16, cols: 30, mines: 99 });
  assert.equal(hash, '#dif=especialista&semente=42');
});

test('o hash de um tabuleiro personalizado carrega as medidas', () => {
  const hash = buildHash({ difficulty: 'personalizado', seed: 7, rows: 12, cols: 18, mines: 30 });
  const params = new URLSearchParams(hash.slice(1));
  assert.equal(params.get('l'), '12');
  assert.equal(params.get('c'), '18');
  assert.equal(params.get('m'), '30');
});

/* --- Leitura --------------------------------------------------------------- */

test('parseHash aceita o hash com ou sem "#"', () => {
  assert.deepEqual(parseHash('#dif=iniciante'), { difficulty: 'iniciante' });
  assert.deepEqual(parseHash('dif=iniciante'), { difficulty: 'iniciante' });
});

test('parseHash devolve só o que o link especifica', () => {
  assert.deepEqual(parseHash(''), {});
  assert.deepEqual(parseHash('#semente=99'), { seed: 99 });
});

test('parseHash converte texto livre em semente', () => {
  assert.equal(parseHash('#semente=campo').seed, seedFromText('campo'));
});

test('semente vazia é ignorada em vez de virar zero', () => {
  assert.equal('seed' in parseHash('#dif=iniciante&semente='), false);
});

test('personalizado sem as medidas não é aceito pela metade', () => {
  // Sem `l`, `c` e `m` não há tabuleiro que o link consiga descrever: melhor não
  // devolver dificuldade nenhuma do que mandar quem chama jogar 0×0.
  const lido = parseHash('#dif=personalizado&semente=5');
  assert.equal('difficulty' in lido, false);
  assert.equal('custom' in lido, false);
  assert.equal(lido.seed, 5);
});

test('personalizado com medidas impossíveis também é descartado', () => {
  for (const hash of ['#dif=personalizado&l=1&c=1&m=50', '#dif=personalizado&l=99&c=99&m=1']) {
    const lido = parseHash(hash);
    assert.equal('difficulty' in lido, false);
    assert.equal('custom' in lido, false);
  }
});

test('link descartado explica o motivo, para a interface avisar o jogador', () => {
  // Antes o link inválido caía no Iniciante em silêncio.
  assert.match(parseHash('#dif=personalizado&l=99&c=9&m=10').problem, /60 linhas ou colunas/);
  assert.equal('problem' in parseHash('#dif=especialista&semente=1'), false);
});

/* --- Ida e volta ----------------------------------------------------------- */

test('o link de uma partida personalizada recria o mesmo tabuleiro', () => {
  // Este é o bug que o módulo existe para impedir: a barra de endereço e o botão
  // de copiar montavam o hash em lugares diferentes, e o do botão esquecia as
  // medidas — quem abria o link caía no tabuleiro padrão dele.
  const partida = { difficulty: 'personalizado', seed: 123456789, rows: 12, cols: 18, mines: 30 };
  const lido = parseHash(buildHash(partida));
  assert.equal(lido.difficulty, 'personalizado');
  assert.deepEqual(lido.custom, { rows: 12, cols: 18, mines: 30 });
  assert.equal(lido.seed, 123456789);
});

test('a ida e volta preserva as dificuldades clássicas', () => {
  for (const dif of ['iniciante', 'intermediario', 'especialista']) {
    const lido = parseHash(buildHash({ difficulty: dif, seed: 1, rows: 9, cols: 9, mines: 10 }));
    assert.deepEqual(lido, { difficulty: dif, seed: 1 });
  }
});
