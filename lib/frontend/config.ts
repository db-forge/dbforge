// Which backend the data layer talks to.
//   NEXT_PUBLIC_DATA_SOURCE=live → app/api/* endpoints (Supabase + verification)
//   anything else (default)      → in-browser mock (lib/mock), works offline
export const IS_LIVE = process.env.NEXT_PUBLIC_DATA_SOURCE === "live";
