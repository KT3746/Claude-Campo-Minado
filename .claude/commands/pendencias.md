---
description: Resume o que ficou pendente, para eu guardar antes de dar /clear
---

Faça um balanço do estado atual do trabalho. Verifique de fato, não vá de
memória: `git status`, `git log` da branch contra a `main`, e se há commits
ainda não enviados para o `origin`.

Responda em formato curto, nesta ordem:

1. **Não commitado** — arquivos modificados no working tree, com uma linha
   dizendo o que cada mudança faz. "Nada pendente" se estiver limpo.
2. **Não enviado** — commits locais que ainda não foram para o `origin`.
3. **Em andamento** — o que estávamos fazendo quando paramos, incluindo
   decisões já tomadas que não estão escritas em nenhum arquivo.
4. **Próximo passo** — a primeira coisa a fazer ao retomar.
5. **Riscos** — testes falhando, algo pela metade que quebraria se ficasse
   assim, dúvidas que ficaram sem resposta. Omita esta seção se não houver.

Seja honesto sobre o que ficou incompleto: este resumo existe justamente para
eu não perder trabalho ao limpar o contexto. Se algo aqui merece virar registro
permanente do projeto, diga que vale a pena escrever no `CLAUDE.md`.
