# Ambiente de produção — vínculo Vercel e Neon

Atualizado em 07/09/2026. Este documento não contém URL de conexão, credencial, host completo, usuário, senha ou token.

| Camada | Identificador seguro | Evidência | Estado |
|---|---|---|---|
| Vercel | projeto `neural-plugins-site` | deployment produtivo do merge `aa562b6` em estado `READY` | CONFIRMADO |
| Vercel | `DATABASE_URL` em Production e Preview | variável do tipo Secret presente no painel desde 06/08/2026 | CONFIRMADO |
| Neon | projeto `delicate-salad-35514405` | único projeto acessível com as tabelas reais da aplicação; os outros projetos inspecionados não contêm o schema comercial | CONFIRMADO |
| Neon | branch `production` | única branch original do projeto, pronta e marcada como principal/padrão | CONFIRMADO |
| Vercel→Neon | projeto/branch usados em produção | proprietário confirmou a chave configurada; `/api/health` confirmou banco operacional; schema e branch foram reconciliados sem revelar a URL | CONFIRMADO |

## Conclusão

O vínculo produtivo foi confirmado sem copiar ou registrar a connection string. O projeto é `delicate-salad-35514405` e a branch original é `production`.

## Próximo passo seguro

Manter a connection string fora de chat, issue, log e documentação. Em futuras rotações, Preview deve apontar para branch isolada, não para produção.
