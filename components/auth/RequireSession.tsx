"use client";

import { Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { Session } from "@/lib/frontend/auth";
import { useSession } from "@/lib/frontend/hooks";
import { useT } from "../I18nProvider";

const SIGN_IN_PATH: Record<Session["kind"], string> = {
  company: "/company/login",
  contributor: "/contributor/join",
};

function currentPath(pathname: string) {
  return typeof window === "undefined" ? pathname : `${pathname}${window.location.search}`;
}

/** Sign-in URL for `kind` that brings the user back to `next` afterwards. */
export function signInHref(kind: Session["kind"], next: string) {
  return `${SIGN_IN_PATH[kind]}?next=${encodeURIComponent(next)}`;
}

/**
 * Renders children only for a session of `kind`; otherwise redirects to the
 * matching sign-in page with ?next=<current path>. UX only: the API enforces access.
 */
export function RequireSession({ kind, children }: { kind: Session["kind"]; children: ReactNode }) {
  const { session, loading } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const allowed = session?.kind === kind;

  useEffect(() => {
    if (!loading && !allowed) router.replace(signInHref(kind, currentPath(pathname)));
  }, [loading, allowed, kind, pathname, router]);

  if (allowed) return <>{children}</>;
  return (
    <div className="grid min-h-dvh place-items-center px-4" role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2 font-mono text-xs text-muted">
        <Loader2 className="size-4 animate-spin text-primary" /> {t.session.checking}
      </span>
    </div>
  );
}

/**
 * For actions that need a contributor (registering for a mission). Returns false
 * and sends the user to /contributor/join?next=… when there is no contributor session.
 */
export function useRequireContributor() {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  return (next?: string) => {
    if (session?.kind === "contributor") return true;
    router.push(signInHref("contributor", next ?? currentPath(pathname)));
    return false;
  };
}
