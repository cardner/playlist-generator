"use client";

import { Music } from "lucide-react";
import { LibrarySelector } from "@/components/LibrarySelector";

export default function HomePage() {
  return (
    <>
      <header className="mb-8 md:mb-12">
        <div className="flex items-center gap-4">
          <div className="size-16 bg-gradient-to-br from-accent-primary to-accent-secondary rounded-sm flex items-center justify-center">
            <Music className="size-8 text-white" />
          </div>
          <div>
            <h1 className="text-app-primary tracking-tight">playlist generator</h1>
            <p className="text-app-secondary">intelligent music curation</p>
          </div>
        </div>
      </header>

      <div className="max-w-4xl">
        <LibrarySelector />
      </div>
    </>
  );
}

