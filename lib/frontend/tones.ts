// Color roles on the dark theme. Full class strings so Tailwind can see them.
import type { Category } from "./types";

/** Category tag text color. */
export const CATEGORY_TEXT: Record<Category, string> = {
  teknoloji: "text-lemon",
  doga: "text-accent",
  gundelik: "text-pink",
};

export type Tone = "ink" | "primary" | "pink" | "lemon";

/** Filled chip per tone (selected filter/category pill). */
export const TONE_FILL: Record<Tone, string> = {
  ink: "border-ink bg-ink text-black",
  primary: "border-primary bg-primary text-white",
  pink: "border-pink bg-pink text-black",
  lemon: "border-lemon bg-lemon text-black",
};

/** Underline/indicator border per tone. */
export const TONE_BORDER: Record<Tone, string> = {
  ink: "border-ink",
  primary: "border-primary",
  pink: "border-pink",
  lemon: "border-lemon",
};

export const CATEGORY_TONE: Record<Category | "all", Tone> = {
  all: "ink",
  teknoloji: "lemon",
  doga: "primary",
  gundelik: "pink",
};

const AVATAR_FILLS = [
  "border-primary bg-primary text-white",
  "border-pink bg-pink text-black",
  "border-lemon bg-lemon text-black",
];

/** Stable avatar fill per company handle, so each brand keeps its color. */
export function avatarFill(key: string) {
  let h = 11;
  for (let i = 0; i < key.length; i++) h = (h * 33 + key.charCodeAt(i)) | 0;
  return AVATAR_FILLS[Math.abs(h) % AVATAR_FILLS.length];
}
