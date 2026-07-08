import { describe, expect, it } from "vitest";
import { DEFAULT_MATERIAL_ID } from "@/runtime/schema";
import { SCENE_TEMPLATES } from "./templates";

describe("scene templates", () => {
  for (const template of SCENE_TEMPLATES) {
    describe(template.title, () => {
      const doc = template.build();

      it("validates and carries the default material", () => {
        expect(doc.name).toBe(template.title);
        expect(doc.materials[DEFAULT_MATERIAL_ID]).toBeDefined();
      });

      it("has a consistent tree: every node referenced exactly once", () => {
        const refs = [
          ...doc.root,
          ...Object.values(doc.nodes).flatMap((n) => n.children),
        ];
        expect(refs.sort()).toEqual(Object.keys(doc.nodes).sort());
        expect(new Set(refs).size).toBe(refs.length);
      });

      it("only references pooled materials", () => {
        for (const node of Object.values(doc.nodes)) {
          if (node.type === "mesh") {
            expect(doc.materials[node.materialId]).toBeDefined();
          }
        }
      });

      it("animation tracks target real nodes", () => {
        for (const clip of Object.values(doc.animations)) {
          for (const track of clip.tracks) {
            expect(doc.nodes[track.targetId]).toBeDefined();
          }
        }
      });

      it("start interactions play clips that exist", () => {
        for (const ix of doc.interactions) {
          if (ix.action.type === "playAnimation") {
            expect(doc.animations[ix.action.animationId]).toBeDefined();
          }
        }
      });

      it("interaction triggers/targets and states reference real nodes", () => {
        for (const state of Object.values(doc.states)) {
          expect(doc.nodes[state.nodeId]).toBeDefined();
        }
        for (const ix of doc.interactions) {
          if ("nodeId" in ix.trigger) expect(doc.nodes[ix.trigger.nodeId]).toBeDefined();
          if (ix.action.type === "transition") {
            expect(ix.action.to === "base" || doc.states[ix.action.to]).toBeTruthy();
          }
        }
      });

      it("scroll bindings reference real clips/states", () => {
        for (const binding of doc.scrollBindings) {
          if (binding.target.type === "animation") {
            expect(doc.animations[binding.target.animationId]).toBeDefined();
          } else {
            expect(doc.states[binding.target.stateId]?.nodeId).toBe(binding.target.nodeId);
          }
        }
      });

      it("builds a fresh copy each time", () => {
        expect(template.build()).not.toBe(doc);
        expect(template.build()).toEqual(doc);
      });
    });
  }
});
