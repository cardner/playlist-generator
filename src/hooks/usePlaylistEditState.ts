import { useCallback, useEffect, useState } from "react";
import type { GeneratedPlaylist } from "@/features/playlists";
import type { PlaylistSummary } from "@/features/playlists";

interface EditStateOptions {
  buildSummary: (trackFileIds: string[]) => PlaylistSummary;
}

export function usePlaylistEditState(
  playlist: GeneratedPlaylist,
  { buildSummary }: EditStateOptions
) {
  const [editedPlaylist, setEditedPlaylist] = useState<GeneratedPlaylist>(playlist);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setEditedPlaylist(playlist);
    setIsDirty(false);
  }, [playlist]);

  useEffect(() => {
    const summary = buildSummary(editedPlaylist.trackFileIds);
    setEditedPlaylist((prev) => ({
      ...prev,
      summary,
      totalDuration: summary.totalDuration,
    }));
  }, [buildSummary, editedPlaylist.trackFileIds]);

  const updateTrackFileIds = useCallback(
    (trackFileIds: string[]) => {
      const summary = buildSummary(trackFileIds);
      setEditedPlaylist((prev) => ({
        ...prev,
        trackFileIds,
        summary,
        totalDuration: summary.totalDuration,
      }));
      setIsDirty(true);
    },
    [buildSummary]
  );

  const updatePlaylist = useCallback((updater: (prev: GeneratedPlaylist) => GeneratedPlaylist) => {
    setEditedPlaylist((prev) => {
      const next = updater(prev);
      const summary = buildSummary(next.trackFileIds);
      return {
        ...next,
        summary,
        totalDuration: summary.totalDuration,
      };
    });
    setIsDirty(true);
  }, [buildSummary]);

  const resetEdits = useCallback(() => {
    setEditedPlaylist(playlist);
    setIsDirty(false);
  }, [playlist]);

  const markClean = useCallback((next: GeneratedPlaylist) => {
    setEditedPlaylist(next);
    setIsDirty(false);
  }, []);

  return {
    editedPlaylist,
    isDirty,
    setEditedPlaylist,
    updateTrackFileIds,
    updatePlaylist,
    resetEdits,
    markClean,
  };
}

