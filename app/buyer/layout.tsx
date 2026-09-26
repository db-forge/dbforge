import type { ReactNode } from "react";
import { RequireSession } from "@/components/auth/RequireSession";

/** Every /buyer/* page needs a company session (else → /company/login?next=…). */
export default function BuyerLayout({ children }: { children: ReactNode }) {
  return <RequireSession kind="company">{children}</RequireSession>;
}
