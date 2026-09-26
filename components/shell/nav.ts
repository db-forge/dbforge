import { Building2, Compass, ListChecks, UserRound, Wallet, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  mobile?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/explore", label: "Keşfet", icon: Compass, mobile: true },
  { href: "/registered", label: "Kayıtlılarım", icon: ListChecks, mobile: true },
  { href: "/wallet", label: "Cüzdan", icon: Wallet, mobile: true },
  { href: "/profile", label: "Profil", icon: UserRound },
  { href: "/buyer", label: "Şirket paneli", icon: Building2 },
];

export function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
