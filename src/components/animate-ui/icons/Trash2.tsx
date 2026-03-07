"use client";

import { motion } from "motion/react";
import { useAnimateIconContext } from "../AnimateIcon";
import type { SVGProps } from "react";

export interface Trash2Props extends SVGProps<SVGSVGElement> {
  size?: number;
}

/** Left inner vertical line */
const pathInnerLeft = "M10 11v6";
/** Right inner vertical line */
const pathInnerRight = "M14 11v6";
/** Bin body */
const pathBody = "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6";
/** Top horizontal line */
const pathTop = "M3 6h18";
/** Lid / handle */
const pathLid = "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2";

const innerLineDuration = 0.25;
const lidDuration = 0.2;

export function Trash2({ size = 24, className, ...rest }: Trash2Props) {
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
      {/* Inner lines: shrink (scaleY → 0) from bottom on hover */}
      <motion.g
        style={{ transformOrigin: "10px 17px" }}
        initial={false}
        animate={{
          scaleY: shouldAnimate ? 0 : 1,
          transition: {
            duration: innerLineDuration,
            ease: "easeInOut",
          },
        }}
      >
        <path d={pathInnerLeft} />
      </motion.g>
      <motion.g
        style={{ transformOrigin: "14px 17px" }}
        initial={false}
        animate={{
          scaleY: shouldAnimate ? 0 : 1,
          transition: {
            duration: innerLineDuration,
            ease: "easeInOut",
          },
        }}
      >
        <path d={pathInnerRight} />
      </motion.g>
      {/* Bin body and top: no animation */}
      <path d={pathBody} />
      <path d={pathTop} />
      {/* Lid: translate up on hover (opens) */}
      <motion.g
        initial={false}
        animate={{
          y: shouldAnimate ? -1.5 : 0,
          transition: {
            duration: lidDuration,
            ease: "easeOut",
          },
        }}
      >
        <path d={pathLid} />
      </motion.g>
    </svg>
  );
}
