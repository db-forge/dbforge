import { Bookmark, Search, UserRound, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/explore", label: "Keşfet", icon: Search, mobile: true },
  { href: "/registered", label: "Kayıtlılarım", icon: Bookmark, mobile: true },
  { href: "/wallet", label: "Cüzdan", icon: Wallet, mobile: true },
  { href: "/profile", label: "Profil", icon: UserRound },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
