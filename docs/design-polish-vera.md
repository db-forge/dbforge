# Design polish (feat/design-polish) — vera

Time-boxed (~8 min) visual-only pass with the `impeccable` skill (polish). No copy, logic, or API changes. No new dependencies.

## What changed (before → after)
1. **app/globals.css (tokens)**
   - Added `--color-primary-ink: #b877ff`. Before, the headline accent was `#9400ff` text on `#15151c`, which is too dim to read well. Buttons and fills still use `--color-primary`.
   - Added a radius scale (`--radius-sm/md/lg` = 6/10/14px). Before, everything was `rounded-2xl`. Now containers use lg and media/inner panels use md.
   - Added an expo ease-out token. The `toast-in` and `pop` animations now use it instead of plain `ease-out`.
   - Base details: `text-wrap: balance` on h1–h3, `pretty` on p, a global `:focus-visible` ring in the link color, and link underline offset.
2. **app/page.tsx (landing)**
   - Hero: removed the constantly spinning Burst and the second decorative Burst. One static Burst stays. The eyebrow went from mono/uppercase/link-blue to a quiet muted label, with the same text. The headline is bigger (md:text-7xl), with tighter leading and tracking. The lead paragraph is capped at 52ch.
   - "How it works": before, it was a 4-card grid (rounded-2xl boxes with big mono "01") plus a huge faded background Burst. Now it's a ruled sequence: each step has a top rule (the first one is purple) and a small numeral. No card boxes, and more space above and below.
3. **components/landing/LiveMissions.tsx**
   - Cards went from rounded-2xl with a translate-lift on hover to rounded-lg with a border-color change only. Thumbs are now rounded-md.
   - Stats: before, a centered pill (`sm:rounded-full`). Now a left-aligned row of three columns with dividers under a top rule, and larger figures (sm:text-3xl).
4. **components/MissionPostCard.tsx**
   - Radius hierarchy: preview container is lg; cover and progress panel are md; the skeleton matches.
   - Title underlines on hover (the link affordance). The cover zoom is gentler (1.015, expo ease). The bookmark button has a pressed state.

## Evidence
- `npx tsc --noEmit` → no errors (TSC_OK).
- `npm run build` (Turbopack) → **fails in this worktree for an environment reason**: `Symlink [project]/node_modules is invalid, it points out of the filesystem root`. Turbopack rejects the linked node_modules; the error is not in the code.
- `npx next build --webpack` → **success**, all routes compiled.

## Platform
- Verified on **Windows 11** (typecheck + webpack build). Only CSS and class names changed, so nothing is platform-specific. mac/Linux: not run, no platform-specific code path. No real browser screenshots were taken because of the time box.

## Risks / open items
- `--radius-sm/md/lg` override Tailwind's `rounded-sm/md/lg` **globally**. Any other page that uses those classes gets the new values (lg: 8px → 14px).
- The eyebrow is kept because copy was out of scope. impeccable recommends removing it; that is a product call.
- `npm run build` in this worktree needs a real node_modules (not a symlink), or the webpack flag.
- Next: visual check at 375 and 1440, then `/impeccable init` (no PRODUCT.md/DESIGN.md exists yet).
