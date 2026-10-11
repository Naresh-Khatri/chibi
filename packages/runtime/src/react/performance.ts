export type PerformanceSnapshot = {
  /** Canvas frames rendered per wall-clock second, including idle time. */
  fps: number;
  /** Mean interval between continuous frames; null while idle. Not input/GPU latency. */
  frameMs: number | null;
  /** Page-wide JS heap, when the browser exposes it. Not GPU memory. */
  memoryMB: number | null;
  width: number;
  height: number;
  dpr: number;
  /** Last 30 seconds of frame-time averages; null denotes idle. */
  history: readonly (number | null)[];
};

export function createPerformanceStore() {
  let snapshot: PerformanceSnapshot | null = null;
  const listeners = new Set<() => void>();
  let started = 0;
  let previous: number | null = null;
  let frames = 0;
  let intervalTotal = 0;
  let intervalCount = 0;
  const publish = (value: PerformanceSnapshot | null) => {
    snapshot = value;
    listeners.forEach((listener) => listener());
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    reset(now: number) {
      started = now;
      previous = null;
      frames = intervalTotal = intervalCount = 0;
      publish(null);
    },
    record(now: number, continues: boolean) {
      if (previous !== null && now > previous) {
        intervalTotal += now - previous;
        intervalCount++;
      }
      previous = continues ? now : null;
      frames++;
    },
    sample(now: number, details: Pick<PerformanceSnapshot, "memoryMB" | "width" | "height" | "dpr">) {
      if (now <= started) return null;
      const frameMs = intervalCount ? intervalTotal / intervalCount : null;
      const value: PerformanceSnapshot = {
        ...details, fps: frames * 1000 / (now - started), frameMs,
        history: [...(snapshot?.history ?? []).slice(-59), frameMs],
      };
      frames = intervalTotal = intervalCount = 0;
      started = now;
      publish(value);
      return value;
    },
  };
}
export type PerformanceStore = ReturnType<typeof createPerformanceStore>;
