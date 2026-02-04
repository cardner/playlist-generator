import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

interface SavePlaylistDialogProps {
  isOpen: boolean;
  defaultTitle: string;
  defaultDescription?: string;
  onClose: () => void;
  onConfirm: (options: { mode: "override" | "remix"; title: string; description?: string }) => void;
  defaultMode?: "override" | "remix";
  modeOptions?: Array<"override" | "remix">;
  titleText?: string;
  confirmLabel?: string;
  confirmDisabled?: boolean;
}

export function SavePlaylistDialog({
  isOpen,
  defaultTitle,
  defaultDescription,
  onClose,
  onConfirm,
  defaultMode = "override",
  modeOptions = ["override", "remix"],
  titleText = "Save Playlist",
  confirmLabel = "Save",
  confirmDisabled = false,
}: SavePlaylistDialogProps) {
  const initialMode =
    modeOptions.includes(defaultMode) ? defaultMode : modeOptions[0];
  const [mode, setMode] = useState<"override" | "remix">(initialMode);
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription || "");

  useEffect(() => {
    if (!isOpen) return;
    setMode(initialMode);
    setTitle(defaultTitle);
    setDescription(defaultDescription || "");
  }, [isOpen, defaultTitle, defaultDescription, initialMode]);

  useEffect(() => {
    if (mode === "remix" && title === defaultTitle) {
      setTitle(`${defaultTitle} (Remix)`);
    }
    if (mode === "override" && title.endsWith(" (Remix)")) {
      setTitle(defaultTitle);
    }
  }, [mode, title, defaultTitle]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg bg-app-surface rounded-sm border border-app-border shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-app-border">
          <h3 className="text-app-primary text-lg font-semibold">{titleText}</h3>
          <button
            onClick={onClose}
            className="p-2 text-app-secondary hover:text-app-primary transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {modeOptions.length > 1 && (
            <div className="space-y-2">
              {modeOptions.includes("override") && (
                <label className="flex items-center gap-2 text-app-primary text-sm">
                  <input
                    type="radio"
                    checked={mode === "override"}
                    onChange={() => setMode("override")}
                  />
                  Save as override
                </label>
              )}
              {modeOptions.includes("remix") && (
                <label className="flex items-center gap-2 text-app-primary text-sm">
                  <input
                    type="radio"
                    checked={mode === "remix"}
                    onChange={() => setMode("remix")}
                  />
                  Save as remixed copy
                </label>
              )}
            </div>
          )}

          <div className="space-y-3">
            <div>
              <label className="text-app-tertiary text-xs uppercase tracking-wider">Title</label>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full mt-1 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary text-sm"
              />
            </div>
            <div>
              <label className="text-app-tertiary text-xs uppercase tracking-wider">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={3}
                className="w-full mt-1 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary text-sm"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-app-border">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-app-hover text-app-primary rounded-sm text-sm border border-app-border hover:bg-app-surface-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm({ mode, title: title.trim() || defaultTitle, description: description.trim() })}
            disabled={confirmDisabled}
            className="flex items-center gap-2 px-4 py-2 bg-accent-primary text-white rounded-sm text-sm hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            <Check className="size-4" />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

