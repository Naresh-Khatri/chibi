"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { SceneHost } from "@/runtime/react/SceneHost";
import { useDoc } from "./store/document";
import { useUI } from "./store/ui";
import { assetUrl } from "./store/assets";

// mounts the runtime SceneHost against a doc snapshot; overlay keeps the
// editor mounted underneath so camera/selection survive exit (Esc or close)
export function PreviewOverlay() {
  const [doc] = useState(() => useDoc.getState().doc);
  if (!doc) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black">
      <SceneHost doc={doc} resolveAsset={assetUrl} />
      <button
        type="button"
        title="Exit preview (Esc)"
        onClick={() => useUI.getState().setPreviewing(false)}
        className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full border border-white/20 bg-black/40 text-white/80 transition-colors hover:bg-black/70 hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
