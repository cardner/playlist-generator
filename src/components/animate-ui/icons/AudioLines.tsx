"use client";

import { motion } from "motion/react";
import { useSyncExternalStore } from "react";
import type { SVGProps } from "react";

function getReducedMotionSnapshot() {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(callback: () => void) {
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

export interface AudioLinesProps extends SVGProps<SVGSVGElement> {
  size?: number;
  /** When true, run the animation (e.g. for loading state). */
  animate?: boolean;
  /** Loop the animation. */
  loop?: boolean;
  /** Animation delay in seconds. */
  delay?: number;
}

const paths = [
  { d: "M2 10v3", key: "1" },
  { d: "M6 6v11", key: "2" },
  { d: "M10 3v18", key: "3" },
  { d: "M14 8v7", key: "4" },
  { d: "M18 5v13", key: "5" },
  { d: "M22 10v3", key: "6" },
];

export function AudioLines({
  size = 28,
  animate = false,
  loop = false,
  delay = 0,
  className,
  ...rest
}: AudioLinesProps) {
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => true
  );
  const shouldAnimate = !prefersReducedMotion && (animate || loop);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...rest}
    >
      {paths.map(({ d, key }, i) => (
        <motion.path
          key={key}
          d={d}
          initial={shouldAnimate ? { pathLength: 0, opacity: 0.5 } : undefined}
          animate={
            shouldAnimate
              ? {
                  pathLength: [0, 1, 0],
                  opacity: [0.5, 1, 0.5],
                  transition: {
                    duration: 1.2,
                    repeat: loop ? Infinity : 0,
                    delay: delay + i * 0.1,
                  },
                }
              : undefined
          }
        />
      ))}
    </svg>
  );
}
