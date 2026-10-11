import { describe, expect, it, vi } from "vitest";
import { PointerPresses } from "./pointerEvents";

describe("host pointer sessions", () => {
  it("releases the original target once even when the release has no hit", () => {
    const emit = vi.fn();
    const presses = new PointerPresses();
    presses.onEvent = emit;
    presses.press(3, "first", "mouse");
    presses.release(3);
    presses.release(3);
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      { type: "pointerDown", pointerId: 3, nodeId: "first", pointerType: "mouse" },
      { type: "pointerUp", pointerId: 3, nodeId: "first", pointerType: "mouse" },
    ]);
  });
  it("cancels one touch without releasing another", () => {
    const emit = vi.fn();
    const presses = new PointerPresses();
    presses.onEvent = emit;
    presses.press(1, "a", "touch");
    presses.press(2, "b", "touch");
    presses.release(1, "pointerCancel");
    presses.release(2);
    expect(emit.mock.calls.slice(2).map(([event]) => [event.type, event.nodeId])).toEqual([
      ["pointerCancel", "a"], ["pointerUp", "b"],
    ]);
  });
  it("cancels all outstanding presses on blur without repeating releases", () => {
    const emit = vi.fn();
    const presses = new PointerPresses();
    presses.onEvent = emit;
    presses.press(1, "a", "pen");
    presses.press(2, "b", "touch");
    presses.cancelAll();
    presses.cancelAll();
    expect(emit.mock.calls.slice(2).map(([event]) => event.type)).toEqual(["pointerCancel", "pointerCancel"]);
  });
  it("cancels an old press when a pointer id is reused", () => {
    const emit = vi.fn();
    const presses = new PointerPresses();
    presses.onEvent = emit;
    presses.press(1, "a", "mouse");
    presses.press(1, "b", "mouse");
    expect(emit.mock.calls.slice(1).map(([event]) => [event.type, event.nodeId])).toEqual([
      ["pointerCancel", "a"], ["pointerDown", "b"],
    ]);
  });
});
