# Security changes applied

This commit includes the following:

- DB abstraction (lib/db.js) that uses Postgres (if DATABASE_URL is set) or falls back to SQLite.
- Docker Compose configuration with Postgres and Redis for local dev.
- Account lockout using Redis (failed attempts -> lock key).
- MFA (TOTP) setup and verify endpoints using speakeasy + QR code generation.
- Server-side Stripe checkout endpoint that uses STRIPE_SECRET (server env var).
- CAPTCHA verification hook (RECAPTCHA_SECRET env var); currently optional — if not set the checks bypass but you must set it for production.
- CSP tightened via helmet, CSRF remains active via csurf cookie.

Please review README_SECURITY.md for instructions on environment variables and running locally.
