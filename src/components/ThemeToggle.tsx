"use client";

import { useTheme } from "./ThemeProvider";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggleTheme}
      className={cn(
        "relative inline-flex h-8 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent-primary focus:ring-offset-2 focus:ring-offset-app-bg",
        isDark ? "bg-accent-primary" : "bg-app-border"
      )}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      role="switch"
      aria-checked={isDark}
    >
      <span
        className={cn(
          "inline-block h-6 w-6 transform rounded-full bg-white transition-transform shadow-sm flex items-center justify-center",
          isDark ? "translate-x-7" : "translate-x-1"
        )}
      >
        {isDark ? (
          <Moon className="h-3.5 w-3.5 text-accent-primary" />
        ) : (
          <Sun className="h-3.5 w-3.5 text-app-tertiary" />
        )}
      </span>
    </button>
  );
}

