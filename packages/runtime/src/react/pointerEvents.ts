export type ScenePointerEvent = {
  type: "hoverEnter" | "hoverExit" | "pointerDown" | "pointerUp" | "pointerCancel" | "click";
  nodeId: string;
  pointerId: number;
  pointerType: string;
};

/** Pair releases with the original press target, including releases outside the canvas. */
export class PointerPresses {
  private targets = new Map<number, { nodeId: string; pointerType: string }>();

  onEvent?: (event: ScenePointerEvent) => void;

  press(pointerId: number, nodeId: string, pointerType: string): void {
    this.release(pointerId, "pointerCancel");
    this.targets.set(pointerId, { nodeId, pointerType });
    this.onEvent?.({ type: "pointerDown", pointerId, nodeId, pointerType });
  }

  release(pointerId: number, type: "pointerUp" | "pointerCancel" = "pointerUp"): void {
    const target = this.targets.get(pointerId);
    if (!target) return;
    this.targets.delete(pointerId);
    this.onEvent?.({ type, pointerId, ...target });
  }

  cancelAll(): void {
    for (const pointerId of [...this.targets.keys()]) this.release(pointerId, "pointerCancel");
  }
}
