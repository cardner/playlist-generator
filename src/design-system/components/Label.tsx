"use client";

import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {}

export function Label({ children, className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "block text-app-tertiary text-xs uppercase tracking-wider",
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}
