import { describe, expect, it, vi } from "vitest";
import { createPerformanceStore } from "./performance";

const details = { memoryMB: null, width: 800, height: 600, dpr: 1 };

describe("runtime performance sampling", () => {
  it("counts scene frames and keeps idle gaps out of frame time", () => {
    const store = createPerformanceStore();
    store.reset(0);
    store.record(10, true);
    store.record(30, false);
    store.record(410, true);
    store.record(430, false);
    expect(store.sample(500, details)).toMatchObject({ fps: 8, frameMs: 20, memoryMB: null });
    expect(store.sample(1000, details)).toMatchObject({ fps: 0, frameMs: null });
  });

  it("retains slow frames and continuous intervals across sampling windows", () => {
    const store = createPerformanceStore();
    store.reset(0);
    store.record(100, true);
    store.record(400, true);
    expect(store.sample(500, details)?.frameMs).toBe(300);
    store.record(700, false);
    expect(store.sample(1000, details)?.frameMs).toBe(300);
  });

  it("does not mistake a pending slow frame for demand idle", () => {
    const store = createPerformanceStore();
    store.reset(0);
    store.record(100, true);
    store.sample(500, details);
    store.sample(1000, details);
    store.record(1100, false);
    expect(store.sample(1500, details)?.frameMs).toBe(1000);
  });

  it("bounds history and clears stale readings on visibility changes or unmount", () => {
    const store = createPerformanceStore();
    store.reset(0);
    for (let i = 1; i <= 100; i++) store.sample(i * 500, details);
    expect(store.getSnapshot()?.history).toHaveLength(60);
    store.record(50010, true);
    store.reset(60000);
    expect(store.getSnapshot()).toBeNull();
    store.record(60010, false);
    expect(store.sample(60500, details)).toMatchObject({ fps: 2, frameMs: null, history: [null] });
  });

  it("isolates scenes, publishes resolution changes, and unsubscribes cleanly", () => {
    const a = createPerformanceStore();
    const b = createPerformanceStore();
    const listener = vi.fn();
    const unsubscribe = a.subscribe(listener);
    a.record(10, false);
    a.sample(500, { ...details, width: 1600, height: 1200, dpr: 2, memoryMB: 32 });
    expect(a.getSnapshot()).toMatchObject({ width: 1600, height: 1200, dpr: 2, memoryMB: 32 });
    expect(b.getSnapshot()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    a.reset(500);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
