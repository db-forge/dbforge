// Which backend the data layer talks to.
//   NEXT_PUBLIC_DATA_SOURCE=live → app/api/* endpoints (Supabase + verification)
//   anything else (default)      → in-browser mock (lib/mock), works offline
export const IS_LIVE = process.env.NEXT_PUBLIC_DATA_SOURCE === "live";

// Auth can be switched independently from mission/submission data. The current
// production auth UI uses the browser-backed session implementation, while
// mission and payout data come from the real API/Supabase backend.
export const IS_AUTH_LIVE = process.env.NEXT_PUBLIC_AUTH_SOURCE === "live";
