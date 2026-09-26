// Shared domain types — SHARED FILE, owned jointly by all three developers.
// Coordinate before making breaking changes (renaming/removing fields).

export type MissionStatus = "draft" | "active" | "completed" | "cancelled";

export type SubmissionStatus =
  | "uploaded"
  | "verifying"
  | "accepted"
  | "rejected"
  | "paid";

export interface Mission {
  id: string;
  chainMissionId: string;
  buyerAddress: string;
  title: string;
  description: string;
  rewardMon: number;
  targetCount: number;
  acceptedCount: number;
  status: MissionStatus;
}

export interface Submission {
  id: string;
  missionId: string;
  contributorAddress: string;
  mediaUrl: string;
  mediaHash: string;
  status: SubmissionStatus;
  confidence: number;
  txHash: string;
}
