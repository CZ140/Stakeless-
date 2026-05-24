# Backend integration tests

These suites exercise real HTTP routes (via `supertest`) against a real Postgres
database, complementing the pure-logic unit tests under `src/**/*.test.ts`.

## What's covered
- **`blackjack.route.test.ts`** — the money path through `POST /api/games/blackjack/*`:
  stake is deducted on deal, settlement credits the reported per-hand profit, the
  persisted balance matches the API response, one `game_logs` row is written per
  hand, and insufficient funds returns 402 without touching the balance.
- **`profile.route.test.ts`** — the SQL aggregates behind `GET /api/profile/:username`:
  games played, win rate (pushes excluded), today/30-day rollups, game mix,
  biggest win, streak, and whole-table balance rank (incl. ties).

## Requirements
A Postgres instance must be reachable at
`postgresql://postgres:postgres@localhost:5432` — the same one used for dev:

```
docker compose up -d postgres
```

`test/globalSetup.ts` then creates a dedicated **`gambling_test`** database (never
the dev DB) and migrates it. Each test truncates all tables (`resetDb`), and the
suite runs with `fileParallelism: false` since it shares one database.

Override the connection with `TEST_DATABASE_URL` / `TEST_ADMIN_URL` if needed.

## Running
```
pnpm --filter backend test
```
Unit and integration suites run together. (Integration tests require the DB above;
if Postgres isn't running, `globalSetup` will fail with a connection error.)
