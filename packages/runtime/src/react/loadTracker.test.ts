import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLoadTracker } from "./loadTracker";

describe("load tracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once armed with nothing pending", () => {
    const tracker = createLoadTracker();
    const onSettled = vi.fn();
    tracker.arm(onSettled);
    expect(onSettled).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("waits for every token, fires exactly once", () => {
    const tracker = createLoadTracker();
    const onSettled = vi.fn();
    const a = tracker.begin();
    const b = tracker.begin();
    tracker.arm(onSettled);
    a();
    a(); // double release is a no-op
    vi.runAllTimers();
    expect(onSettled).not.toHaveBeenCalled();
    b();
    vi.runAllTimers();
    expect(onSettled).toHaveBeenCalledTimes(1);
    tracker.begin()();
    vi.runAllTimers();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("survives a release + re-acquire handoff within one tick", () => {
    const tracker = createLoadTracker();
    const onSettled = vi.fn();
    const a = tracker.begin();
    tracker.arm(onSettled);
    a();
    const b = tracker.begin();
    vi.runAllTimers();
    expect(onSettled).not.toHaveBeenCalled();
    b();
    vi.runAllTimers();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  it("disarm cancels a scheduled fire; re-arm fires", () => {
    const tracker = createLoadTracker();
    const onSettled = vi.fn();
    tracker.arm(onSettled);
    tracker.disarm();
    vi.runAllTimers();
    expect(onSettled).not.toHaveBeenCalled();
    tracker.arm(onSettled);
    vi.runAllTimers();
    expect(onSettled).toHaveBeenCalledTimes(1);
  });
});
