# lib/frontend/

Owner: **Developer 1 (frontend)**. UI components only call `api.ts` and `chain.ts`.

## Data source

| `NEXT_PUBLIC_DATA_SOURCE` | Behaviour |
| --- | --- |
| unset (default) | Mock backend in the browser (`lib/mock`). Offline, deterministic demo. |
| `live` | Real endpoints in `app/api/*` (Supabase, verification, settlement). |

## Endpoint mapping (live)

| `api.ts` | Endpoint(s) |
| --- | --- |
| `getMissions`, `getBuyerMissions` | `GET /api/missions` |
| `getMission` | `GET /api/missions/:id` |
| `uploadSubmission` | `POST /api/submissions/upload` (multipart), then in the background `POST /api/verify/:id` → `POST /api/verify/:id/ai` → `POST /api/settlement/:id` |
| `getSubmission` | local record while the pipeline runs; otherwise `GET /api/submissions/:id` + `GET /api/submissions/:id/media` |
| `getBuyerMission` | `GET /api/missions/:id` + `GET /api/missions/:id/dataset` |
| `registerMission`, `toggleSave`, `getMyRegistrations`, `getWallet` | local only — no endpoints yet |
| `createMission` | local only — `POST /api/missions` is 501 (missions are created on-chain first) |

DTO shapes are mirrored in `dto.ts` from `app/api/_lib/dto.ts`; update both together.
API error codes are translated to Turkish in `http.ts`.

## Gaps the API doesn't cover yet

- Mission presentation fields (company, category, cover, criteria list, per-user limit):
  derived in `live.ts` (seed title match, else defaults; criteria = description sentences).
- Listing submissions (`GET /api/submissions` is 501): buyer table and "my submissions"
  only show what this browser uploaded.
- Min video duration is enforced client-side only (recording); the server doesn't check it.
