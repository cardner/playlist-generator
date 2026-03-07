"use client";

import { motion } from "motion/react";
import { useAnimateIconContext } from "../AnimateIcon";
import type { SVGProps } from "react";

export interface PauseProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Lucide Pause: two vertical bars */
const pathLeft = "M8 4v16";
const pathRight = "M16 4v16";

const defaultLoopDuration = 0.5;

/** default-loop: translate down and back while hovered (same pattern as Play/Download/Upload). */
export function Pause({ size = 24, className, ...rest }: PauseProps) {
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
        initial={{ y: 0 }}
        animate={
          shouldAnimate
            ? {
                y: [0, 2, 0],
                transition: {
                  duration: defaultLoopDuration,
                  repeat: Infinity,
                  ease: "easeInOut",
                },
              }
            : { y: 0 }
        }
      >
        <path d={pathLeft} />
        <path d={pathRight} />
      </motion.g>
    </svg>
  );
}
