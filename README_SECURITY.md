# Security & deployment notes

This branch implements a number of security-related features and infra changes.

Environment variables (recommended):
- SESSION_SECRET (required in production)
- REDIS_URL (required in production; defaults to redis://localhost:6379 only for local development)
- DATABASE_URL (Postgres, required in production)
- NODE_ENV=production to enable secure cookies
- STRIPE_SECRET_KEY and the three STRIPE_PRICE_* values (required for checkout)
- STRIPE_WEBHOOK_SECRET (recommended to persist paid orders)
- RECAPTCHA_SECRET and RECAPTCHA_SITE_KEY (optional, but they must be configured together)

Run locally (with Docker):
1. docker compose up -d
2. npm install
3. export REDIS_URL=redis://localhost:6379
   (optional) export DATABASE_URL=postgres://neuralx:neuralx@localhost:5432/neuralxdb
4. export SESSION_SECRET="$(openssl rand -hex 32)"
5. npm start

Notes:
- If DATABASE_URL is set, the app will use Postgres (pg). Otherwise it falls back to SQLite (data.sqlite).
- Stripe / captcha integration requires you to set provider secrets as environment variables; do NOT embed them in the frontend.
