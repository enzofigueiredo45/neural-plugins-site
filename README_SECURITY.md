# Security & deployment notes

This branch implements a number of security-related features and infra changes.

Environment variables (recommended):
- SESSION_SECRET (required in production)
- REDIS_URL (defaults to redis://localhost:6379)
- DATABASE_URL (optional; if set, Postgres will be used)
- NODE_ENV=production to enable secure cookies
- STRIPE_SECRET (optional) for Stripe server endpoints
- RECAPTCHA_SECRET (optional) for CAPTCHA verification

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
