"use client";

import { useEffect, useMemo, useRef, useState, isValidElement } from "react";
import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown, HelpCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "./HelpPanel.css";

const STORAGE_KEY = "help-panel-open";
const PANEL_ID = "help-panel";
const TITLE_ID = "help-panel-title";

type TocItem = {
  id: string;
  text: string;
  level: 2 | 3;
};

type MarkdownSection = {
  id: string;
  title: string;
  content: string;
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getTextFromChildren(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map((child) => getTextFromChildren(child)).join("");
  }
  if (children && typeof children === "object" && isValidElement(children)) {
    return getTextFromChildren(children.props.children);
  }
  return "";
}

function parseToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      const text = h2Match[1].trim();
      const id = slugify(text);
      if (id) items.push({ id, text, level: 2 });
      continue;
    }

    const h3Match = line.match(/^###\s+(.+)/);
    if (h3Match) {
      const text = h3Match[1].trim();
      const id = slugify(text);
      if (id) items.push({ id, text, level: 3 });
    }
  }

  return items;
}

function splitMarkdownSections(markdown: string): {
  intro: string;
  sections: MarkdownSection[];
} {
  const lines = markdown.split("\n");
  const introLines: string[] = [];
  const sections: MarkdownSection[] = [];
  let current: { title: string; lines: string[] } | null = null;

  for (const line of lines) {
    const h2Match = line.match(/^##\s+(.+)/);
    if (h2Match) {
      if (current) {
        sections.push({
          id: slugify(current.title),
          title: current.title,
          content: current.lines.join("\n").trim(),
        });
      }
      current = { title: h2Match[1].trim(), lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    } else {
      introLines.push(line);
    }
  }

  if (current) {
    sections.push({
      id: slugify(current.title),
      title: current.title,
      content: current.lines.join("\n").trim(),
    });
  }

  return { intro: introLines.join("\n").trim(), sections };
}

export function HelpPanel({ markdown }: { markdown: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set<string>()
  );
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const tocItems = useMemo(() => parseToc(markdown), [markdown]);
  const { intro, sections } = useMemo(() => splitMarkdownSections(markdown), [markdown]);
  const headingToSection = useMemo(() => {
    const map = new Map<string, string>();
    for (const section of sections) {
      if (!section.id) continue;
      map.set(section.id, section.id);
      const lines = section.content.split("\n");
      for (const line of lines) {
        const h3Match = line.match(/^###\s+(.+)/);
        if (h3Match) {
          const id = slugify(h3Match[1].trim());
          if (id) {
            map.set(id, section.id);
          }
        }
      }
    }
    return map;
  }, [sections]);

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
    setShowScrollTop(false);
    if (sections.length > 0) {
      setOpenSections(new Set([sections[0].id]));
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, sections]);

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

  const handleToggleSection = (sectionId: string, nextOpen: boolean) => {
    setOpenSections((prev) => {
      const updated = new Set(prev);
      if (nextOpen) {
        updated.add(sectionId);
      } else {
        updated.delete(sectionId);
      }
      return updated;
    });
  };

  const scrollToElement = (targetId: string, sectionId?: string) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const target =
      container.querySelector<HTMLElement>(`#${CSS.escape(targetId)}`) ??
      (sectionId
        ? container.querySelector<HTMLElement>(`[data-help-section="${sectionId}"]`)
        : null);
    if (!target) return;

    const containerRect = container.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const offset = targetRect.top - containerRect.top + container.scrollTop - 16;
    container.scrollTo({ top: offset, behavior: "smooth" });
  };

  const handleTocClick = (headingId: string) => {
    const sectionId = headingToSection.get(headingId);
    if (sectionId) {
      setOpenSections((prev) => {
        const next = new Set(prev);
        next.add(sectionId);
        return next;
      });
    }
    requestAnimationFrame(() => {
      scrollToElement(headingId, sectionId);
    });
  };

  const markdownComponents: Components = {
    h1: ({ children }) => {
      const text = getTextFromChildren(children);
      const id = slugify(text);
      return (
        <h1 id={id} className="text-2xl font-semibold text-app-primary scroll-mt-24 mb-2 mt-8">
          {children}
        </h1>
      );
    },
    h2: ({ children }) => {
      const text = getTextFromChildren(children);
      const id = slugify(text);
      return (
        <h2 id={id} className="text-xl font-semibold text-app-primary mt-5 scroll-mt-24 mb-2">
          {children}
        </h2>
      );
    },
    h3: ({ children }) => {
      const text = getTextFromChildren(children);
      const id = slugify(text);
      return (
        <h3 id={id} className="text-lg font-semibold text-app-primary mt-4 scroll-mt-24 mb-2">
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
    li: ({ children }) => <li className="text-app-secondary">{children}</li>,
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
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-accent-primary text-white shadow-xl hover:bg-accent-hover transition-colors"
        aria-label={isOpen ? "Close help panel" : "Open help panel"}
        aria-expanded={isOpen}
        aria-controls={PANEL_ID}
      >
        <HelpCircle className="size-5" />
        <span className="text-sm font-medium">Help</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-labelledby={TITLE_ID}>
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsOpen(false)}
          />
          <div
            id={PANEL_ID}
            className="absolute right-0 top-0 h-full w-full md:w-[75vw] bg-app-surface border-l border-app-border shadow-2xl flex flex-col relative"
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-app-border">
              <h2 id={TITLE_ID} className="text-app-primary text-lg font-semibold">
                Help & Guidance
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-2 text-app-secondary hover:text-app-primary hover:bg-app-hover rounded-sm transition-colors"
                aria-label="Close help panel"
              >
                <X className="size-5" />
              </button>
            </div>

            <div
              ref={scrollContainerRef}
              className="flex-1 overflow-y-auto p-6"
              onScroll={handleScroll}
            >
              {tocItems.length > 0 && (
                <div className="bg-app-hover border border-app-border rounded-sm p-4">
                  <div className="text-app-secondary text-xs uppercase tracking-wider mb-3">
                    Contents
                  </div>
                  <ul className="space-y-2 text-sm">
                    {tocItems.map((item) => (
                      <li key={`${item.level}-${item.id}`}>
                        <a
                          href={`#${item.id}`}
                          onClick={(event) => {
                            event.preventDefault();
                            handleTocClick(item.id);
                          }}
                          className={cn(
                            "text-app-primary hover:text-accent-primary transition-colors",
                            item.level === 3 && "pl-4 text-app-secondary"
                          )}
                        >
                          {item.text}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {intro && (
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {intro}
                </ReactMarkdown>
              )}
              <div className="space-y-4">
                {sections.map((section, index) => (
                  <details
                    key={section.id || section.title}
                    className="group border border-app-border rounded-sm bg-app-hover"
                    open={openSections.has(section.id)}
                    onToggle={(event) => {
                      const element = event.currentTarget;
                      handleToggleSection(section.id, element.open);
                    }}
                  >
                    <summary
                      id={section.id}
                      data-help-section={section.id}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-app-primary text-lg font-semibold cursor-pointer list-none"
                    >
                      <span>{section.title}</span>
                      <ChevronDown className="size-4 text-app-secondary transition-transform group-open:rotate-180" />
                    </summary>
                    <div className="px-4 pb-4 pt-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {section.content}
                      </ReactMarkdown>
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
                aria-label="Scroll help content to top"
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
