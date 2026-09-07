# Ambiente de produção — vínculo Vercel e Neon

Atualizado em 07/09/2026. Este documento não contém URL de conexão, credencial, host completo, usuário, senha ou token.

| Camada | Identificador seguro | Evidência | Estado |
|---|---|---|---|
| Vercel | projeto `neural-plugins-site` | projeto autenticado; deployment de `8de974e` em estado `READY` | CONFIRMADO |
| Vercel | `DATABASE_URL` em Production e Preview | variável do tipo Secret presente no painel desde 06/08/2026 | CONFIRMADO |
| Neon | projeto provável `delicate-salad-35514405` | único projeto inspecionado com as tabelas da aplicação | CONFIRMADO COMO CANDIDATO |
| Neon | branch `production` | única branch listada, pronta e marcada como principal/padrão | CONFIRMADO NO CANDIDATO |
| Vercel→Neon | projeto/branch exatos contidos em `DATABASE_URL` | valor é write-only e não pode ser revelado no painel após o salvamento | INFERIDO_COM_ALTA_CONFIANCA |

## Conclusão

Há forte convergência para o projeto `delicate-salad-35514405`, branch `production`, mas o critério de aceite do P0-A ainda não foi atingido: o host/identificador embutido no segredo da Vercel não pôde ser comparado diretamente.

## Próximo passo seguro

Um administrador deve comparar, no próprio painel ou ao rotacionar a variável, apenas o identificador do projeto e o nome da branch. Não copiar a string completa para chat, issue, log ou documento. Se a variável for rotacionada, Preview deve apontar para branch isolada, não para produção.

