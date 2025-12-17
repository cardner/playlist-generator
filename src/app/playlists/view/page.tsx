"use client";

import { Suspense } from "react";
import { PlaylistViewContent } from "./PlaylistViewContent";

export default function PlaylistViewPage() {
  return (
    <Suspense fallback={<div className="max-w-4xl mx-auto text-center p-8">Loading...</div>}>
      <PlaylistViewContent />
    </Suspense>
  );
}
