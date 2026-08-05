---
name: "Fix client login and dashboard"
about: "Valida login do cliente; mostra produto comprado com imagem, nome e email; melhorias de segurança e parsing JSON"
---

This PR includes:

- client-login.html: Página de login do cliente (validação no front-end).
- client-dashboard.html: Dashboard do cliente que exibe email, produto comprado (nome, status, preço) e permite upload/preview de imagem.
- main.js: Ajustes para salvar role/email na sessionStorage, validação e proteção do fluxo.
- server.js: Correções de segurança (path.resolve, JSON parse seguro) feitas anteriormente on this branch.

Suggested testing steps:
1. Run `node server.js`
2. Open `/client-login.html` and log in with `demo@neuralx.com / neuralx123`
3. Confirm redirect to `/client-dashboard.html` with product details and image preview working.

Notes:
- The server currently returns static demo orders. For production, implement server-side sessions and persistent storage for orders and uploaded images.
