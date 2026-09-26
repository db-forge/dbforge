# DBForge

A Monad-based real-world data marketplace for Physical AI. AI/robotics
companies create data collection missions, contributors capture real-world
data with their phones, submissions are verified for quality/fraud, and
accepted submissions receive rewards through Monad.

This repository is currently a **scaffold only** — no features are
implemented yet. It exists to let three developers work in parallel without
stepping on each other's files.

## Tech stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Supabase
- Solidity + Foundry
- wagmi + viem
- Monad Testnet

## Project structure

```
app/
  page.tsx              Home page
  marketplace/           Browse missions
  create/                 Create a mission (buyer)
  mission/[id]/           Mission detail + submission flow
  buyer/                  Buyer dashboard
  api/
    missions/             Mission CRUD endpoints
    submissions/          Submission endpoints
    verify/                Verification trigger endpoint

components/              Shared UI components

lib/
  types.ts                Shared domain types (Mission, Submission)
  monad/                   Monad/wagmi/viem client + contract helpers
  verification/            Quality/fraud verification logic
  supabase/                Supabase client + data access

contracts/                Foundry project (Solidity contracts)
  src/
  script/
  test/

supabase/
  migrations/              SQL migrations

public/                    Static assets
```

## Ownership boundaries

To avoid merge conflicts, each developer owns a distinct set of directories.
Please don't edit files outside your area without checking with the owner
first.

| Developer | Owns |
|---|---|
| **Developer 1** | `app/` pages (everything except `app/api/`), `components/` |
| **Developer 2** | `contracts/`, `lib/monad/` |
| **Developer 3** | `app/api/`, `lib/verification/`, `lib/supabase/`, `supabase/` |

**Shared files** (coordinate before changing): `lib/types.ts`,
`.env.example`, `README.md`.

## Domain model

Defined in [`lib/types.ts`](./lib/types.ts):

- **Mission** — a data collection request created by a buyer, tracked
  on-chain (`chainMissionId`) and off-chain. Status: `draft | active |
  completed | cancelled`.
- **Submission** — a piece of contributed data against a mission, run
  through verification before being accepted and paid. Status:
  `uploaded | verifying | accepted | rejected | paid`.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in real values
npm run dev                  # start the Next.js app
npm run build                # production build
npm run lint                 # lint
```

Foundry contracts live in `contracts/` and are a separate toolchain (not
part of the npm scripts above). See [`contracts/README.md`](./contracts/README.md)
to get started there.

## What's next per developer

**Developer 1** — flesh out `app/marketplace`, `app/create`,
`app/mission/[id]`, and `app/buyer` with real UI, backed by shared
components in `components/`.

**Developer 2** — run `forge init` inside `contracts/`, write the mission
escrow + reward payout contracts, and build out `lib/monad/` (wagmi config,
Monad Testnet chain definition, contract read/write helpers).

**Developer 3** — implement `app/api/missions`, `app/api/submissions`, and
`app/api/verify`, wire up `lib/supabase/` (client + queries), write the
first Supabase migrations in `supabase/migrations/`, and build out
verification logic in `lib/verification/`.
