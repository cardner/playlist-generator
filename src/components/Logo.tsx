/**
 * Logo Component
 *
 * Uses the application icon from public/icon.svg.
 *
 * @module components/Logo
 */

import Image from "next/image";

interface LogoProps {
  /** Width of the logo in pixels (default: 32) */
  width?: number;
  /** Height of the logo in pixels (default: 32) */
  height?: number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Logo component
 *
 * Renders the mixtape gen logo from public/icon.svg.
 */
export function Logo({ width = 32, height = 32, className = "" }: LogoProps) {
  return (
    <Image
      src="/icon.svg"
      alt="mixtape gen"
      width={width}
      height={height}
      className={className}
      unoptimized
    />
  );
}

