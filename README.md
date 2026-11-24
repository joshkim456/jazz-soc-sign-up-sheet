# Jam Manager

Live jam line-up for Jazz Society. Add a player, they land on stage or in the queue for their instrument; **Next tune** rotates anyone who has played their share.

## Deploy (Vercel)

1. Import this repo at vercel.com/new.
2. Storage → add **Upstash for Redis** and connect it to the project (sets `KV_REST_API_URL` / `KV_REST_API_TOKEN`).
3. Settings → Environment Variables → `JAM_PIN` = the committee PIN.
4. Redeploy, then link the URL from the society website.

## Local

```
npm install
npm run dev
npm test
```

Without Redis the state lives in memory (a brass dot shows in the header).
