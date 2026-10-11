import { describe, expect, it } from "vitest";
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from "three";
import { createDocument } from "../schema";
import { pointerOccluderIds, isOpaquePointerHit, pointerRemainsWithinNode } from "./pointerOcclusion";

describe("pointer occlusion", () => {
  it("keeps a key hovered when the hit moves between its logo and cap", () => {
    const key = new Group();
    const cap = new Mesh(undefined, new MeshBasicMaterial());
    const logo = new Mesh();
    const part = new Group();
    part.add(cap);
    key.add(part, logo);
    expect(pointerRemainsWithinNode(key, [{ object: logo }])).toBe(true);
    expect(pointerRemainsWithinNode(key, [{ object: cap }])).toBe(true);
    expect(pointerRemainsWithinNode(key, [{ object: logo }, { object: cap }])).toBe(true);
  });

  it("releases when body occlusion removes the key's hits or the pointer leaves", () => {
    const key = new Group();
    const body = new Mesh(undefined, new MeshBasicMaterial());
    const otherKey = new Group();
    const otherCap = new Mesh();
    otherKey.add(otherCap);
    expect(pointerRemainsWithinNode(key, [{ object: body }])).toBe(false);
    expect(pointerRemainsWithinNode(key, [{ object: otherCap }])).toBe(false);
    expect(pointerRemainsWithinNode(key, [])).toBe(false);
    expect(pointerRemainsWithinNode(undefined, [{ object: body }])).toBe(false);
  });

  it("releases when the logo leaves but the cap remains behind another key", () => {
    const key = new Group();
    const cap = new Mesh(undefined, new MeshBasicMaterial());
    const logo = new Mesh();
    key.add(cap, logo);
    const nextKey = new Group();
    const nextCap = new Mesh();
    nextKey.add(nextCap);
    const interactive = new Set([key, nextKey]);

    // R3F removes the old logo's hover entry before calling pointerout with
    // this unfiltered list. No second exit is guaranteed for the old cap.
    const hits = [
      { object: nextCap, eventObject: nextKey },
      { object: cap, eventObject: key },
    ];
    expect(pointerRemainsWithinNode(key, hits, interactive)).toBe(false);
    expect(pointerRemainsWithinNode(nextKey, hits, interactive)).toBe(true);
  });

  it("respects opaque blockers without treating transparent scenery as blockers", () => {
    const key = new Group();
    const cap = new Mesh(undefined, new MeshBasicMaterial());
    key.add(cap);
    const body = new Mesh(undefined, new MeshBasicMaterial());
    const hits = [{ object: body }, { object: cap, eventObject: key }];
    expect(pointerRemainsWithinNode(key, hits, new Set([key]))).toBe(false);
    body.material.transparent = true;
    expect(pointerRemainsWithinNode(key, hits, new Set([key]))).toBe(true);
    body.material.dispose();
    cap.material.dispose();
  });

  it("a different key's transparent logo blocks hover, but a key's own logo keeps it", () => {
    const key = new Group();
    const cap = new Mesh(undefined, new MeshBasicMaterial());
    key.add(cap);
    const nextKey = new Group();
    const logo = new Mesh(undefined, new MeshBasicMaterial({ transparent: true }));
    nextKey.add(logo);
    const hits = [
      { object: logo, eventObject: nextKey },
      { object: cap, eventObject: key },
    ];
    const interactive = new Set([key, nextKey]);
    expect(pointerRemainsWithinNode(key, hits, interactive)).toBe(false);
    expect(pointerRemainsWithinNode(nextKey, hits, interactive)).toBe(true);
    logo.material.dispose();
    cap.material.dispose();
  });

  it("does not retain a parent's hover when an interactive child takes over", () => {
    const parent = new Group();
    const child = new Mesh(undefined, new MeshBasicMaterial());
    parent.add(child);
    const hits = [
      { object: child, eventObject: child },
      { object: child, eventObject: parent },
    ];
    expect(pointerRemainsWithinNode(parent, hits, new Set([parent, child]))).toBe(false);
    expect(pointerRemainsWithinNode(child, hits, new Set([parent, child]))).toBe(true);
    child.material.dispose();
  });

  it("blocks unrelated geometry while preserving interactive parent groups", () => {
    const doc = createDocument();
    const mesh = doc.nodes[doc.root[0]];
    doc.nodes = {
      body: { ...mesh, id: "body", children: [] },
      key: { id: "key", name: "Key", type: "group", visible: true, transform: mesh.transform, children: ["logo"] },
      logo: { ...mesh, id: "logo", children: [] },
    };
    doc.root = ["body", "key"];
    const targets = { click: new Set(["key"]), hover: new Set(["key"]) };
    expect(pointerOccluderIds(doc, targets)).toEqual(new Set(["body"]));

    doc.nodes.key.visible = false;
    targets.click.clear();
    targets.hover.clear();
    expect(pointerOccluderIds(doc, targets)).toEqual(new Set(["body"]));
  });

  it("recognizes an opaque case hit in front of a pressed key", () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const body = new Mesh(geometry, material);
    const key = new Mesh(geometry, material);
    key.position.z = -2;
    body.updateMatrixWorld();
    key.updateMatrixWorld();
    const ray = new Raycaster(new Vector3(0, 0, 5), new Vector3(0, 0, -1));
    const hits = ray.intersectObjects([key, body]);
    expect(hits[0].object).toBe(body);
    expect(isOpaquePointerHit(hits[0])).toBe(true);
    expect(hits.find((hit) => hit.object === key)!.distance).toBeGreaterThan(hits[0].distance);
    geometry.dispose();
    material.dispose();
  });

  it("allows pointer hits through transparent or invisible geometry", () => {
    const geometry = new BoxGeometry();
    const material = new MeshBasicMaterial();
    const mesh = new Mesh(geometry, material);
    const hit = { object: mesh, face: null };
    expect(isOpaquePointerHit(hit)).toBe(true);
    material.transparent = true;
    expect(isOpaquePointerHit(hit)).toBe(false);
    material.transparent = false;
    material.opacity = 0;
    expect(isOpaquePointerHit(hit)).toBe(false);
    material.opacity = 1;
    material.visible = false;
    expect(isOpaquePointerHit(hit)).toBe(false);
    material.visible = true;
    const group = new Group();
    group.add(mesh);
    group.visible = false;
    expect(isOpaquePointerHit(hit)).toBe(false);
    geometry.dispose();
    material.dispose();
  });

  it("uses the actual hit material on models with multiple materials", () => {
    const geometry = new BoxGeometry();
    const opaque = new MeshBasicMaterial();
    const transparent = new MeshBasicMaterial({ transparent: true });
    const mesh = new Mesh(geometry, [transparent, opaque]);
    expect(isOpaquePointerHit({ object: mesh, face: { a: 0, b: 1, c: 2, normal: new Vector3(), materialIndex: 0 } })).toBe(false);
    expect(isOpaquePointerHit({ object: mesh, face: { a: 0, b: 1, c: 2, normal: new Vector3(), materialIndex: 1 } })).toBe(true);
    geometry.dispose();
    opaque.dispose();
    transparent.dispose();
  });
});
