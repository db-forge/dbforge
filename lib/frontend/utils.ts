import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const EXPLORER_URL = "https://testnet.monadscan.com";

export function txUrl(hash: string) {
  return `${EXPLORER_URL}/tx/${hash}`;
}

export function addressUrl(address: string) {
  return `${EXPLORER_URL}/address/${address}`;
}

export function shortAddr(addr?: string | null, head = 6, tail = 4) {
  if (!addr) return "";
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function formatMon(value: number, digits = 2) {
  // Crypto amounts use a dot decimal separator (0.10 MON) in every locale.
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, 4),
  });
}

/** Short relative time; `labels` is the dictionary's `time` section. */
export function timeAgo(
  iso: string,
  labels: { now: string; min: (n: number) => string; hour: (n: number) => string; day: (n: number) => string },
) {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return labels.now;
  if (min < 60) return labels.min(min);
  const h = Math.floor(min / 60);
  if (h < 24) return labels.hour(h);
  return labels.day(Math.floor(h / 24));
}

const HEX = "0123456789abcdef";

export function randomHex(bytes: number) {
  let out = "0x";
  for (let i = 0; i < bytes * 2; i++) out += HEX[Math.floor(Math.random() * 16)];
  return out;
}

/** Deterministic pseudo-hash so mock data is stable between renders/SSR. */
export function seededHex(seed: string, bytes: number) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = "0x";
  for (let i = 0; i < bytes * 2; i++) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    out += HEX[(h >>> 0) % 16];
  }
  return out;
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
