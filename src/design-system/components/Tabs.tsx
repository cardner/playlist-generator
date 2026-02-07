"use client";

import * as RadixTabs from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

export interface TabsProps {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: React.ReactNode; icon?: React.ReactNode }>;
  className?: string;
}

export function Tabs({ value, onValueChange, items, className }: TabsProps) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange}>
      <RadixTabs.List
        className={cn(
          "flex gap-2 border-b border-app-border mb-6",
          className
        )}
      >
        {items.map((item) => (
          <RadixTabs.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              "px-4 py-2 flex items-center gap-2 transition-colors relative",
              "data-[state=active]:text-accent-primary data-[state=inactive]:text-app-secondary data-[state=inactive]:hover:text-app-primary",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            )}
          >
            {item.icon}
            <span className="font-medium">{item.label}</span>
            {value === item.value && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent-primary" />
            )}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
    </RadixTabs.Root>
  );
}
