"use client";

import { Building2, ChevronDown, LayoutGrid, LogIn, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { logout, type Session } from "@/lib/frontend/auth";
import { useSession } from "@/lib/frontend/hooks";
import { cn, shortAddr } from "@/lib/frontend/utils";
import { Avatar } from "../Avatar";
import { useT } from "../I18nProvider";
import { useToast } from "../Toaster";

function sessionName(s: Session) {
  return s.kind === "company" ? s.companyName : (s.displayName ?? shortAddr(s.walletAddress));
}

function initialsOf(name: string) {
  const words = name.replace(/^0x/, "").trim().split(/\s+/);
  return (words.length > 1 ? words[0][0] + words[1][0] : name.replace(/^0x/, "").slice(0, 2)).toUpperCase();
}

/**
 * Who is signed in, with a sign-out menu. Signed out: a "Sign in" link to /auth.
 * `variant="nav"` is the side-nav footer block, `"chip"` a compact header button.
 */
export function SessionMenu({ variant = "chip", className }: { variant?: "chip" | "nav"; className?: string }) {
  const { session, loading } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();
  const t = useT();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (loading) {
    return <div className={cn("animate-pulse rounded-full bg-border/40", variant === "nav" ? "h-12 w-full" : "size-9", className)} />;
  }

  if (!session) {
    return (
      <Link
        href="/auth"
        className={cn(
          "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] border-border bg-surface px-3 text-sm font-bold hover:bg-border/40",
          variant === "nav" && "h-11 justify-center lg:justify-start lg:px-4",
          className,
        )}
        title={t.session.signIn}
      >
        <LogIn className="size-4" />
        <span className={cn(variant === "nav" && "hidden lg:inline")}>{t.session.signIn}</span>
      </Link>
    );
  }

  const name = sessionName(session);
  const kindLabel = session.kind === "company" ? t.session.company : t.session.contributor;

  async function signOut() {
    setOpen(false);
    try {
      await logout();
      toast({ kind: "info", title: t.session.signedOut });
      router.push("/");
    } catch (e) {
      toast({ kind: "error", title: t.common.genericError, description: (e as Error).message });
    }
  }

  return (
    <div ref={ref} className={cn("relative shrink-0", className)}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${kindLabel}: ${name}`}
        className={cn(
          "flex items-center gap-2.5 rounded-full hover:bg-surface",
          variant === "nav" ? "w-full p-1.5 lg:px-2" : "p-0.5",
        )}
      >
        <Avatar initials={initialsOf(name)} className={cn("text-xs", variant === "chip" && "size-9")} />
        {variant === "nav" && (
          <span className="hidden min-w-0 flex-1 text-left lg:block">
            <span className="block truncate text-sm font-bold leading-tight">{name}</span>
            <span className="block truncate font-mono text-xs text-muted">{kindLabel}</span>
          </span>
        )}
        {variant === "nav" && <ChevronDown className={cn("hidden size-4 shrink-0 lg:block", open && "rotate-180")} />}
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            "absolute z-40 w-60 overflow-hidden rounded-2xl border-[1.5px] border-border bg-surface p-1.5",
            variant === "nav" ? "bottom-full left-0 mb-2" : "right-0 mt-2",
          )}
        >
          <div className="px-3 pt-1.5 pb-2">
            <p className="truncate text-sm font-bold">{name}</p>
            <p className="truncate font-mono text-[11px] text-muted">
              {kindLabel}
              {session.kind === "company" ? ` · ${session.email}` : ` · ${shortAddr(session.walletAddress, 6, 4)}`}
            </p>
          </div>
          {session.kind === "company" ? (
            <Link href="/buyer" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-border/40">
              <LayoutGrid className="size-4" /> {t.session.companyPanel}
            </Link>
          ) : (
            <Link href="/wallet" role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm hover:bg-border/40">
              <Wallet className="size-4" /> {t.connect.myWallet}
            </Link>
          )}
          {session.kind === "company" && session.walletAddress && (
            <p className="flex items-center gap-2 px-3 py-2 font-mono text-[11px] text-muted">
              <Building2 className="size-3.5" /> {shortAddr(session.walletAddress, 6, 4)}
            </p>
          )}
          <button
            role="menuitem"
            onClick={signOut}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-danger hover:bg-danger/15"
          >
            <LogOut className="size-4" /> {t.session.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
