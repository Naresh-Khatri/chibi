import { Box3, Sphere, Vector3 } from "three";
import { useUI } from "../store/ui";
import { getOrbitControls, getSceneObject } from "./objectRegistry";

export function frameSelected() {
  const id = useUI.getState().selectedId;
  if (!id) return;
  const object = getSceneObject(id);
  const controls = getOrbitControls();
  if (!object || !controls) return;

  const box = new Box3().setFromObject(object);
  let center: Vector3;
  let radius: number;
  if (box.isEmpty()) {
    center = object.getWorldPosition(new Vector3());
    radius = 1;
  } else {
    const sphere = box.getBoundingSphere(new Sphere());
    center = sphere.center.clone();
    radius = Math.max(sphere.radius, 0.5);
  }

  const camera = controls.object;
  const direction = camera.position.clone().sub(controls.target).normalize();
  if (direction.lengthSq() === 0) direction.set(1, 0.75, 1).normalize();
  controls.target.copy(center);
  camera.position.copy(center).addScaledVector(direction, radius * 3);
  controls.update();
}
