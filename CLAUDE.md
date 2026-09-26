# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Comandos

```bash
npm start                                              # servidor local em http://127.0.0.1:4173
npm test                                               # os 78 testes (node:test, sem dependências)
node --test tests/engine.test.js                       # um arquivo só
node --test --test-name-pattern="chording" tests/*.js  # um teste só, por nome
```

Não há build, lint nem gerenciador de pacotes: `node_modules/` nunca existe. A CI
(`.github/workflows/ci.yml`) roda apenas `npm test` no Node 20 e 22; `pages.yml`
publica a raiz do repositório no GitHub Pages a cada push na `main`.

O jogo usa módulos ES, que não carregam por `file://` — abrir o `index.html`
direto no navegador não funciona. Use `npm start`.

## Restrição central do projeto

**Zero dependências, zero build.** Nada de npm install, bundler, transpilador ou
framework. Toda funcionalidade nova precisa caber em JavaScript de navegador
moderno + APIs nativas. Isso é uma decisão de projeto, não uma limitação
temporária: os sons são sintetizados na Web Audio API em vez de arquivos, o
servidor de desenvolvimento é um `node:http` de 67 linhas, e os testes usam
`node:test`. O código e os comentários são escritos em português.

## Arquitetura

A divisão que importa: **as regras do jogo não conhecem o DOM**. Todo `src/js/`
é lógica pura testável em Node, exceto `view.js`, `sound.js` e `app.js`.

```
board.js   → engine.js ← generator.js → solver.js
                ↑                          ↑
              app.js  →  view.js       (também alimenta a dica)
                ↓
              link.js  (hash da partida: montar e ler)
```

**Representação do tabuleiro.** Arrays tipados achatados (`Uint8Array`), índice =
`linha * cols + coluna`. Os vizinhos de cada célula são pré-calculados uma vez em
`buildNeighborIndex` (`board.js`) num `Int32Array` de 8 posições por célula, com
um `counts` dizendo quantas são válidas nas bordas. Percorrer vizinhos é sempre
`offsets[index * 8 + k]` para `k < counts[index]`, nunca cálculo de limites.

**Protocolo de retorno do motor.** Toda operação de `engine.js` (`reveal`,
`toggleFlag`, `chord`) devolve `{ changed, status, exploded, invalid }`, onde
`changed` é a lista de índices alterados. A view repinta só esses índices — nunca
o tabuleiro inteiro. Se você adicionar uma operação ao motor, ela precisa seguir
esse contrato ou a interface não vai atualizar.

**Minas só existem depois do primeiro clique.** `createGame` cria o jogo vazio
com `placed: false`; a primeira chamada de `reveal` chama `placeMinesFor`, que
sorteia as minas fora da zona segura. É isso que garante que o primeiro clique
nunca explode. Qualquer código que leia `game.mines` antes disso vê tudo zero.

**Modo sem chute** (`generator.js` + `solver.js`). O gerador sorteia um campo,
entrega ao `solveFrom` e só o aceita se o solucionador terminar a partida usando
apenas dedução. O orçamento é de **trabalho** (`maxWork`, tentativas × células),
não de tempo: se acabar, devolve o *primeiro* sorteio — o tabuleiro clássico
daquela semente — com `solvable: false`, e a interface avisa que a partida pode
exigir palpite. Ele nunca falha, apenas degrada. Nunca volte a devolver "o último
sorteio que coube no tempo": isso fazia a mesma semente gerar tabuleiros
diferentes em aparelhos de velocidades diferentes, quebrando o link. O relógio
(`budgetMs`) é só rede de segurança para aparelhos lentos, consultado a cada 32
tentativas porque `Date.now()` pesa no laço. Densidade medida: até 24% de minas
sempre acha; de ~28% em diante, nunca.

**O solucionador é o mesmo para gerar e para dar dica.** `deduce()` recebe apenas
o que o jogador vê (`revealed`, `flagged`) e nunca olha `mines`. Aplica três
regras em ordem, parando na primeira que produz resultado: simples → subconjunto
→ contagem global. Como as deduções partem das bandeiras do jogador, uma bandeira
errada produz conclusões erradas: `giveHint()` em `app.js` confere o resultado
contra o tabuleiro real e, se não bater, avisa que há bandeira fora do lugar em
vez de dar uma dica falsa.

**Determinismo por semente.** `mulberry32` (`rng.js`) faz a mesma semente gerar
sempre o mesmo tabuleiro — é o que permite compartilhar partidas por link e
escrever testes reprodutíveis. O hash (`#dif=...&semente=...`, mais `l`, `c` e
`m` no tabuleiro personalizado) é montado e lido só em `link.js`: montar em dois
lugares já custou um bug em que o botão de copiar esquecia as medidas e quem
abria o link caía em outro tabuleiro. Qualquer coisa que gere link passa por lá.

**Persistência tolerante a falhas** (`storage.js`). Todo acesso ao `localStorage`
está dentro de try/catch e o jogo funciona normalmente sem ele (janela anônima,
cookies bloqueados, cota estourada). Preferências novas entram em
`defaultSettings`, que é mesclado com o que estiver salvo — versões antigas nunca
quebram.

**Acessibilidade não é opcional.** A grade é `role="grid"` com *roving tabindex*
(só a célula focada tem `tabIndex = 0`) e cada célula carrega um `aria-label`
descritivo gerado por `describe()` em `view.js`. Ao mexer em estado de célula,
atualize também esse rótulo. Mensagens ao jogador passam por `say()`, que escreve
na região `aria-live`.

## Detalhes que economizam tempo

- `tests/helpers.js` tem `gameFromMap(['*..', '...'])`: monta uma partida com
  minas em posições fixas, sem sorteio. É o jeito de testar cenários específicos.
- `tests/invariantes.test.js` joga centenas de partidas aleatórias e checa o que
  precisa valer sempre. Foi ele que pegou o vazamento de `questionCount` ao
  perder. Mexeu no motor ou no solucionador? É o teste que dá o veredito.
- Opções que afetam a geração (sem chute, primeiro clique seguro) só valem na
  próxima partida, salvo se a atual ainda não começou — ver
  `afterGenerationSettingChange()` em `app.js`.
- `globalThis.campoMinado` expõe `game`, `restart` e `startGame` para depuração
  no console do navegador.
- `toText(game, { showMines: true })` serializa o tabuleiro como texto — útil em
  teste e depuração.
- Limite de 60 linhas ou colunas (`MAX_DIMENSION` em `engine.js`); erros de
  configuração chegam como `RangeError` com mensagem em português já pronta para
  exibir.
