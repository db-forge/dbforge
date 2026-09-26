// Owner: Developer 3 (app/api, lib/supabase, lib/verification, supabase/)
//
// Storage operations for the private `dbforge-submissions` bucket. All
// calls use the service role client (lib/supabase/client.ts) — never
// expose this to the browser.

import { getSupabaseServiceClient } from "./client";

export const SUBMISSIONS_BUCKET = "dbforge-submissions";

export class StorageUploadError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "StorageUploadError";
  }
}

/**
 * Collision-safe, non-user-controlled storage path:
 *   missions/{missionId}/submissions/{submissionId}/media.{extension}
 *
 * missionId/submissionId are server-generated UUIDs and extension comes
 * from the validated MIME type config — the client's original filename is
 * never used, which also rules out path traversal.
 */
export function buildSubmissionStoragePath(
  missionId: string,
  submissionId: string,
  extension: string,
): string {
  return `missions/${missionId}/submissions/${submissionId}/media.${extension}`;
}

export async function uploadSubmissionMedia(
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase.storage.from(SUBMISSIONS_BUCKET).upload(path, bytes, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new StorageUploadError(`Failed to upload object to ${path}`, error);
  }
}

/**
 * Best-effort cleanup for when a DB write fails after a successful upload.
 * Never throws — a cleanup failure must not mask the original error, it is
 * only logged so an orphaned object can be found later.
 */
export async function deleteSubmissionMedia(path: string): Promise<void> {
  const supabase = getSupabaseServiceClient();

  const { error } = await supabase.storage.from(SUBMISSIONS_BUCKET).remove([path]);

  if (error) {
    console.error(`Failed to clean up orphaned storage object ${path}:`, error);
  }
}
