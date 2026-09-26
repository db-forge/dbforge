/* eslint-disable @next/next/no-img-element */
import { cn } from "@/lib/frontend/utils";

/** Mission cover; falls back to a wireframe-style placeholder when there's no image yet. */
export function CoverImage({
  src,
  alt = "",
  label = "örnek foto",
  className,
}: {
  src?: string | null;
  alt?: string;
  label?: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div className={cn("grid place-items-center bg-ice font-mono text-xs text-ink/50", className)}>
        [ {label} ]
      </div>
    );
  }
  return <img src={src} alt={alt} className={cn("object-cover", className)} />;
}
