# Security changes applied

This commit includes the following:

- DB abstraction (lib/db.js) that uses Postgres (if DATABASE_URL is set) or falls back to SQLite.
- Docker Compose configuration with Postgres and Redis for local dev.
- Account lockout using Redis (failed attempts -> lock key).
- MFA (TOTP) setup, verification and authenticated disable flow using speakeasy + QR code generation. Disabling requires both the current password and a valid TOTP code.
- Server-side Stripe checkout endpoint that uses `STRIPE_SECRET_KEY` and validates the configured `STRIPE_PRICE_*` values.
- Signed Stripe webhook that stores paid orders idempotently.
- CAPTCHA verification hook (`RECAPTCHA_SECRET` and `RECAPTCHA_SITE_KEY`); optional, but both values must be configured together.
- CSP tightened via Helmet and session-bound CSRF tokens required on state-changing API requests.

Please review README_SECURITY.md for instructions on environment variables and running locally.
