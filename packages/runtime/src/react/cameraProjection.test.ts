import { describe, expect, it } from "vitest";
import { OrthographicCamera, PerspectiveCamera, Vector3 } from "three";
import { orthographicZoom } from "./cameraProjection";
import type { CameraDef } from "../schema";

const definition: CameraDef = { position: [0, 0, 10], target: [0, 0, 0], fov: 36, parallax: 0 };

function camera(width: number, height: number) {
  const result = new OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, 0.1, 500);
  result.position.set(...definition.position);
  result.lookAt(...definition.target);
  result.zoom = orthographicZoom(definition, height);
  result.updateProjectionMatrix();
  result.updateMatrixWorld();
  return result;
}

describe("host orthographic projection", () => {
  it("matches perspective size at the target without perspective foreshortening", () => {
    const parallel = camera(1200, 800);
    const perspective = new PerspectiveCamera(definition.fov, 1.5, 0.1, 500);
    perspective.position.set(...definition.position);
    perspective.lookAt(...definition.target);
    perspective.updateMatrixWorld();
    expect(new Vector3(1, 1, 0).project(parallel).x).toBeCloseTo(new Vector3(1, 1, 0).project(perspective).x);
    expect(new Vector3(1, 1, 3).project(parallel).x).toBeCloseTo(new Vector3(1, 1, -3).project(parallel).x);
  });

  it("keeps vertical framing stable on portrait and landscape resize", () => {
    const point = new Vector3(0, 1, 0);
    expect(point.clone().project(camera(390, 844)).y).toBeCloseTo(point.clone().project(camera(1440, 900)).y);
  });

  it("stays finite for a camera positioned at its target", () => {
    expect(Number.isFinite(orthographicZoom({ ...definition, position: [0, 0, 0] }, 800))).toBe(true);
  });
});
