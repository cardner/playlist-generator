/**
 * Spotify Import Component
 * 
 * UI component for importing Spotify library data from GDPR export JSON files.
 * Supports drag & drop, file picker, and ZIP archive extraction.
 * 
 * @module components/SpotifyImport
 */

"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileJson, Loader2, CheckCircle2, AlertCircle, X, Music, Play, Users } from "lucide-react";
import JSZip from "jszip";
import { parseSpotifyExport, type SpotifyExportData } from "@/features/spotify-import/parser";
import { createSpotifyCollection } from "@/features/spotify-import/collection-creator";
import { checkReimport, updateCollectionWithExport } from "@/features/spotify-import/reimport";
import { logger } from "@/lib/logger";
import { cn } from "@/lib/utils";

interface SpotifyImportProps {
  /** Callback when import is complete */
  onImportComplete: (collectionId: string) => void;
  /** Callback to close the import modal */
  onClose: () => void;
}

/**
 * Spotify import component with file upload and preview
 */
export function SpotifyImport({ onImportComplete, onClose }: SpotifyImportProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [exportData, setExportData] = useState<SpotifyExportData | null>(null);
  const [collectionName, setCollectionName] = useState("");
  const [importPlaylistsAsCollections, setImportPlaylistsAsCollections] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingCollection, setExistingCollection] = useState<{ id: string; name: string } | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback((selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    const fileArray = Array.from(selectedFiles);
    const jsonFiles = fileArray.filter(
      (f) => f.name.toLowerCase().endsWith(".json") || f.name.toLowerCase().endsWith(".zip")
    );

    if (jsonFiles.length === 0) {
      setError("Please select JSON files or a ZIP archive containing JSON files");
      return;
    }

    setFiles(jsonFiles);
    setError(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragging(false);
      handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const parseFiles = useCallback(async () => {
    if (files.length === 0) {
      setError("Please select files first");
      return;
    }

    setIsParsing(true);
    setError(null);

    try {
      const fileContents: Array<{ fileName: string; content: string }> = [];

      for (const file of files) {
        if (file.name.toLowerCase().endsWith(".zip")) {
          const zip = await JSZip.loadAsync(file);
          const entries = Object.values(zip.files);

          for (const entry of entries) {
            if (entry.dir || !entry.name.toLowerCase().endsWith(".json")) {
              continue;
            }
            const content = await entry.async("string");
            const nameParts = entry.name.split("/");
            const fileName = nameParts[nameParts.length - 1] || entry.name;
            fileContents.push({ fileName, content });
          }

          continue;
        }

        const content = await file.text();
        fileContents.push({ fileName: file.name, content });
      }

      if (fileContents.length === 0) {
        setError("No JSON files found in the selected files");
        return;
      }

      const parsed = parseSpotifyExport(fileContents);
      setExportData(parsed);
      
      // Check for existing collection
      const reimportCheck = await checkReimport(parsed);
      if (reimportCheck.action === "update" && reimportCheck.existingCollection) {
        setExistingCollection({
          id: reimportCheck.existingCollection.id,
          name: reimportCheck.existingCollection.name,
        });
        setCollectionName(reimportCheck.existingCollection.name);
        setIsUpdating(true);
      } else {
        setCollectionName(parsed.playlists.length > 0 ? "My Spotify Library" : "Spotify Import");
        setIsUpdating(false);
      }
    } catch (err) {
      logger.error("Failed to parse Spotify export:", err);
      setError(err instanceof Error ? err.message : "Failed to parse Spotify export files");
    } finally {
      setIsParsing(false);
    }
  }, [files]);

  const handleImport = useCallback(async () => {
    if (!exportData || !collectionName.trim()) {
      setError("Please provide a collection name");
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      let libraryRoot;

      if (isUpdating && existingCollection) {
        // Update existing collection
        const { getCollection } = await import("@/db/storage");
        const collection = await getCollection(existingCollection.id);
        if (!collection) {
          throw new Error("Collection not found");
        }
        libraryRoot = await updateCollectionWithExport(collection, exportData);
      } else {
        // Create new collection
        libraryRoot = await createSpotifyCollection(exportData, collectionName.trim());
      }

      // Import playlists if any
      if (exportData.playlists.length > 0) {
        const { importPlaylistsAsCollections: importAsCollections, importPlaylistsAsSavedPlaylists } = await import(
          "@/features/spotify-import/playlist-collection"
        );
        
        if (importPlaylistsAsCollections) {
          // Import playlists as separate collections
          await importAsCollections(exportData.playlists, collectionName.trim());
        } else {
          // Import playlists as saved playlists in the main collection
          await importPlaylistsAsSavedPlaylists(exportData.playlists, libraryRoot.id);
        }
      }

      onImportComplete(libraryRoot.id);
      onClose();
    } catch (err) {
      logger.error("Failed to import Spotify collection:", err);
      setError(err instanceof Error ? err.message : "Failed to import Spotify collection");
    } finally {
      setIsImporting(false);
    }
  }, [exportData, collectionName, importPlaylistsAsCollections, isUpdating, existingCollection, onImportComplete, onClose]);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setExportData(null);
  }, []);

  return (
    <div className="space-y-6">
      {/* File Upload Area */}
      {!exportData && (
        <div>
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={cn(
              "border-2 border-dashed rounded-sm p-8 text-center transition-colors",
              isDragging
                ? "border-accent-primary bg-accent-primary/10"
                : "border-app-border hover:border-app-secondary",
              files.length > 0 && "border-accent-primary"
            )}
          >
            {files.length === 0 ? (
              <>
                <Upload className="size-12 text-app-tertiary mx-auto mb-4" />
                <p className="text-app-primary mb-2 font-medium">
                  Drop Spotify export files here
                </p>
                <p className="text-app-secondary text-sm mb-4">
                  Or click to select JSON files from your Spotify export
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors text-sm"
                >
                  Select Files
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".json,.zip"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
              </>
            ) : (
              <div className="space-y-3">
                <CheckCircle2 className="size-8 text-accent-primary mx-auto" />
                <p className="text-app-primary font-medium">
                  {files.length} file{files.length !== 1 ? "s" : ""} selected
                </p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {files.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-2 bg-app-hover rounded-sm text-sm"
                    >
                      <FileJson className="size-4 text-accent-primary shrink-0" />
                      <span className="flex-1 text-app-primary truncate">{file.name}</span>
                      <button
                        onClick={() => removeFile(index)}
                        className="p-1 hover:bg-app-surface rounded-sm transition-colors"
                        aria-label="Remove file"
                      >
                        <X className="size-4 text-app-secondary" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={parseFiles}
                  disabled={isParsing}
                  className="px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  {isParsing ? (
                    <>
                      <Loader2 className="size-4 animate-spin inline mr-2" />
                      Parsing...
                    </>
                  ) : (
                    "Parse Files"
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Preview and Import */}
      {exportData && (
        <div className="space-y-4">
          <div className="p-4 bg-accent-primary/10 border border-accent-primary/20 rounded-sm">
            <h3 className="text-app-primary font-medium mb-3">Import Preview</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Music className="size-5 text-accent-primary" />
                <div>
                  <div className="text-app-primary font-medium">{exportData.savedTracks.length}</div>
                  <div className="text-app-secondary">Tracks</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Play className="size-5 text-accent-primary" />
                <div>
                  <div className="text-app-primary font-medium">{exportData.playlists.length}</div>
                  <div className="text-app-secondary">Playlists</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Users className="size-5 text-accent-primary" />
                <div>
                  <div className="text-app-primary font-medium">{exportData.followedArtists.length}</div>
                  <div className="text-app-secondary">Artists</div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {isUpdating && existingCollection && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-sm p-3 flex items-start gap-2">
                <AlertCircle className="size-5 text-blue-500 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-blue-500 text-sm font-medium mb-1">Updating Existing Collection</p>
                  <p className="text-blue-500 text-sm">
                    Found existing collection &quot;{existingCollection.name}&quot;. It will be updated with new tracks.
                  </p>
                </div>
              </div>
            )}

            <div>
              <label className="block text-app-primary text-sm font-medium mb-2">
                Collection Name
              </label>
              <input
                type="text"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="My Spotify Library"
                disabled={isUpdating}
                className="w-full px-3 py-2 bg-app-hover border border-app-border rounded-sm text-app-primary focus:outline-none focus:ring-2 focus:ring-accent-primary disabled:opacity-50"
              />
            </div>

            {exportData.playlists.length > 0 && (
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={importPlaylistsAsCollections}
                    onChange={(e) => setImportPlaylistsAsCollections(e.target.checked)}
                    className="rounded border-app-border text-accent-primary focus:ring-accent-primary"
                  />
                  <span className="text-app-primary text-sm">
                    Import {exportData.playlists.length} playlist{exportData.playlists.length !== 1 ? "s" : ""} as separate collections
                  </span>
                </label>
                <p className="text-app-secondary text-xs mt-1 ml-6">
                  If unchecked, playlists will be imported as saved playlists in this collection
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={isImporting || !collectionName.trim()}
              className="flex-1 px-4 py-2 bg-accent-primary hover:bg-accent-hover text-white rounded-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <Loader2 className="size-4 animate-spin inline mr-2" />
                  {isUpdating ? "Updating..." : "Importing..."}
                </>
              ) : (
                isUpdating ? "Update Collection" : "Import Collection"
              )}
            </button>
            <button
              onClick={() => {
                setExportData(null);
                setFiles([]);
                setCollectionName("");
              }}
              disabled={isImporting}
              className="px-4 py-2 bg-app-hover hover:bg-app-surface-hover text-app-primary rounded-sm border border-app-border transition-colors disabled:opacity-50"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-sm flex items-start gap-2">
          <AlertCircle className="size-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-red-500 text-sm font-medium">Error</p>
            <p className="text-red-500 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="p-1 hover:bg-red-500/20 rounded-sm transition-colors"
          >
            <X className="size-4 text-red-500" />
          </button>
        </div>
      )}
    </div>
  );
}

