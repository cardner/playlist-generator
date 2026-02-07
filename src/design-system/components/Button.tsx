"use client";

import { cn } from "@/lib/utils";

const variantStyles = {
  primary:
    "bg-accent-primary hover:bg-accent-hover text-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-accent-primary",
  secondary:
    "bg-app-hover hover:bg-app-surface-hover text-app-primary border border-app-border disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "text-app-secondary hover:text-app-primary hover:bg-app-hover disabled:opacity-50 disabled:cursor-not-allowed",
  danger:
    "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 disabled:opacity-50 disabled:cursor-not-allowed",
} as const;

const sizeStyles = {
  sm: "px-3 py-1.5 text-sm",
  md: "px-4 py-2 text-sm",
} as const;

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  leftIcon,
  rightIcon,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-sm transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-app-bg",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      {children}
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
}
