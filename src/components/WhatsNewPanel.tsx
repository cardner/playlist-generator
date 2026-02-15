"use client";

import { useEffect, useMemo, useRef, useState, isValidElement } from "react";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, ScrollText, X } from "lucide-react";
import { parseChangelog } from "@/lib/parse-changelog";
import "./HelpPanel.css";

const STORAGE_KEY = "whats-new-panel-open";
const PANEL_ID = "whats-new-panel";
const TITLE_ID = "whats-new-panel-title";

const DEFAULT_OPEN_COUNT = 3;

function getTextFromChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((child) => getTextFromChildren(child)).join("");
  }
  if (children && typeof children === "object" && isValidElement(children)) {
    return getTextFromChildren(
      (children as React.ReactElement<{ children?: ReactNode }>).props.children
    );
  }
  return "";
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function WhatsNewPanel({ markdown }: { markdown: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const releases = useMemo(
    () => parseChangelog(markdown, { filterOtherChanges: true }),
    [markdown]
  );

  const [openReleases, setOpenReleases] = useState<Set<string>>(() =>
    new Set(releases.slice(0, DEFAULT_OPEN_COUNT).map((r) => r.version))
  );

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "true") {
      setIsOpen(true);
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    localStorage.setItem(STORAGE_KEY, String(isOpen));
  }, [isOpen, isHydrated]);

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  const handleScroll = () => {
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
    setShowScrollTop(scrollTop > 240);
  };

  const handleScrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleToggleRelease = (version: string, nextOpen: boolean) => {
    setOpenReleases((prev) => {
      const updated = new Set(prev);
      if (nextOpen) {
        updated.add(version);
      } else {
        updated.delete(version);
      }
      return updated;
    });
  };

  const markdownComponents: Components = {
    h2: ({ children }) => {
      const text = getTextFromChildren(children);
      const id = slugify(text);
      return (
        <h2
          id={id}
          className="text-xl font-semibold text-app-primary mt-5 scroll-mt-24 mb-2"
        >
          {children}
        </h2>
      );
    },
    h3: ({ children }) => {
      const text = getTextFromChildren(children);
      const id = slugify(text);
      return (
        <h3
          id={id}
          className="text-lg font-semibold text-app-primary mt-4 scroll-mt-24 mb-2"
        >
          {children}
        </h3>
      );
    },
    p: ({ children }) => (
      <p className="text-app-secondary leading-relaxed mt-0">{children}</p>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside space-y-1.5 text-app-secondary mt-1 help-list">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside space-y-1.5 text-app-secondary mt-1 help-list">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="text-app-secondary">{children}</li>
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        className="text-accent-primary hover:text-accent-hover underline underline-offset-4"
      >
        {children}
      </a>
    ),
    code: ({ children }) => (
      <code className="px-1.5 py-0.5 rounded-sm bg-app-hover text-app-primary text-sm">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="p-4 rounded-sm bg-app-hover text-app-primary overflow-x-auto">
        {children}
      </pre>
    ),
    strong: ({ children }) => (
      <strong className="text-app-primary font-semibold">{children}</strong>
    ),
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 left-6 z-40 flex items-center gap-1.5 px-3 py-2 rounded-full bg-accent-primary text-white shadow-lg hover:bg-accent-hover transition-colors"
        aria-label={isOpen ? "Close What's New panel" : "Open What's New panel"}
        aria-expanded={isOpen}
        aria-controls={PANEL_ID}
      >
        <ScrollText className="size-4" />
        <span className="text-xs font-medium">What&apos;s New</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby={TITLE_ID}
        >
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div
            id={PANEL_ID}
            className="absolute left-0 top-0 h-full w-full md:w-[75vw] bg-app-surface border-r border-app-border shadow-2xl flex flex-col relative"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-app-border">
              <h2
                id={TITLE_ID}
                className="text-app-primary text-lg font-semibold"
              >
                What&apos;s New
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 text-app-secondary hover:text-app-primary hover:bg-app-hover rounded-sm transition-colors"
                aria-label="Close What's New panel"
              >
                <X className="size-5" />
              </button>
            </div>

            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-6"
              onScroll={handleScroll}
            >
              <div className="space-y-4">
                {releases.map((release) => (
                  <details
                    key={release.version}
                    className="group border border-app-border rounded-sm bg-app-hover"
                    open={openReleases.has(release.version)}
                    onToggle={(event) => {
                      const element = event.currentTarget;
                      handleToggleRelease(release.version, element.open);
                    }}
                  >
                    <summary className="flex items-center justify-between gap-3 px-4 py-3 text-app-primary text-lg font-semibold cursor-pointer list-none">
                      <span>
                        <strong>v{release.version}</strong>
                        {" — "}
                        {release.date}
                      </span>
                      <ChevronDown className="size-4 text-app-secondary transition-transform group-open:rotate-180 shrink-0" />
                    </summary>
                    <div className="px-4 pb-4 pt-1">
                      {release.body ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={markdownComponents}
                        >
                          {release.body}
                        </ReactMarkdown>
                      ) : null}
                    </div>
                  </details>
                ))}
              </div>
            </div>
            {showScrollTop && (
              <button
                type="button"
                onClick={handleScrollToTop}
                className="absolute bottom-6 right-6 px-3 py-2 rounded-full bg-app-hover text-app-primary border border-app-border shadow-lg hover:bg-app-surface-hover transition-colors text-xs uppercase tracking-wider"
                aria-label="Scroll release notes to top"
              >
                Back to top
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
