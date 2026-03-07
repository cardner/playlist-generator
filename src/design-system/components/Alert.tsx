"use client";

import { cn } from "@/lib/utils";

const variantStyles = {
  warning: "bg-info-blue-400/10 border-info-blue-400/20 text-info-blue-500",
  error: "bg-red-500/10 border-red-500/20 text-red-500",
  success: "bg-green-500/10 border-green-500/20 text-green-500",
  info: "bg-info-blue-400/10 border-info-blue-400/20 text-info-blue-400",
} as const;

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "warning" | "error" | "success" | "info";
  title?: string;
}

export function Alert({
  variant = "info",
  title,
  children,
  className,
  ...props
}: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-sm border p-4",
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {title && (
        <h3 className="font-medium mb-1">{title}</h3>
      )}
      {typeof children === "string" ? (
        <p className="text-sm text-app-secondary">{children}</p>
      ) : (
        children
      )}
    </div>
  );
}
