import type { ReactNode } from "react";
import { RequireSession } from "@/components/auth/RequireSession";

export default function RegisteredLayout({ children }: { children: ReactNode }) {
  return <RequireSession kind="contributor">{children}</RequireSession>;
}
