import { ExternalLink } from "lucide-react";
import { cn, shortAddr, txUrl } from "@/lib/frontend/utils";

export function TxHash({ hash, className, full }: { hash: string; className?: string; full?: boolean }) {
  return (
    <a
      href={txUrl(hash)}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-xs text-primary underline-offset-2 hover:underline",
        className,
      )}
    >
      <span className={cn(full && "break-all")}>{full ? hash : shortAddr(hash, 8, 6)}</span>
      <ExternalLink className="size-3 shrink-0" />
    </a>
  );
}
