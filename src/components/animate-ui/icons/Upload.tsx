"use client";

import { motion } from "motion/react";
import { useAnimateIconContext } from "../AnimateIcon";
import type { SVGProps } from "react";

export interface UploadProps extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Vertical line (arrow shaft) */
const pathShaft = "M12 3v12";
/** Arrow head (chevron up) */
const pathArrow = "m17 8-5-5-5 5";
/** Tray */
const pathTray = "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4";

const defaultLoopDuration = 0.5;

/** default-loop: arrow moves up and back while hovered */
export function Upload({ size = 24, className, ...rest }: UploadProps) {
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
      {/* Shaft + arrow: default-loop translate up and back */}
      <motion.g
        key={shouldAnimate ? "loop" : "idle"}
        initial={{ y: 0 }}
        animate={
          shouldAnimate
            ? {
                y: [0, -2, 0],
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
      {/* Tray: static */}
      <path d={pathTray} />
    </svg>
  );
}
