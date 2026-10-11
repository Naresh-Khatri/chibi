import { describe, expect, it } from "vitest";
import { InteractionRuntime } from "@/runtime/engine";
import { buildGardenScene, GARDEN_BUTTERFLY, GARDEN_FLIGHT, GARDEN_FLOWERS, GARDEN_RABBIT } from "./garden";

describe("garden interactions", () => {
  it("grows one flower independently and restores its original size on a second tap", () => {
    const doc = buildGardenScene();
    const runtime = new InteractionRuntime(doc);
    const [flower, other] = GARDEN_FLOWERS;
    runtime.pointer("click", flower);
    expect(runtime.stateOf(other)).toBe("base");
    expect(runtime.advance(0.7).get(`${flower}:transform.scale`)).toEqual([1.08, 1.08, 1.08]);
    runtime.pointer("click", flower);
    expect(runtime.advance(0.7).get(`${flower}:transform.scale`)).toEqual(doc.nodes[flower].transform.scale);
    expect(doc.nodes[flower].transform.scale).toEqual([0.72, 0.72, 0.72]);
  });

  it("wakes the rabbit and both eyes together, then returns all of them to sleep", () => {
    const runtime = new InteractionRuntime(buildGardenScene());
    runtime.pointer("click", GARDEN_RABBIT);
    const awake = runtime.advance(0.7);
    expect(awake.get("nd_garden_eye_left:transform.scale")).toEqual([0.024, 0.033, 0.018]);
    expect(awake.get("nd_garden_eye_right:transform.scale")).toEqual([0.024, 0.033, 0.018]);
    runtime.pointer("click", GARDEN_RABBIT);
    const asleep = runtime.advance(0.7);
    expect(asleep.get("nd_garden_eye_left:transform.scale")).toEqual([0.035, 0.01, 0.018]);
    expect(runtime.stateOf(GARDEN_RABBIT)).toBe("base");
  });

  it("parks the butterfly at its original position after a finite flight and can replay it", () => {
    const doc = buildGardenScene();
    const runtime = new InteractionRuntime(doc);
    runtime.pointer("click", GARDEN_BUTTERFLY);
    const positionKey = `${GARDEN_BUTTERFLY}:transform.position`;
    expect(runtime.advance(1).get(positionKey)).not.toEqual(doc.nodes[GARDEN_BUTTERFLY].transform.position);
    expect(runtime.advance(3).get(positionKey)).toEqual(doc.nodes[GARDEN_BUTTERFLY].transform.position);
    expect(runtime.isActive()).toBe(false);
    runtime.play(GARDEN_FLIGHT);
    expect(runtime.advance(1).get(positionKey)).not.toEqual(doc.nodes[GARDEN_BUTTERFLY].transform.position);
    runtime.stop(GARDEN_FLIGHT);
    expect(runtime.advance(0).get(positionKey)).toEqual(doc.nodes[GARDEN_BUTTERFLY].transform.position);
  });
});
