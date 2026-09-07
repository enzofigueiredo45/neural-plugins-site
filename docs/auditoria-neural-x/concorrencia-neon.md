# Concorrência PostgreSQL — Neon

Executado em 07/09/2026 no projeto `delicate-salad-35514405`, exclusivamente na branch isolada `test-concorrencia-20260907-v3` (`br-rough-waterfall-acbn4ctv`), criada a partir de `production`. Nenhuma escrita foi feita na branch produtiva e nenhum dado pessoal real foi usado.

## Resultado binário

| Cenário | Carga simultânea | Resultado observado | Critério | Gate |
|---|---:|---|---|---|
| Cadastro duplicado | 10 inserts do mesmo e-mail artificial | 1 insert aceito; 9 rejeitados por `users_email_key` | exatamente 1 registro | FECHADO |
| Consumo único de token | 5 updates atômicos do mesmo token artificial | 1 consumidor recebeu a linha; 4 receberam zero linhas | exatamente 1 consumo | FECHADO |
| Deduplicação da outbox | 3 inserts com a mesma `dedupe_key` | 1 insert; 2 conflitos ignorados; contagem final = 1 | exatamente 1 linha | FECHADO |

## Consultas usadas

Os testes utilizaram somente dados reservados de auditoria (`example.invalid`) e operações parametrizáveis equivalentes às garantias do aplicativo:

- unicidade de `users.email`;
- consumo atômico com `used_at IS NULL ... RETURNING`;
- `INSERT ... ON CONFLICT (dedupe_key) DO NOTHING` na `email_outbox`.

## Limites e limpeza

- O teste comprova as garantias de concorrência do PostgreSQL e dos índices da aplicação. Ele não simula latência HTTP nem limites da Vercel.
- A branch temporária foi mantida para inspeção. A exclusão é destrutiva e depende de autorização explícita do proprietário.

**Estado do gate A4:** FECHADO.
