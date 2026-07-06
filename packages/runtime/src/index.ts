/**
 * @chibi3d/runtime public surface — everything a host app needs to render and
 * drive an exported chibi scene. Keep this curated: editor-only helpers stay
 * on their subpaths.
 */
export { ChibiScene } from "./react/ChibiScene";
export type { ChibiSceneApi, ChibiSceneProps } from "./react/ChibiScene";
export { SceneHost } from "./react/SceneHost";
export type { SceneHostProps } from "./react/SceneHost";

export { loadDocument } from "./load";
export type { LoadedScene } from "./load";
export type { ResolveAssetUrl } from "./assets";

export { InteractionRuntime } from "./engine/interactions";
export type { RuntimeEvent, TransitionOpts } from "./engine/interactions";

// zod schema, validateDocument, migrations, all document types
export * from "./schema";
