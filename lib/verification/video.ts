// Owner: Developer 3 (app/api, lib/verification, lib/supabase, supabase/)
//
// Video frame extraction for AI semantic verification (M3). Videos are
// never sent to the vision provider whole — a small, evenly-spaced,
// ordered set of JPEG frames stands in for the video.
//
// RUNTIME DEPENDENCY: this shells out to the `ffmpeg`/`ffprobe` binaries,
// which must be installed and on PATH wherever this code runs. That is not
// a safe assumption for every deploy target (e.g. a default Vercel
// serverless function does not have them). This is deliberately isolated
// behind extractVideoFrames()/FfmpegUnavailableError so callers can treat
// "ffmpeg missing" as a distinct, typed, retryable failure rather than
// faking video verification — see app/api/verify/[submissionId]/ai/route.ts,
// which maps FfmpegUnavailableError to a 503 rather than silently
// proceeding with zero frames.

import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ExtractedFrame {
  index: number;
  timestampMs: number;
  mimeType: "image/jpeg";
  base64: string;
}

export class FfmpegUnavailableError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "FfmpegUnavailableError";
  }
}

export class FrameExtractionError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "FrameExtractionError";
  }
}

// "6-8" per the M3 spec; 6 keeps the vision request small/cheap.
const MAX_FRAMES = 6;

let ffmpegAvailable: boolean | null = null;

async function assertFfmpegAvailable(): Promise<void> {
  if (ffmpegAvailable === true) return;
  try {
    await execFileAsync("ffmpeg", ["-version"]);
    await execFileAsync("ffprobe", ["-version"]);
    ffmpegAvailable = true;
  } catch (error) {
    ffmpegAvailable = false;
    throw new FfmpegUnavailableError(
      "ffmpeg/ffprobe were not found on PATH. Video frame extraction requires " +
        "them at runtime — see the doc comment in lib/verification/video.ts.",
      error,
    );
  }
}

async function probeDurationMs(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const seconds = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(seconds) || seconds <= 0) {
      throw new Error(`ffprobe returned an unusable duration: "${stdout.trim()}"`);
    }
    return seconds * 1000;
  } catch (error) {
    if (error instanceof FrameExtractionError) throw error;
    throw new FrameExtractionError("Failed to probe video duration.", error);
  }
}

function pickTimestampsMs(durationMs: number, count: number): number[] {
  if (count <= 1) return [0];
  // Evenly spaced from the start to just short of the end — seeking to
  // exactly `duration` often fails to decode a frame on some containers.
  const lastMs = durationMs * 0.98;
  const step = lastMs / (count - 1);
  return Array.from({ length: count }, (_, i) => Math.round(step * i));
}

/**
 * Extracts up to MAX_FRAMES evenly-spaced JPEG frames from a video buffer,
 * in chronological order (beginning, evenly-spaced middle samples, near
 * the end). Requires ffmpeg/ffprobe — see the module doc.
 */
export async function extractVideoFrames(videoBytes: Uint8Array): Promise<ExtractedFrame[]> {
  await assertFfmpegAvailable();

  const workDir = await mkdtemp(join(tmpdir(), `dbforge-frames-${randomUUID()}-`));
  const inputPath = join(workDir, "input.bin");

  try {
    await writeFile(inputPath, videoBytes);
    const durationMs = await probeDurationMs(inputPath);
    const timestamps = pickTimestampsMs(durationMs, MAX_FRAMES);

    const frames: ExtractedFrame[] = [];
    for (let index = 0; index < timestamps.length; index++) {
      const timestampMs = timestamps[index];
      const outputPath = join(workDir, `frame-${index}.jpg`);
      try {
        await execFileAsync("ffmpeg", [
          "-ss",
          (timestampMs / 1000).toFixed(3),
          "-i",
          inputPath,
          "-frames:v",
          "1",
          "-q:v",
          "3",
          "-y",
          outputPath,
        ]);
        const bytes = await readFile(outputPath);
        frames.push({
          index,
          timestampMs,
          mimeType: "image/jpeg",
          base64: bytes.toString("base64"),
        });
      } catch (error) {
        throw new FrameExtractionError(`Failed to extract frame at ${timestampMs}ms.`, error);
      }
    }

    if (frames.length === 0) {
      throw new FrameExtractionError("No frames could be extracted from this video.");
    }

    return frames;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
