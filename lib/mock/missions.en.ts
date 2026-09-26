// English copy of the seed missions' text. Applied by lib/frontend/api.ts when
// the UI language is English; ids match SEED_MISSIONS.
import type { MockMission } from "./missions";

const BASE_CRITERIA = [
  "At least 10 seconds, one continuous take",
  "Hands and object clearly visible in frame",
  "Enough light, no blurry footage",
  "Original video, not uploaded before",
];

type MissionText = Pick<MockMission, "title" | "description" | "criteria">;

const MISSIONS_EN: Record<string, MissionText> = {
  m1: {
    title: "Knocking a plastic bottle off a table",
    description:
      "Push the plastic bottle on the table with your hand so it falls to the floor. We're looking for different tables and bottle types so robot arms can learn the physics of falling objects.",
    criteria: [...BASE_CRITERIA, "The bottle must fall completely off the table"],
  },
  m2: {
    title: "Folding a T-shirt",
    description:
      "Fold a T-shirt from start to finish on a flat surface. We're collecting high-quality hand-motion data for humanoid robots' fabric manipulation.",
    criteria: [...BASE_CRITERIA, "The folding must be visible from start to finish"],
  },
  m3: {
    title: "Opening a fridge door",
    description:
      "Grab the fridge door, open it, briefly show the inside and close it. For home robots learning to interact with hinged doors.",
    criteria: [...BASE_CRITERIA, "The door handle and hinge side must be visible"],
  },
  m4: {
    title: "Plugging in a phone charger",
    description:
      "Plug the charging cable into the phone's port. We're looking for footage from various angles of connector insertion, which needs fine motor skills.",
    criteria: [...BASE_CRITERIA, "Close-up while the connector goes into the port"],
  },
  m5: {
    title: "Putting on a hat",
    description:
      "Pick up a hat and put it on your head. For wearable object manipulation; you can film in front of a mirror or with the front camera.",
    criteria: [...BASE_CRITERIA, "The hat must sit fully on the head"],
  },
};

export const DEMO_VIDEO_LABELS_EN: Record<string, string> = {
  "bottle-drop.mp4": "Bottle drop",
  "tshirt-fold.mp4": "T-shirt fold",
  "fridge-open.mp4": "Fridge open",
  "phone-charge.mp4": "Phone charging",
  "wear-hat.mp4": "Putting on a hat",
};

export function missionTextEn(id: string): MissionText | undefined {
  return MISSIONS_EN[id];
}
