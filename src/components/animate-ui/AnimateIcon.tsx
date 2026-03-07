"use client";

import { motion, useInView } from "motion/react";
import { createContext, useContext, useRef, useState, useEffect } from "react";
import { useSyncExternalStore } from "react";
import type { ComponentPropsWithoutRef } from "react";

export interface AnimateIconContextValue {
  isHovered: boolean;
  canAnimate: boolean;
}

const AnimateIconContext = createContext<AnimateIconContextValue>({
  isHovered: false,
  canAnimate: false,
});

/** When provided by a parent (e.g. Button), hover on the parent triggers icon animation. */
export const IconParentHoverContext = createContext<boolean>(false);

export function useAnimateIconContext(): AnimateIconContextValue {
  return useContext(AnimateIconContext);
}

function getReducedMotionSnapshot() {
  if (typeof window === "undefined") return true;
  if (typeof window.matchMedia !== "function") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeReducedMotion(callback: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

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
  const ref = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    () => true
  );
  const [isHovered, setIsHovered] = useState(false);
  const parentHovered = useContext(IconParentHoverContext);
  const [isTapped, setIsTapped] = useState(false);
  const inView = useInView(ref, { once: true, amount: 0.5 });
  const effectiveHovered = isHovered || parentHovered;

  useEffect(() => {
    if (!isTapped) return;
    const t = setTimeout(() => setIsTapped(false), 150);
    return () => clearTimeout(t);
  }, [isTapped]);

  const canAnimate = !prefersReducedMotion;
  const scale = !canAnimate
    ? 1
    : isTapped && animateOnTap
      ? 0.95
      : effectiveHovered && animateOnHover
        ? 1.08
        : inView && animateOnView
          ? 1.05
          : 1;

  const contextValue: AnimateIconContextValue = {
    isHovered: effectiveHovered && !!animateOnHover,
    canAnimate,
  };

  return (
    <AnimateIconContext.Provider value={contextValue}>
      <motion.span
        ref={ref}
        {...rest}
        style={{ display: "inline-flex", ...rest.style }}
        initial={false}
        animate={{ scale }}
        transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
        onHoverStart={() => canAnimate && animateOnHover && setIsHovered(true)}
        onHoverEnd={() => setIsHovered(false)}
        onPointerLeave={() => setIsHovered(false)}
        onTapStart={() => canAnimate && animateOnTap && setIsTapped(true)}
      >
        {children}
      </motion.span>
    </AnimateIconContext.Provider>
  );
}
