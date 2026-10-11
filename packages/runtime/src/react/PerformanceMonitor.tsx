"use client";

import { useLayoutEffect, useRef } from "react";
import { addAfterEffect, useFrame, useThree } from "@react-three/fiber";
import type { PerformanceSnapshot, PerformanceStore } from "./performance";

export function PerformanceMonitor({ store, onPerformance }: {
  store: PerformanceStore;
  onPerformance?: (sample: PerformanceSnapshot) => void;
}) {
  const get = useThree((state) => state.get);
  const frameloop = useThree((state) => state.frameloop);
  const pending = useRef<number | null>(null);
  const callback = useRef(onPerformance);
  useLayoutEffect(() => { callback.current = onPerformance; }, [onPerformance]);
  useLayoutEffect(() => {
    const canvas = get().gl.domElement;
    const reset = () => { pending.current = null; store.reset(performance.now()); };
    reset();
    const unsubscribe = addAfterEffect(() => {
      if (pending.current === null) return; // Another Canvas may have rendered.
      const { internal, frameloop } = get();
      store.record(pending.current, frameloop === "always" || internal.frames > 0);
      pending.current = null;
    });
    document.addEventListener("visibilitychange", reset);
    canvas.addEventListener("webglcontextlost", reset);
    canvas.addEventListener("webglcontextrestored", reset);
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      const { gl } = get();
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      const sample = store.sample(performance.now(), {
        memoryMB: memory ? memory.usedJSHeapSize / 1048576 : null,
        width: gl.domElement.width, height: gl.domElement.height, dpr: gl.getPixelRatio(),
      });
      if (sample) callback.current?.(sample);
    }, 500);
    return () => {
      unsubscribe();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", reset);
      canvas.removeEventListener("webglcontextlost", reset);
      canvas.removeEventListener("webglcontextrestored", reset);
      reset();
    };
  }, [get, store, frameloop]);
  useFrame(() => { pending.current = performance.now(); }, -Infinity);
  return null;
}
