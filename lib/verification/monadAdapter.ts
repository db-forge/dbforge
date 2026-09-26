// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Shared, lazily-constructed SettlementAdapter singleton — one per process
// (per lib/monad/README.md: "Create one adapter per process. You can run
// many processes at the same time: the store coordinates idempotency and
// nonces"). Every real gateway wiring in lib/verification/{settlement,
// dataset,withdrawal} goes through this rather than constructing its own.

import { createMonadSettlement, createSupabaseSettlementStore, MonadConfigError, type SettlementAdapter } from "@/lib/monad";
import { getSupabaseServiceClient } from "@/lib/supabase/client";

let cached: SettlementAdapter | null = null;
let configError: MonadConfigError | null = null;

export function getMonadSettlementAdapter(): SettlementAdapter {
  if (cached) return cached;
  if (configError) throw configError;

  try {
    cached = createMonadSettlement({
      store: createSupabaseSettlementStore(getSupabaseServiceClient()),
    });
    return cached;
  } catch (error) {
    if (error instanceof MonadConfigError) {
      configError = error;
    }
    throw error;
  }
}
