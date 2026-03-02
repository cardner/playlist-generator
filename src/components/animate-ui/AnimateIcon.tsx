"use client";

import { motion } from "motion/react";
import type { ComponentPropsWithoutRef } from "react";

type MotionSpanProps = ComponentPropsWithoutRef<typeof motion.span>;

export interface AnimateIconProps extends Omit<MotionSpanProps, "children"> {
  children: React.ReactNode;
  asChild?: boolean;
  /** When true, run the animation once (or in a loop if loop is true). */
  animate?: boolean;
  /** Animate when the element is hovered. */
  animateOnHover?: boolean;
  /** Animate when tapped. */
  animateOnTap?: boolean;
  /** Animate when in view. */
  animateOnView?: boolean;
  /** Loop the animation. */
  loop?: boolean;
  /** Animation delay in seconds. */
  delay?: number;
  /** Animation preset name (e.g. "default", "path", "path-loop"). */
  animation?: string;
}

export function AnimateIcon({
  children,
  asChild = false,
  animate,
  animateOnHover,
  animateOnTap,
  animateOnView,
  loop = false,
  delay = 0,
  animation = "default",
  ...rest
}: AnimateIconProps) {
  return (
    <motion.span
      {...rest}
      style={{ display: "inline-flex", ...rest.style }}
      initial={false}
    >
      {children}
    </motion.span>
  );
}
