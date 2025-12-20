/**
 * Navigation Component
 * 
 * Main navigation bar component for the application. Provides consistent navigation
 * across all pages with active state highlighting and theme toggle integration.
 * 
 * Features:
 * - Responsive navigation menu
 * - Active route highlighting
 * - Theme toggle integration
 * - Clean, minimal design
 * 
 * Navigation Items:
 * - Home (/)
 * - Library (/library)
 * - New Playlist (/playlists/new)
 * - Saved Playlists (/playlists/saved)
 * 
 * State Management:
 * - Uses Next.js `usePathname` hook for active route detection
 * - No internal state - purely presentational
 * 
 * @module components/Navigation
 * 
 * @example
 * ```tsx
 * // Used in root layout
 * <Navigation />
 * ```
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

/**
 * Main navigation component
 * 
 * Renders the top navigation bar with links to main application pages.
 * Automatically highlights the active route based on current pathname.
 */
export function Navigation() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Home" },
    { href: "/library", label: "Library" },
    { href: "/playlists/new", label: "New Playlist" },
    { href: "/playlists/saved", label: "Saved Playlists" },
  ];

  return (
    <nav className="border-b border-app-border bg-app-surface">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-app-primary font-medium tracking-tight">
            playlist generator
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-2 rounded-sm text-sm font-medium transition-colors uppercase tracking-wider ${
                      isActive
                        ? "bg-app-hover text-app-primary"
                        : "text-app-secondary hover:bg-app-hover hover:text-app-primary"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}

