import type { Easing } from "../schema/types";

// Cubic easing curves over normalized u ∈ [0, 1].
export const EASING: Record<Easing, (u: number) => number> = {
  linear: (u) => u,
  easeIn: (u) => u * u * u,
  easeOut: (u) => 1 - (1 - u) ** 3,
  easeInOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2),
};

export const DEFAULT_EASE: Easing = "easeInOut";
