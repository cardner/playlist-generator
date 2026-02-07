"use client";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
}

function DialogRoot({ open, onOpenChange, title, children }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
          onClick={() => onOpenChange(false)}
        />
        <RadixDialog.Content
          className={cn(
            "fixed left-[50%] top-[50%] z-50 w-full max-w-2xl max-h-[90vh] translate-x-[-50%] translate-y-[-50%]",
            "bg-app-surface rounded-sm border border-app-border shadow-2xl",
            "flex flex-col overflow-hidden mx-4",
          )}
          onPointerDownOutside={() => onOpenChange(false)}
          onEscapeKeyDown={() => onOpenChange(false)}
        >
          <div className="flex items-center justify-between p-4 border-b border-app-border shrink-0">
            <RadixDialog.Title className={cn(title ? "text-app-primary text-lg font-semibold" : "sr-only")}>
              {title ?? "Dialog"}
            </RadixDialog.Title>
            <RadixDialog.Close asChild>
              <button
                className="p-1 hover:bg-app-hover rounded-sm transition-colors text-app-secondary hover:text-app-primary"
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </RadixDialog.Close>
          </div>
          <RadixDialog.Description asChild>
            <span className="sr-only">{title ? `${title} dialog` : "Dialog"}</span>
          </RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function DialogBody({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("overflow-y-auto flex-1 p-4", className)}
      {...props}
    >
      {children}
    </div>
  );
}

function DialogFooter({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex items-center justify-end gap-2 p-4 border-t border-app-border shrink-0", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export const Dialog = Object.assign(DialogRoot, {
  Body: DialogBody,
  Footer: DialogFooter,
});
