"use client";

import { cx } from "@/lib/ui/utils";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "brand";
}) {
  const base =
    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium";

  const tones: Record<typeof tone, string> = {
    neutral: "border-zinc-200 bg-white text-zinc-700",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
    brand: "border-indigo-200 bg-indigo-50 text-indigo-900",
  };

  return <span className={cx(base, tones[tone])}>{children}</span>;
}

