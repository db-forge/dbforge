import type { ReactNode } from "react";
import { RequireSession } from "@/components/auth/RequireSession";

/** Capture and upload need a contributor session (else → /contributor/join?next=…). */
export default function CaptureLayout({ children }: { children: ReactNode }) {
  return <RequireSession kind="contributor">{children}</RequireSession>;
}
