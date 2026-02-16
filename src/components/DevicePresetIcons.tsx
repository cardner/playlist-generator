"use client";

import { useId } from "react";
import type { SVGProps } from "react";

/** Jellyfin logo with app accent colors (replaces brand purple/blue gradient). */
export function JellyfinIcon(props: SVGProps<SVGSVGElement>) {
  const id = useId();
  const gradientId = `jellyfin-app-gradient-${id.replace(/:/g, "")}`;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      fill="none"
      aria-hidden
      {...props}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0%"
          y1="0%"
          x2="100%"
          y2="100%"
          gradientUnits="objectBoundingBox"
        >
          <stop offset="0" stopColor="var(--accent-primary)" />
          <stop offset="1" stopColor="var(--accent-secondary)" />
        </linearGradient>
      </defs>
      <path
        d="M256 196.2c-22.4 0-94.8 131.3-83.8 153.4s156.8 21.9 167.7 0-61.3-153.4-83.9-153.4"
        fill={`url(#${gradientId})`}
      />
      <path
        d="M256 0C188.3 0-29.8 395.4 3.4 462.2s472.3 66 505.2 0S323.8 0 256 0m165.6 404.3c-21.6 43.2-309.3 43.8-331.1 0S211.7 101.4 256 101.4 443.2 361 421.6 404.3"
        fill={`url(#${gradientId})`}
      />
    </svg>
  );
}

/** Walkman logo (from Walkman 4.svg), colored via currentColor. */
export function WalkmanIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-0.53 -7.78 806.19 382.57"
      fill="currentColor"
      aria-hidden
      {...props}
    >
      <path d="m250.45 65.58c-34.8 7.58-59.52 38.76-61.54 77.91-2.16 40.67-18.22 74.61-47.5 78.08-28.02 3.23-42.03-31.08-43.89-58.28-1.81-26.77-15.09-60.74-49.88-52.99-32.78 7.17-47.09 48.11-47.63 75.11-.54 27.3 11.12 63.77 42.37 61.74 24.19-1.61 42.48 21.18 43.02 55.59.47 33.6 18.93 72.02 55.48 72.05 38.66 0 59.95-32.69 60.93-78.82.87-39.99 25.23-68.61 51.84-71.51 27.55-2.89 52.92 21.15 55.78 65.18 3.03 44.78 25.67 83.87 85.59 83.87 64.87-.03 81.88-49.22 80.71-96.26-1.22-46.52 34.32-78.85 77.23-84.74 46.79-6.39 95.39-41.51 89.57-112.68-5.7-69.73-60.09-87.61-109.1-76.83-56.53 12.49-85.33 55.75-84.48 100.83.74 44.24-19.74 83.6-63.7 88.72-42.68 5.11-62.04-27.85-64.87-66.94-2.77-38.61-29.14-69.15-69.93-60.03zm449.74 308.64c58.95 0 105.47-38.42 99.13-99.66-6.33-60.06-58.74-91.74-115.43-85.95-53.35 5.35-92.06 42.28-88.12 96.39 3.98 54.98 49.01 89.22 104.42 89.22z" />
    </svg>
  );
}
