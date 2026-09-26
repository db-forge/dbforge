import { Activity, Bot, Building2, Cpu, Eye, type LucideIcon } from "lucide-react";
import type { Company } from "@/lib/frontend/types";
import { cn } from "@/lib/frontend/utils";

// Brand fills are fixed per company, so they live here rather than as theme tokens.
const BRANDS: Record<string, { bg: string; icon: LucideIcon }> = {
  "Nova Robotics": { bg: "bg-[#7C3AED]", icon: Bot },
  "Kinetic Labs": { bg: "bg-[#3B82F6]", icon: Cpu },
  "Terra Vision": { bg: "bg-[#10B981]", icon: Eye },
  "Atlas Motion": { bg: "bg-[#F97316]", icon: Activity },
};

/** Rounded-square company mark with a white icon; unknown companies get a neutral building. */
export function CompanyAvatar({ company, className }: { company: Pick<Company, "name">; className?: string }) {
  const brand = BRANDS[company.name];
  const Icon = brand?.icon ?? Building2;
  return (
    <div
      title={company.name}
      className={cn(
        "grid size-11 shrink-0 place-items-center rounded-xl text-white",
        brand ? brand.bg : "border border-border bg-surface",
        className,
      )}
    >
      <Icon className="size-[50%]" strokeWidth={2} />
    </div>
  );
}
