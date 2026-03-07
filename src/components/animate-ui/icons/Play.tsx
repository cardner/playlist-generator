"use client";

import { motion } from "motion/react";
import { useAnimateIconContext } from "../AnimateIcon";
import type { SVGProps } from "react";

export interface PlayProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Lucide Play triangle */
const pathPlay = "M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z";

const defaultLoopDuration = 0.5;

/** default-loop: translate right and back while hovered (same pattern as Download/Upload). */
export function Play({ size = 24, className, ...rest }: PlayProps) {
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
        initial={{ x: 0 }}
        animate={
          shouldAnimate
            ? {
                x: [0, 2, 0],
                transition: {
                  duration: defaultLoopDuration,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }
            : { x: 0 }
        }
      >
        <path d={pathPlay} />
      </motion.g>
    </svg>
  );
}
