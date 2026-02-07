"use client";

import { cn } from "@/lib/utils";
import { Label } from "./Label";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function Input({
  label,
  error,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  id,
  ...props
}: InputProps) {
  const inputId = id ?? (label ? `input-${label.replace(/\s/g, "-").toLowerCase()}` : undefined);

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={inputId}>{label}</Label>}
      <input
        id={inputId}
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full px-4 py-2 bg-app-surface text-app-primary border border-app-border rounded-sm text-sm",
          "focus:outline-none focus:ring-2 focus:ring-accent-primary focus:border-transparent",
          "placeholder:text-app-tertiary disabled:opacity-50 disabled:cursor-not-allowed",
          error && "border-red-500",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}
    </div>
  );
}
