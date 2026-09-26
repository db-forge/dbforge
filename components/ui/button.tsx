import Link from "next/link";
import { forwardRef, type ComponentProps } from "react";
import { cn } from "@/lib/frontend/utils";

type Variant = "primary" | "outline" | "ghost" | "soft" | "ink" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap transition-colors select-none disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white border-[1.5px] border-primary hover:bg-primary/85",
  ink: "bg-text text-bg border-[1.5px] border-text hover:bg-text/85",
  outline: "bg-surface text-text border-[1.5px] border-border hover:bg-border/40",
  soft: "bg-surface text-link border-[1.5px] border-border hover:border-primary",
  ghost: "text-text hover:bg-border/40 border-[1.5px] border-transparent",
  danger: "bg-surface text-danger border-[1.5px] border-danger hover:bg-danger/15",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3.5 text-sm",
  md: "h-10 px-5 text-sm",
  lg: "h-12 px-6 text-base",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(base, variants[variant], sizes[size], className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: Variant; size?: Size };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, className, ...props },
  ref,
) {
  return <button ref={ref} className={buttonClass(variant, size, className)} {...props} />;
});

type LinkButtonProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size };

export function LinkButton({ variant, size, className, ...props }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
