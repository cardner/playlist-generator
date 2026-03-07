"use client";

import { motion } from "motion/react";
import { useAnimateIconContext } from "../AnimateIcon";
import type { SVGProps } from "react";

export interface DownloadProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Vertical line (arrow shaft) */
const pathShaft = "M12 15V3";
/** Tray */
const pathTray = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4";
/** Arrow head (chevron down) */
const pathArrow = "m7 10 5 5 5-5";

const defaultLoopDuration = 0.5;

/** default-loop: arrow moves down and back while hovered */
export function Download({ size = 24, className, ...rest }: DownloadProps) {
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
      {/* Tray: static */}
      <path d={pathTray} />
      {/* Shaft + arrow: default-loop translate down and back */}
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
        <path d={pathShaft} />
        <path d={pathArrow} />
      </motion.g>
    </svg>
  );
}
