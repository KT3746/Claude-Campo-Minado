# Campo Minado

Campo Minado completo em HTML, CSS e JavaScript puro — **sem dependências, sem
build, sem framework**. Abre em qualquer navegador moderno e roda offline.

![Feito com JavaScript puro](https://img.shields.io/badge/JavaScript-puro-f7df1e)
![Sem dependências](https://img.shields.io/badge/depend%C3%AAncias-0-brightgreen)
![Testes](https://img.shields.io/badge/testes-74-blue)

## Como rodar

O jogo usa módulos ES, que os navegadores não carregam pelo protocolo `file://`.
Suba um servidor local — o projeto traz um, sem instalar nada:

```bash
npm start            # http://127.0.0.1:4173
```

Alternativas equivalentes:

```bash
python3 -m http.server 4173
npx serve .
```

## O que tem aqui

**Jogabilidade**

- Três níveis clássicos (9×9/10, 16×16/40, 16×30/99) e tabuleiro personalizado
  até 60×60.
- **Modo sem chute** (ligado por padrão): o tabuleiro só é aceito se um
  solucionador lógico conseguir terminá-lo do início ao fim. Nenhuma partida
  acaba num cara-ou-coroa.
- Primeira jogada sempre segura, abrindo uma clareira ao redor do clique.
- Abrir vizinhos (*chording*) pelo clique do meio, pelos dois botões juntos ou
  por um clique no próprio número.
- Marca de interrogação opcional, dica honesta, cronômetro, contador de minas,
  recordes e estatísticas por dificuldade.
- Partidas com semente: a mesma semente recria o mesmo tabuleiro, e o link da
  partida pode ser copiado e compartilhado.

**Interface**

- Tema claro, escuro ou acompanhando o sistema.
- Layout que se ajusta à tela; zoom próprio para tabuleiros grandes.
- Efeitos sonoros sintetizados na hora com a Web Audio API (nenhum arquivo de
  áudio) e vibração no celular.
- Animações de cascata, explosão e vitória, todas desligadas automaticamente
  quando o sistema pede menos movimento (`prefers-reduced-motion`).

**Acessibilidade**

- Tabuleiro navegável só pelo teclado, com *roving tabindex* e rótulos
  descritivos em cada célula ("Linha 3, coluna 7: 2 minas ao redor").
- Grade anunciada como tabela (`role="grid"`), avisos em região `aria-live`,
  foco visível e link para pular direto ao tabuleiro.

## Controles

| Ação | Mouse | Teclado | Toque |
| --- | --- | --- | --- |
| Abrir | clique esquerdo | `Espaço` | toque |
| Bandeira | clique direito | `F` | toque longo, ou modo bandeira |
| Abrir vizinhos | botão do meio, dois botões, ou clique no número | `Enter` | toque no número |
| Mover | — | setas, `Home`, `End`, `PageUp`, `PageDown` | — |

Atalhos gerais: `R` nova partida · `D` dica · `B` modo bandeira · `T` tema ·
`M` som · `H` ajuda · `E` estatísticas · `P` configurações · `1`–`4`
dificuldade.

## Estrutura

```
index.html            página e diálogos
src/css/styles.css    tokens de tema, layout e animações
src/js/
  board.js            vizinhança e contagem de minas adjacentes
  engine.js           regras do jogo (sem DOM): abrir, marcar, chord, vitória
  generator.js        sorteio dos campos, incluindo o modo sem chute
  solver.js           dedução lógica: gera tabuleiros justos e dá as dicas
  rng.js              gerador pseudoaleatório com semente
  storage.js          preferências, recordes e estatísticas
  sound.js            efeitos sintetizados (Web Audio)
  view.js             render do tabuleiro e acessibilidade da grade
  app.js              eventos, HUD e diálogos
scripts/serve.mjs     servidor estático de desenvolvimento
tests/                testes do motor, do solucionador e do resto da lógica
```

Toda a regra do jogo vive em módulos sem DOM, o que deixa o motor testável em
Node e a interface livre para mudar sem tocar nas regras.

## Como funciona o modo sem chute

As minas só são posicionadas depois do primeiro clique. No modo sem chute, o
gerador sorteia um campo, entrega ao solucionador e só o aceita se ele for
resolvível **apenas por dedução**:

1. **Regra simples** — um número já satisfeito libera as células ao redor; um
   número igual à quantidade de ocultas marca todas como minas.
2. **Regra de subconjunto** — se as ocultas de um número estão contidas nas de
   outro, a diferença carrega exatamente a diferença das minas (é o que resolve
   o clássico 1-2-1).
3. **Contagem global** — usa o total de minas restantes, inclusive comparando a
   soma de restrições disjuntas com o que sobrou fora da fronteira.

Na prática, um campo nível especialista costuma sair em menos de 20 sorteios e
poucos milissegundos. Existe um orçamento de tempo: se ele estourar, o jogo
avisa na barra de status que aquela partida pode exigir um palpite.

O mesmo solucionador alimenta o botão **Dica**, que só aponta o que o jogador
poderia ter provado — e avisa quando as deduções não fecham porque alguma
bandeira está no lugar errado.

## Testes

```bash
npm test
```

74 testes em Node puro (`node:test`), cobrindo validação de configuração,
segurança do primeiro clique, cascata de abertura, bandeiras, *chording*,
vitória e derrota, as três regras de dedução, a geração sem chute, o link
compartilhável e a persistência (incluindo armazenamento bloqueado ou
corrompido).

Parte deles são **testes de invariante** (`tests/invariantes.test.js`): em vez de
conferir casos escolhidos a dedo, jogam centenas de partidas aleatórias e exigem
que certas afirmações valham em todas — que o solucionador nunca minta, que os
contadores acompanhem o tabuleiro, que vitória e derrota só aconteçam quando de
fato aconteceram. As sementes são fixas, então qualquer falha é reproduzível.

## Licença

MIT.
