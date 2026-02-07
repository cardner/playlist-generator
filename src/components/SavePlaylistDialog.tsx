"use client";

import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { Dialog, Button, Input, Textarea } from "@/design-system/components";

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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()} title={titleText}>
      <Dialog.Body className="p-6">
        <div className="space-y-4">
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
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </Dialog.Body>
      <Dialog.Footer className="px-6">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="primary"
          leftIcon={<Check className="size-4" />}
          onClick={() => onConfirm({ mode, title: title.trim() || defaultTitle, description: description.trim() })}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </Button>
      </Dialog.Footer>
    </Dialog>
  );
}
