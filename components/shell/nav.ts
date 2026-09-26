import { Bookmark, Search, UserRound, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  /** Key into the dictionary's `nav` section. */
  labelKey: "explore" | "registered" | "wallet" | "profile";
  icon: LucideIcon;
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/explore", labelKey: "explore", icon: Search, mobile: true },
  { href: "/registered", labelKey: "registered", icon: Bookmark, mobile: true },
  { href: "/wallet", labelKey: "wallet", icon: Wallet, mobile: true },
  { href: "/profile", labelKey: "profile", icon: UserRound },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
