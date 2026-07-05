"use client";

import { use } from "react";
import { EditorRoot } from "@/editor/EditorRoot";

export default function EditorPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  const { docId } = use(params);
  return <EditorRoot docId={docId} />;
}
