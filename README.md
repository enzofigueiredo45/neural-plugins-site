# Neural Plugins Site

Site estático para vender o pacote digital **Neural Amp Pack**.

## Deploy na Vercel

Este projeto não usa build step. A Vercel deve publicar os arquivos da raiz do repositório:

- `index.html`
- `styles.css`
- `main.js`
- `assets/`
- `privacy.html`
- `terms.html`
- `vercel.json`

Se o deploy aparecer sem layout ou com texto antigo, confira no painel da Vercel:

1. **Git Branch**: use a branch que recebeu o último push.
2. **Root Directory**: deixe vazio ou como `./`.
3. **Build Command**: deixe vazio.
4. **Output Directory**: deixe vazio.
5. **Install Command**: pode ficar vazio, porque não há dependências.
6. Faça **Redeploy** usando a opção **Clear Build Cache**.

A captura sem CSS normalmente indica que a Vercel está servindo um commit antigo ou uma configuração de projeto apontando para outra pasta/branch.

## Teste local

```bash
npm test
python3 -m http.server 4173
```

Depois abra `http://127.0.0.1:4173/`.
