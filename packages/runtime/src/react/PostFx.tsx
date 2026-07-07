"use client";

import type { ReactElement } from "react";
import {
  Bloom,
  EffectComposer,
  N8AO,
  ToneMapping,
  Vignette,
} from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { Environment as EnvironmentDef } from "../schema";

const TONE_MAPPING_MODES: Record<
  EnvironmentDef["toneMapping"],
  ToneMappingMode
> = {
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
  agx: ToneMappingMode.AGX,
};

/** true when the doc needs the effect composer mounted */
export function needsPostFx(environment: EnvironmentDef): boolean {
  return environment.ao || environment.bloom || environment.vignette;
}

/**
 * doc-driven postprocessing chain. The composer forces the renderer to
 * NoToneMapping, so the ToneMapping effect always closes the chain — it reads
 * gl.toneMappingExposure, keeping the doc `exposure` control live. Only
 * mounted when needsPostFx(); an all-off doc pays zero composer cost.
 */
export function PostFx({ environment }: { environment: EnvironmentDef }) {
  const effects: ReactElement[] = [];
  if (environment.ao) {
    // wide soft AO: darkens every crevice/contact, the core of the clay look
    effects.push(
      <N8AO
        key="ao"
        aoRadius={0.6}
        intensity={2.5}
        distanceFalloff={0.75}
        quality="medium"
      />,
    );
  }
  if (environment.bloom) {
    effects.push(
      <Bloom
        key="bloom"
        mipmapBlur
        intensity={0.4}
        luminanceThreshold={0.85}
        luminanceSmoothing={0.2}
      />,
    );
  }
  effects.push(
    <ToneMapping key="tone" mode={TONE_MAPPING_MODES[environment.toneMapping]} />,
  );
  if (environment.vignette) {
    effects.push(<Vignette key="vignette" offset={0.2} darkness={0.45} />);
  }
  return <EffectComposer multisampling={4}>{effects}</EffectComposer>;
}
