# Dashboard

The admin and store staff dashboard (Next.js 16). It talks to the API at `API_URL` from the server only; the browser never calls the API directly.

```bash
cp .env.example .env
pnpm --filter admin dev   # http://localhost:3000
```

Setup, sample accounts and deployment are covered in the [root README](../../README.md).
