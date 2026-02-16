/**
 * Navigation Component
 * 
 * Main navigation bar component for the application. Provides consistent navigation
 * across all pages with active state highlighting and theme toggle integration.
 * 
 * Features:
 * - Responsive navigation menu with mobile hamburger menu
 * - Active route highlighting
 * - Theme toggle integration
 * - Clean, minimal design
 * - Mobile menu overlay with full-screen backdrop
 * 
 * Navigation Items:
 * - Home (/)
 * - Library (/library)
 * - New Playlist (/playlists/new)
 * - Saved Playlists (/playlists/saved)
 * 
 * State Management:
 * - Uses Next.js `usePathname` hook for active route detection
 * - Uses `useState` for mobile menu open/closed state
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

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Home, Library, Smartphone, ListMusic } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { Logo } from "./Logo";
import { InstallPromptButton } from "./InstallPromptButton";

const NAV_ITEMS = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/library", label: "Library", Icon: Library },
  { href: "/device-sync", label: "Device Sync", Icon: Smartphone },
  { href: "/playlists/new", label: "New Playlist", Icon: ListMusic },
  { href: "/playlists/saved", label: "Saved Playlists", Icon: ListMusic },
];

/**
 * Main navigation component
 * 
 * Renders the top navigation bar with links to main application pages.
 * Automatically highlights the active route based on current pathname.
 * Includes mobile-responsive hamburger menu with full-screen overlay.
 */
export function Navigation() {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  const navItems = NAV_ITEMS;

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    setIsHydrated(true);
  }, []);


  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Handle Escape key to close mobile menu
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isMobileMenuOpen]);

  const closeMobileMenu = () => setIsMobileMenuOpen(false);
  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  return (
    <nav className="border-b border-app-border bg-app-surface">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-center justify-between h-16">
          {/* Logo and app name - upper left */}
          <Link href="/" className="flex items-center gap-2">
            <Logo width={32} height={32} className="w-8 h-8" />
            <span className="text-app-primary font-medium text-lg hidden sm:inline">Mixtape Generator</span>
          </Link>
          
          {/* Desktop Navigation - centered, hidden on mobile */}
          <div className="hidden md:flex items-center justify-center flex-1 gap-2">
            {isHydrated &&
              navItems.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.Icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-app-hover text-app-primary"
                      : "text-app-secondary hover:bg-app-hover hover:text-app-primary"
                  }`}
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {item.label}
                </Link>
                );
              })}
          </div>
          
          {/* Right side: Theme toggle (desktop) or Menu button (mobile) */}
          <div className="flex items-center gap-4">
            <div className="hidden md:block">
              <ThemeToggle />
            </div>
            <div className="hidden md:block">
              <InstallPromptButton />
            </div>
            <button
              className="md:hidden p-2 text-app-primary hover:bg-app-hover rounded-sm transition-colors"
              onClick={toggleMobileMenu}
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
            >
              <Menu className="size-6" />
            </button>
          </div>
        </div>
      </div>
      
      {/* Mobile Menu Overlay - full screen */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm" 
            onClick={closeMobileMenu}
          />
          
          {/* Menu Content */}
          <div className="relative bg-app-surface h-full w-full flex flex-col">
            {/* Header with close button */}
            <div className="flex items-center justify-between p-4 border-b border-app-border">
              <div className="flex items-center gap-2">
                <Logo width={32} height={32} className="w-8 h-8" />
                <span className="text-app-primary font-medium text-lg">Mixtape Generator</span>
              </div>
              <button
                onClick={closeMobileMenu}
                className="p-2 text-app-primary hover:bg-app-hover rounded-sm transition-colors"
                aria-label="Close mobile menu"
              >
                <X className="size-6" />
              </button>
            </div>
            
            {/* Menu Items */}
            <div className="flex-1 flex flex-col py-8 px-4">
              <nav className="flex flex-col space-y-2">
                {isHydrated &&
                  navItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.Icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeMobileMenu}
                      className={`flex items-center gap-3 px-6 py-4 rounded-lg text-lg font-medium transition-colors ${
                        isActive
                          ? "bg-app-hover text-app-primary"
                          : "text-app-secondary hover:bg-app-hover hover:text-app-primary"
                      }`}
                    >
                      <Icon className="size-5 shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              <div className="mt-6">
                <InstallPromptButton variant="mobile" />
              </div>
              
              {/* Theme Toggle in mobile menu */}
              <div className="mt-8 pt-8 border-t border-app-border">
                <div className="flex items-center justify-between px-6">
                  <span className="text-app-secondary text-sm uppercase tracking-wider">Theme</span>
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

