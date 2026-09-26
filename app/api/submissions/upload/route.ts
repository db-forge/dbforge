// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// POST /api/submissions/upload — server-side media ingestion. The service
// role key never leaves the server: the client sends raw bytes here, and
// this route is the only thing that talks to Supabase Storage.
//
// Order of operations mirrors the M1 spec: parse/validate input -> validate
// mission -> validate MIME -> validate size -> hash -> duplicate check ->
// storage upload -> DB insert (with storage cleanup if the DB write fails).

import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ApiError, withApiErrorHandling } from "@/app/api/_lib/errors";
import {
  UUID_RE,
  requireFormFile,
  requireFormString,
} from "@/app/api/_lib/validation";
import { toUploadedSubmissionDto } from "@/app/api/_lib/dto";
import { getMissionById } from "@/lib/supabase/missions";
import { requireContributor } from "@/lib/supabase/authGuards";
import {
  createUploadedSubmission,
  findSubmissionByMissionAndHash,
} from "@/lib/supabase/submissions";
import { DuplicateSubmissionError } from "@/lib/supabase/errors";
import {
  buildSubmissionStoragePath,
  deleteSubmissionMedia,
  uploadSubmissionMedia,
} from "@/lib/supabase/storage";
import {
  computeSha256Hex,
  getMediaTypeConfig,
  looksLikeDeclaredType,
  SUPPORTED_MEDIA_TYPES,
} from "@/lib/verification/media";

async function parseMultipartForm(request: Request): Promise<FormData> {
  try {
    return await request.formData();
  } catch {
    throw ApiError.invalidInput("Request body must be valid multipart/form-data.");
  }
}

export async function POST(request: Request) {
  return withApiErrorHandling(async () => {
    // Binds this submission to the AUTHENTICATED contributor — never a
    // client-supplied contributorAddress field. A contributor with no
    // wallet linked yet cannot submit (nothing to attribute the
    // submission/settlement to).
    const { profile } = await requireContributor();
    if (!profile.wallet_address) {
      throw ApiError.conflict(
        "Link a wallet address to your contributor profile before submitting.",
      );
    }
    const contributorAddress = profile.wallet_address;

    const form = await parseMultipartForm(request);

    const missionId = requireFormString(form, "missionId");
    if (!UUID_RE.test(missionId)) {
      throw ApiError.invalidInput("missionId must be a valid UUID.", { field: "missionId" });
    }

    const mediaFile = requireFormFile(form, "media");
    const mediaType = mediaFile.type;
    const mediaConfig = getMediaTypeConfig(mediaType);

    if (!mediaConfig) {
      throw ApiError.unsupportedMediaType(
        `Unsupported media type: ${mediaType || "(none provided)"}.`,
        { supportedTypes: SUPPORTED_MEDIA_TYPES },
      );
    }

    if (mediaFile.size === 0) {
      throw ApiError.emptyFile("Uploaded file is empty.");
    }

    if (mediaFile.size > mediaConfig.maxSizeBytes) {
      throw ApiError.fileTooLarge(
        `File exceeds the maximum allowed size for ${mediaConfig.kind} uploads.`,
        { maxSizeBytes: mediaConfig.maxSizeBytes, actualSizeBytes: mediaFile.size },
      );
    }

    const mission = await getMissionById(missionId);
    if (!mission) {
      throw ApiError.missionNotFound(`Mission ${missionId} not found.`);
    }
    if (mission.status !== "active") {
      throw ApiError.missionNotActive(
        `Mission ${missionId} is not accepting submissions (status: ${mission.status}).`,
      );
    }

    const bytes = new Uint8Array(await mediaFile.arrayBuffer());

    if (!looksLikeDeclaredType(bytes, mediaType)) {
      throw ApiError.unsupportedMediaType(
        "File content does not match the declared media type.",
        { declaredType: mediaType },
      );
    }

    const mediaHash = computeSha256Hex(bytes);

    const duplicate = await findSubmissionByMissionAndHash(missionId, mediaHash);
    if (duplicate) {
      throw ApiError.duplicateSubmission(
        "This exact file has already been submitted to this mission.",
      );
    }

    const submissionId = randomUUID();
    const storagePath = buildSubmissionStoragePath(
      missionId,
      submissionId,
      mediaConfig.extension,
    );

    try {
      await uploadSubmissionMedia(storagePath, bytes, mediaType);
    } catch (error) {
      console.error("Storage upload failed:", error);
      throw ApiError.storageUploadFailed("Failed to store uploaded media.");
    }

    let submission;
    try {
      submission = await createUploadedSubmission({
        id: submissionId,
        missionId,
        contributorAddress,
        mediaPath: storagePath,
        mediaHash,
        mediaType,
        sizeBytes: bytes.byteLength,
      });
    } catch (error) {
      // Avoid orphaning the object we just wrote.
      await deleteSubmissionMedia(storagePath);

      if (error instanceof DuplicateSubmissionError) {
        throw ApiError.duplicateSubmission(error.message);
      }
      console.error("Database insert failed after storage upload:", error);
      throw ApiError.databaseError("Failed to record submission.");
    }

    return NextResponse.json(
      { submission: toUploadedSubmissionDto(submission) },
      { status: 201 },
    );
  });
}
