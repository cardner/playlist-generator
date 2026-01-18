import type { TrackRecord } from "@/db/schema";
import type { LLMConfig } from "@/types/playlist";
import { X } from "lucide-react";
import { MultiCriteriaTrackSearch } from "./MultiCriteriaTrackSearch";

interface TrackAddDialogProps {
  isOpen: boolean;
  libraryRootId?: string;
  llmConfig?: LLMConfig;
  onAddTrack: (track: TrackRecord) => void;
  onClose: () => void;
}

export function TrackAddDialog({
  isOpen,
  libraryRootId,
  llmConfig,
  onAddTrack,
  onClose,
}: TrackAddDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-3xl bg-app-surface rounded-sm border border-app-border shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-app-border">
          <h3 className="text-app-primary text-lg font-semibold">Add Track</h3>
          <button
            onClick={onClose}
            className="p-2 text-app-secondary hover:text-app-primary transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="p-6">
          <MultiCriteriaTrackSearch
            libraryRootId={libraryRootId}
            llmConfig={llmConfig}
            onSelectTrack={(track) => {
              onAddTrack(track);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}

