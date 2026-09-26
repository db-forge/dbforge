"use client";

/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/frontend/utils";
import { useT } from "./I18nProvider";

/** Mission cover; falls back to a wireframe-style placeholder when there's no image yet. */
export function CoverImage({
  src,
  alt = "",
  label,
  className,
}: {
  src?: string | null;
  alt?: string;
  label?: string;
  className?: string;
}) {
  const t = useT();
  if (!src) {
    return (
      <div className={cn("grid place-items-center bg-surface font-mono text-xs text-muted", className)}>
        [ {label ?? t.cover.placeholder} ]
      </div>
    );
  }
  return <img src={src} alt={alt} className={cn("object-cover", className)} />;
}
