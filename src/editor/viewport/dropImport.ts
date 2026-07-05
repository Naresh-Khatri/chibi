import { addModelNode } from "../store/commands";
import {
  MAX_ASSET_BYTES,
  WARN_ASSET_BYTES,
  importAssetFile,
} from "../store/assets";
import { useUI } from "../store/ui";

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp"]);

export async function handleDroppedFiles(files: FileList) {
  const { showToast } = useUI.getState();
  for (const file of Array.from(files)) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    try {
      if (ext === "glb" || ext === "gltf") {
        if (file.size > MAX_ASSET_BYTES) {
          showToast(`"${file.name}" is over 100 MB — not imported`);
          continue;
        }
        if (file.size > WARN_ASSET_BYTES) {
          showToast(`"${file.name}" is over 25 MB — expect slow loads`);
        }
        const asset = await importAssetFile(file, "glb");
        addModelNode(asset);
      } else if (IMAGE_EXTS.has(ext)) {
        const asset = await importAssetFile(file, "texture");
        showToast(`Texture "${asset.name}" added — assign it in a material`);
      } else {
        showToast(`Unsupported file type: "${file.name}"`);
      }
    } catch (err) {
      console.warn("chibi: import failed", err);
      showToast(`Failed to import "${file.name}"`);
    }
  }
}
