---
description: Revisa o que mudou, roda os testes e commita com mensagem descritiva
---

Commite o trabalho que está pronto neste repositório.

Antes de commitar:

1. Rode `git status` e `git diff` para ver exatamente o que mudou.
2. Rode `npm test` — são 60 testes em menos de meio segundo, não há desculpa
   para pular. Se algum falhar, **não commite**: mostre a falha e pergunte se
   quero corrigir antes.
3. Confira em que branch estamos. Nunca commite direto na `main`.

Ao commitar:

- Agrupe as mudanças por assunto. Se o diff mistura dois trabalhos sem relação,
  faça dois commits em vez de um só.
- Escreva a mensagem em português, explicando **por que** a mudança existe, não
  o que o diff já mostra. A primeira linha é um resumo curto no imperativo
  ("Corrige o contador de minas ao desmarcar bandeira"); o corpo, quando
  necessário, explica o motivo e o que foi descartado.
- Deixe de fora arquivos temporários e de depuração.

Depois de commitar, **não faça push sem eu pedir**. Mostre o resumo do que foi
commitado e pergunte se quero enviar.
