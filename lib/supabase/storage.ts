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

// Generic storage read/metadata failure (existence checks, signed URLs) —
// distinct from StorageUploadError, which is specific to the M1 upload path.
export class StorageError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "StorageError";
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

/**
 * Verifies the object actually exists in storage — a media_path recorded
 * in the DB is not proof the object is really there (upload could have
 * been interrupted, or the object deleted out-of-band). Uses `list` with a
 * name filter (cheap metadata call), not a download.
 */
export async function submissionMediaObjectExists(path: string): Promise<boolean> {
  const supabase = getSupabaseServiceClient();

  const lastSlash = path.lastIndexOf("/");
  const dir = lastSlash === -1 ? "" : path.slice(0, lastSlash);
  const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);

  const { data, error } = await supabase.storage
    .from(SUBMISSIONS_BUCKET)
    .list(dir, { search: filename, limit: 1 });

  if (error) {
    throw new StorageError(`Failed to check existence of storage object ${path}`, error);
  }

  return (data ?? []).some((entry) => entry.name === filename);
}

/**
 * Short-lived signed URL for private media — the only sanctioned way to
 * read an object out of the bucket without the service role key.
 */
export async function createSignedSubmissionMediaUrl(
  path: string,
  expiresInSeconds: number,
): Promise<string> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.storage
    .from(SUBMISSIONS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new StorageError(`Failed to create signed URL for ${path}`, error);
  }

  return data.signedUrl;
}

/**
 * Fetches the object's raw bytes directly using the service role client —
 * for server-to-server use (e.g. handing bytes to a vision provider) this
 * is preferable to minting a signed URL: no token to accidentally log, no
 * TTL bookkeeping, one fewer network hop.
 */
export async function downloadSubmissionMedia(path: string): Promise<Buffer> {
  const supabase = getSupabaseServiceClient();

  const { data, error } = await supabase.storage.from(SUBMISSIONS_BUCKET).download(path);

  if (error || !data) {
    throw new StorageError(`Failed to download storage object ${path}`, error);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
