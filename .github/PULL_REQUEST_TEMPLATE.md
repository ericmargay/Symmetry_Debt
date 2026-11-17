<!-- English or Spanish, whichever you prefer. · En español o en inglés, como prefieras. -->

## What changes and why · Qué cambia y por qué



## How it was checked · Cómo se comprobó

- [ ] `npm run check` (lint, types, unit tests)
- [ ] `npm run test:integration` — if it touches `src/server`, `src/domain` or `prisma/`
- [ ] `npm run test:e2e` — if it touches pages or sign-in
- [ ] Tried by hand in the browser, in Spanish and in English, on a phone-sized screen

## Checklist

- [ ] Amounts are `bigint` minor units from end to end. No `Number`, no `parseFloat`.
- [ ] Every text a person can read comes from `messages/es.json` **and** `messages/en.json`.
- [ ] New server code receives an explicit actor and checks access before touching data.
- [ ] A personal record is never presented as confirmed by both sides, and nothing private
      becomes visible to the other person without their owner choosing to share it.
- [ ] Schema changes come with a migration, and confirmed history stays append-only.
- [ ] Docs updated if behaviour, configuration or deployment changed (`README`, `docs/`, `.env.example`).
