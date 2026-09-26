"use client";

import { AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
import { useState } from "react";
import { useConnectWallet, useSwitchToMonad } from "@/components/ConnectWallet";
import { useToast } from "@/components/Toaster";
import { Button } from "@/components/ui/button";
import { Card, MonoLabel } from "@/components/ui/card";
import { errorCodeOf, linkCompanyWallet, requestCompanyWalletNonce } from "@/lib/frontend/auth";
import { useSession, useSignAuthMessage, useWalletStatus } from "@/lib/frontend/hooks";
import { authErrorText, useContributorT } from "@/lib/frontend/i18n/auth/contributor";
import { cn, shortAddr } from "@/lib/frontend/utils";

/**
 * Company funding wallet. Linked: short address. Not linked: connect → sign the
 * server-built message → linkCompanyWallet. Renders nothing without a company session.
 */
export function CompanyWalletLinkCard({ className }: { className?: string }) {
  const d = useContributorT();
  const toast = useToast();
  const { session } = useSession();
  const { address, isConnected, wrongNetwork } = useWalletStatus();
  const { connectWallet, isPending: connecting } = useConnectWallet();
  const { switchToMonad, isPending: switching } = useSwitchToMonad();
  const { sign } = useSignAuthMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session?.kind !== "company") return null;

  if (session.walletAddress) {
    return (
      <Card className={cn("flex items-center gap-3 p-4", className)}>
        <CheckCircle2 className="size-5 text-money" />
        <MonoLabel>{d.companyWallet.linked}</MonoLabel>
        <span className="font-mono text-sm">{shortAddr(session.walletAddress, 6, 4)}</span>
      </Card>
    );
  }

  async function link() {
    if (!address) return;
    setBusy(true);
    setError(null);
    try {
      const { message } = await requestCompanyWalletNonce(address);
      const signature = await sign(message);
      await linkCompanyWallet(message, signature);
      toast({ kind: "success", title: d.companyWallet.success });
    } catch (e) {
      setError(authErrorText(d, errorCodeOf(e), e));
    } finally {
      setBusy(false);
    }
  }

  let action;
  if (!isConnected) {
    action = (
      <Button onClick={connectWallet} disabled={connecting}>
        <Wallet className="size-4" /> {d.companyWallet.link}
      </Button>
    );
  } else if (wrongNetwork) {
    action = (
      <Button variant="danger" onClick={switchToMonad} disabled={switching}>
        <AlertTriangle className="size-4" /> {d.join.switch}
      </Button>
    );
  } else {
    action = (
      <Button onClick={link} disabled={busy}>
        <Wallet className="size-4" />
        {busy ? d.companyWallet.linking : `${d.companyWallet.link} · ${shortAddr(address, 4, 4)}`}
      </Button>
    );
  }

  return (
    <Card className={cn("space-y-3 p-5", className)}>
      <h2 className="font-bold">{d.companyWallet.title}</h2>
      <p className="text-sm text-muted">{d.companyWallet.missing}</p>
      {action}
      {error && (
        <p role="alert" className="flex items-start gap-2 text-sm text-danger">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {error}
        </p>
      )}
    </Card>
  );
}
