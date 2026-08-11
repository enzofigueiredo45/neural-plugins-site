# SEO máximo e chaves/API necessárias

Não existe configuração que garanta primeiro lugar no Google, Bing ou IA, mas esta lista deixa o site tecnicamente pronto para rastreamento, confiança e validações externas.

## Onde configurar cada chave

### 1. Stripe Checkout

Configure no painel da hospedagem (Vercel, Render, Railway etc.) em **Environment Variables**. Não coloque no HTML, CSS, `main.js` ou Git.

```env
STRIPE_SECRET_KEY=sk_live_ou_sk_test_da_sua_conta
STRIPE_PRICE_NEURAL_X=price_do_produto_pacote_neural_x
STRIPE_PRICE_FL_STUDIO=price_do_produto_fl_studio
STRIPE_PRICE_REAPER=price_do_produto_reaper
STRIPE_WEBHOOK_SECRET=whsec_do_endpoint_stripe
SITE_URL=https://seu-dominio.com
```

O código que lê essas variáveis está em `server.js` nas funções `getStripeSecret()`, `getProductCatalog()` e no endpoint `POST /api/create-checkout-session`.

### 2. Sessão, login e banco

Configure também na hospedagem:

```env
NODE_ENV=production
SESSION_SECRET=um_valor_aleatorio_longo_com_32_ou_mais_caracteres
REDIS_URL=redis://usuario:senha@host:porta
DATABASE_URL=postgres://usuario:senha@host:porta/banco
DEMO_ACCOUNTS_ENABLED=false
```

`SESSION_SECRET` assina cookies de sessão. `REDIS_URL` guarda sessão e bloqueio de tentativas. `DATABASE_URL` deve apontar para Postgres em produção; em desenvolvimento, sem `DATABASE_URL`, o servidor usa SQLite local em `data.sqlite` e cria as tabelas automaticamente.

### 3. reCAPTCHA / antifraude

Configure no provedor do Google reCAPTCHA e salve no ambiente:

```env
RECAPTCHA_SECRET=sua_chave_secreta_recaptcha
RECAPTCHA_SITE_KEY=sua_chave_publica_recaptcha
```

A chave pública carrega o reCAPTCHA v3 no login e a validação é feita no backend em `verifyCaptcha()`. Configure as duas chaves juntas.

### 4. Google Search Console

Você não precisa de uma API key para indexar. O caminho recomendado é:

1. Criar propriedade em https://search.google.com/search-console/about.
2. Validar domínio por DNS TXT no provedor do domínio.
3. Enviar `https://seu-dominio.com/sitemap.xml`.
4. Inspecionar as URLs principais e solicitar indexação.

Se preferir meta tag HTML, coloque a tag de verificação do Google dentro do `<head>` de `index.html`, por exemplo:

```html
<meta name="google-site-verification" content="CODIGO_DO_GOOGLE" />
```

### 5. Bing Webmaster Tools / IndexNow

Para Bing, crie conta em https://www.bing.com/webmasters, valide o domínio e envie o sitemap. IndexNow é opcional; se usar, gere uma chave e publique um arquivo `SUA_CHAVE.txt` na raiz do site com o mesmo valor.

## Checklist SEO técnico aplicado no código

- URLs importantes listadas em `sitemap.xml` e também servidas dinamicamente por `/sitemap.xml` quando o Express estiver ativo.
- `robots.txt` aponta para o sitemap e bloqueia painéis/API que não devem ser rastreados.
- Páginas de produto têm canonical, meta description, Open Graph e JSON-LD `Product` com preço/disponibilidade.
- Página de contato/suporte foi criada para reforçar confiança e E-E-A-T.
- Páginas privadas, carrinho, login e sucesso usam `noindex,follow` para evitar indexação de áreas fracas/duplicadas.
- `llms.txt` descreve o site para crawlers/assistentes que usam esse padrão informal.

## O que ainda falta para parecer 100% confiável

- Domínio próprio com HTTPS.
- E-mail profissional no mesmo domínio.
- CNPJ/razão social ou responsável publicado em contato/termos.
- Política clara de reembolso, suporte e entrega digital.
- Comprovação de licença/autorização para vender os produtos listados.
- Webhook Stripe para liberar pedido só após pagamento confirmado.
- Conteúdo original: descrições completas, FAQs, tutoriais, screenshots reais e comparação de produtos.
