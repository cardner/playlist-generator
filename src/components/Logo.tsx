/**
 * Logo Component
 * 
 * Inline SVG logo component for mixtape gen application.
 * Features a pink gradient background with a white music note icon.
 * 
 * @module components/Logo
 */

import { useId } from "react";

interface LogoProps {
  /** Width of the logo in pixels (default: 32) */
  width?: number;
  /** Height of the logo in pixels (default: 32) */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Logo component with inline SVG
 * 
 * Renders the mixtape gen logo as an inline SVG component.
 * Uses React's useId hook to generate a stable gradient ID that's consistent
 * between server and client rendering.
 */
export function Logo({ width = 32, height = 32, className = "" }: LogoProps) {
  // Use React's useId for stable, unique ID that works with SSR
  const gradientId = useId();

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="mixtape gen"
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style={{ stopColor: "#e91e63", stopOpacity: 1 }} />
          <stop offset="100%" style={{ stopColor: "#c2185b", stopOpacity: 1 }} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="4" fill={`url(#${gradientId})`} />
      {/* Music note icon - centered and scaled to fit */}
      <g transform="translate(4, 4)">
        <path
          d="M9 18V5l12-2v13"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="6" cy="18" r="3" fill="none" stroke="white" strokeWidth="2" />
        <circle cx="18" cy="16" r="3" fill="none" stroke="white" strokeWidth="2" />
      </g>
    </svg>
  );
}

