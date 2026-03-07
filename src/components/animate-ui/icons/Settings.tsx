"use client";

import { motion } from "motion/react";
import { useAnimateIconContext } from "../AnimateIcon";
import type { SVGProps } from "react";

export interface SettingsProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Lucide Settings gear path */
const pathGear =
  "M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915";

const defaultLoopDuration = 1.2;

/** default: gear rotates while hovered (default animation for settings/cog per Animate UI). */
export function Settings({ size = 24, className, ...rest }: SettingsProps) {
  const { isHovered, canAnimate } = useAnimateIconContext();
  const shouldAnimate = canAnimate && isHovered;

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
      <motion.g
        key={shouldAnimate ? "loop" : "idle"}
        style={{ transformOrigin: "12px 12px" }}
        initial={{ rotate: 0 }}
        animate={
          shouldAnimate
            ? {
                rotate: [0, 360],
                transition: {
                  duration: defaultLoopDuration,
                  repeat: Infinity,
                  ease: "linear",
                },
              }
            : { rotate: 0 }
        }
      >
        <path d={pathGear} />
        <circle cx="12" cy="12" r="3" />
      </motion.g>
    </svg>
  );
}
