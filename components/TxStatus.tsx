"use client";

import { Check, Loader2, Wallet, X } from "lucide-react";
import type { TxState } from "@/lib/frontend/chain";
import { cn } from "@/lib/frontend/utils";
import { useT } from "./I18nProvider";
import { TxHash } from "./TxHash";

const STEPS = ["awaiting_signature", "pending", "success"] as const;

const ORDER = ["idle", "awaiting_signature", "pending", "success"];

export function TxStatus({ state, className }: { state: TxState; className?: string }) {
  const t = useT();
  if (state.stage === "idle") return null;
  const current = ORDER.indexOf(state.stage);
  const failed = state.stage === "error";

  return (
    <div className={cn("rounded-2xl border-[1.5px] border-border bg-surface p-4", className)}>
      <ol className="space-y-3">
        {STEPS.map((key, i) => {
          const step = { key, ...t.tx.steps[key] };
          const idx = i + 1;
          const done = !failed && current > idx;
          const active = !failed && current === idx;
          const isSuccess = step.key === "success" && state.stage === "success";
          const errorHere = failed && i === 0;
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                className={cn(
                  "grid size-7 shrink-0 place-items-center rounded-full border-[1.5px]",
                  done || isSuccess ? "border-money bg-money text-white" : "border-border text-muted",
                  active && !isSuccess && "border-primary text-primary",
                  errorHere && "border-danger bg-danger text-white",
                )}
              >
                {errorHere ? (
                  <X className="size-4" />
                ) : done || isSuccess ? (
                  <Check className="size-4" />
                ) : active ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : i === 0 ? (
                  <Wallet className="size-3.5" />
                ) : (
                  <span className="font-mono text-xs">{idx}</span>
                )}
              </span>
              <div className="min-w-0">
                <p className={cn("text-sm font-bold", !done && !active && !isSuccess && !errorHere && "text-muted")}>
                  {step.label}
                </p>
                {(active || isSuccess) && <p className="text-xs text-muted">{step.hint}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      {state.hash && (
        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3">
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">Tx</span>
          <TxHash hash={state.hash} />
        </div>
      )}
      {failed && (
        <p className="mt-4 rounded-xl border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger">
          {state.error ?? t.tx.failed}
        </p>
      )}
    </div>
  );
}
