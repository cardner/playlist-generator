"use client";

import { cn } from "@/lib/utils";
import { Label } from "./Label";

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value"> {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}

export function Textarea({
  label,
  error,
  value,
  onChange,
  placeholder,
  disabled,
  className,
  id,
  rows = 3,
  ...props
}: TextareaProps) {
  const textareaId = id ?? (label ? `textarea-${label.replace(/\s/g, "-").toLowerCase()}` : undefined);

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={textareaId}>{label}</Label>}
      <textarea
        id={textareaId}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
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
