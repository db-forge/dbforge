"use client";

import { AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { useConnectWallet, useSwitchToMonad } from "@/components/ConnectWallet";
import { Button } from "@/components/ui/button";
import { Card, MonoLabel } from "@/components/ui/card";
import { errorCodeOf, requestWalletNonce, updateContributorProfile, verifyWallet } from "@/lib/frontend/auth";
import { safeNext, validateDisplayName } from "@/lib/frontend/auth-validation";
import { useIsClient, useSignAuthMessage, useWalletStatus } from "@/lib/frontend/hooks";
import { authErrorText, useContributorT } from "@/lib/frontend/i18n/auth/contributor";
import { cn, shortAddr } from "@/lib/frontend/utils";

const METAMASK_URL = "https://metamask.io/download/";

function Step({
  n,
  title,
  active,
  done,
  children,
}: {
  n: number;
  title: string;
  active: boolean;
  done: boolean;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("p-5", !active && !done && "opacity-50")}>
      <div className="flex items-center gap-3">
        {done ? (
          <CheckCircle2 className="size-6 text-money" />
        ) : (
          <span className="grid size-6 place-items-center rounded-full border-[1.5px] border-border font-mono text-xs">
            {n}
          </span>
        )}
        <h2 className="font-bold">{title}</h2>
      </div>
      {active && children && <div className="mt-4 space-y-3">{children}</div>}
    </Card>
  );
}

function ErrorText({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-danger">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {children}
    </p>
  );
}

function Join() {
  const d = useContributorT();
  const router = useRouter();
  const dest = safeNext(useSearchParams().get("next"), "/explore");
  const mounted = useIsClient();
  const { address, isConnected, isConnecting, wrongNetwork } = useWalletStatus();
  const { connectWallet, isPending: connecting } = useConnectWallet();
  const { switchToMonad, isPending: switching } = useSwitchToMonad();
  const { sign } = useSignAuthMessage();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState("");

  const hasInjected = mounted && "ethereum" in window;
  const walletReady = mounted && isConnected && !wrongNetwork && !!address;

  async function signIn() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await requestWalletNonce(address);
      const signature = await sign(message);
      const { session, created } = await verifyWallet(message, signature);
      if (created && session.kind === "contributor" && !session.displayName) setAskName(true);
      else router.replace(dest);
    } catch (e) {
      setError(authErrorText(d, errorCodeOf(e), e));
    } finally {
      setBusy(false);
    }
  }

  async function saveName() {
    const invalid = validateDisplayName(name);
    if (invalid) {
      setError(authErrorText(d, invalid));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateContributorProfile(name.trim());
      router.replace(dest);
    } catch (e) {
      setError(authErrorText(d, errorCodeOf(e), e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">{d.join.title}</h1>

      <Step n={1} title={d.join.step1} active={mounted && !walletReady} done={walletReady}>
        <p className="text-sm text-muted">{d.join.step1Body}</p>
        {!hasInjected && (
          <div className="rounded-xl border-[1.5px] border-border p-3 text-sm">
            <p className="font-bold">{d.join.noMetamask}</p>
            <p className="text-muted">{d.join.noMetamaskBody}</p>
            <a
              href={METAMASK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block font-bold text-link underline"
            >
              {d.join.installMetamask}
            </a>
          </div>
        )}
        {isConnected && wrongNetwork ? (
          <>
            <ErrorText>{d.join.wrongNetwork}</ErrorText>
            <Button variant="danger" onClick={switchToMonad} disabled={switching}>
              {d.join.switch}
            </Button>
          </>
        ) : (
          <Button onClick={connectWallet} disabled={connecting || isConnecting}>
            <Wallet className="size-4" />
            {connecting || isConnecting ? d.join.connecting : d.join.connect}
          </Button>
        )}
      </Step>

      <Step n={2} title={d.join.step2} active={walletReady && !askName} done={askName}>
        <p className="text-sm text-muted">{d.join.step2Body}</p>
        <p className="text-sm">
          <MonoLabel>{d.join.connectedAs}</MonoLabel> <span className="font-mono">{shortAddr(address, 6, 4)}</span>
        </p>
        <Button onClick={signIn} disabled={busy}>
          {busy ? d.join.signing : d.join.sign}
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </Step>

      {askName && (
        <Step n={3} title={d.join.step3} active done={false}>
          <p className="text-sm text-muted">{d.join.step3Body}</p>
          <label className="block text-sm font-bold">
            {d.join.displayName}
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={30}
              autoFocus
              className="mt-1 block h-10 w-full rounded-xl border-[1.5px] border-border bg-surface px-3 font-normal"
            />
          </label>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-2">
            <Button onClick={saveName} disabled={busy}>
              {busy ? d.join.saving : d.join.save}
            </Button>
            <Button variant="ghost" onClick={() => router.replace(dest)} disabled={busy}>
              {d.join.skip}
            </Button>
          </div>
        </Step>
      )}
    </main>
  );
}

export default function ContributorJoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}
