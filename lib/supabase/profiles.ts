// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Data access for the profiles table. Always via the service-role client —
// the RLS policies in migration 0012 exist for a future direct-client
// access path, not for this backend's own reads/writes.

import { getSupabaseServiceClient } from "./client";

export type ProfileRole = "contributor" | "company";

export interface ProfileRow {
  id: string;
  role: ProfileRole;
  display_name: string | null;
  company_name: string | null;
  wallet_address: string | null;
  created_at: string;
  updated_at: string;
}

export class WalletAddressAlreadyLinkedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletAddressAlreadyLinkedError";
  }
}

export async function getProfileById(id: string): Promise<ProfileRow | null> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.from("profiles").select("*").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch profile ${id}: ${error.message}`);
  }

  return (data as ProfileRow | null) ?? null;
}

export interface CreateProfileInput {
  id: string;
  role: ProfileRole;
  displayName?: string | null;
  companyName?: string | null;
  walletAddress?: string | null;
}

export async function createProfile(input: CreateProfileInput): Promise<ProfileRow> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase
    .from("profiles")
    .insert({
      id: input.id,
      role: input.role,
      display_name: input.displayName ?? null,
      company_name: input.companyName ?? null,
      wallet_address: input.walletAddress ? input.walletAddress.toLowerCase() : null,
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new WalletAddressAlreadyLinkedError(
        "This wallet address is already linked to another account.",
      );
    }
    throw new Error(`Failed to create profile: ${error.message}`);
  }

  return data as ProfileRow;
}
