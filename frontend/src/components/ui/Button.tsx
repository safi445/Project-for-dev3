"use client";

import { cx } from "@/lib/ui/utils";

export function Button({
  children,
  variant = "primary",
  size = "md",
  disabled,
  onClick,
  type = "button",
  className,
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  disabled?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-40";

  const sizes: Record<typeof size, string> = {
    sm: "h-9 px-3 text-sm",
    md: "h-10 px-4 text-sm",
  };

  const variants: Record<typeof variant, string> = {
    primary:
      "bg-zinc-950 text-white shadow-sm hover:bg-zinc-800 active:bg-black",
    secondary:
      "border border-zinc-200 bg-white text-zinc-900 shadow-sm hover:bg-zinc-50 active:bg-zinc-100",
    ghost: "text-zinc-700 hover:bg-zinc-100 active:bg-zinc-200",
  };

  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={cx(base, sizes[size], variants[variant], className)}
    >
      {children}
    </button>
  );
}
