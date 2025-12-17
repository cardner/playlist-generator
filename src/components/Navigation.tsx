"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";

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
            playlist ai
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

