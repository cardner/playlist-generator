"use client";

import { Github } from "lucide-react";


const GITHUB_REPO_URL = "https://github.com/cardner/playlist-generator";
const TUNESRELOADED_URL = "https://tunesreloaded.com";

export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-auto border-t border-app-border bg-app-bg">
      <div className="container mx-auto max-w-6xl px-4 py-6 md:py-6">
        <div className="flex flex-col items-center gap-2 text-center text-xs text-app-tertiary sm:flex-row sm:justify-center sm:gap-4">
          <span>© {year}</span>
          <span className="hidden sm:inline" aria-hidden>
            |
          </span>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-app-secondary hover:text-accent-primary underline underline-offset-2 transition-colors"
            aria-label="Source on GitHub"
          >
            <Github size={14} aria-hidden />
            Source on GitHub
          </a>
          <span className="hidden sm:inline" aria-hidden>
            |
          </span>
          <span>
            iPod device syncing based on <a
              href={TUNESRELOADED_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-app-secondary hover:text-accent-primary underline underline-offset-2 transition-colors"
            >
              TunesReloaded
            </a> hard work, go buy them a coffee!
            
          </span>
        </div>
      </div>
    </footer>
  );
}
