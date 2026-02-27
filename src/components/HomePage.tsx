"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Music,
  ListMusic,
  Library,
  Smartphone,
  Sparkles,
  ArrowRight,
  FolderOpen,
  RefreshCw,
  Zap,
  BookOpen,
  ChevronRight,
  CheckCircle2,
  Info,
  Compass,
  Usb,
} from "lucide-react";
import { getAllSavedPlaylists } from "@/db/playlist-storage";
import { getAllLibraryRoots } from "@/db/storage";
import { getDeviceProfiles } from "@/features/devices/device-storage";
import type { GeneratedPlaylist } from "@/features/playlists";
import type { LibraryRootRecord } from "@/db/schema";
import type { DeviceProfileRecord } from "@/db/schema";

const RECENT_PLAYLISTS_LIMIT = 3;
const RECENT_COLLECTIONS_LIMIT = 3;
const RECENT_DEVICES_LIMIT = 3;

export function HomePage() {
  const [recentPlaylists, setRecentPlaylists] = useState<GeneratedPlaylist[]>([]);
  const [collections, setCollections] = useState<LibraryRootRecord[]>([]);
  const [devices, setDevices] = useState<DeviceProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [metadataInfoOpen, setMetadataInfoOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [playlists, roots, profiles] = await Promise.all([
          getAllSavedPlaylists(),
          getAllLibraryRoots(),
          getDeviceProfiles(),
        ]);
        if (cancelled) return;
        setRecentPlaylists(playlists.slice(0, RECENT_PLAYLISTS_LIMIT));
        const sortedRoots = [...roots].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
        setCollections(sortedRoots.slice(0, RECENT_COLLECTIONS_LIMIT));
        const sortedDevices = [...profiles].sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
        setDevices(sortedDevices.slice(0, RECENT_DEVICES_LIMIT));
      } catch {
        if (!cancelled) {
          setRecentPlaylists([]);
          setCollections([]);
          setDevices([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasReturningContent = recentPlaylists.length > 0 || collections.length > 0 || devices.length > 0;

  return (
    <div className="space-y-12 pb-8">
      {/* Hero */}
      <section className="text-center max-w-2xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-semibold text-app-primary tracking-tight mb-3">
          Intelligent music curation
        </h1>
        <p className="text-app-secondary text-lg leading-relaxed">
          Generate playlists from your local library using mood, activity, and genre. 
          Privacy-first—your files stay on your device. Sync to iPod, export to M3U, or browse and remix.
        </p>
      </section>

      {/* Get started */}
      <section>
        <h2 className="text-xl font-medium text-app-primary mb-4 flex items-center gap-2">
          <Sparkles className="size-5 text-accent-primary" aria-hidden />
          Get started
        </h2>
        <div className="grid gap-4 sm:grid-cols-3 mb-8">
          <Link
            href="/library"
            className="group flex items-start gap-3 rounded-lg border border-app-border bg-app-surface p-4 transition-colors hover:border-app-hover hover:bg-app-surface-hover"
          >
            <span className="rounded-md bg-accent-primary/15 p-2 text-accent-primary">
              <FolderOpen className="size-5" aria-hidden />
            </span>
            <div>
              <span className="font-medium text-app-primary block">1. Select your music folder</span>
              <span className="text-sm text-app-tertiary">Choose a library to scan and index.</span>
            </div>
            <ChevronRight className="size-4 text-app-tertiary shrink-0 mt-0.5 group-hover:text-app-primary" aria-hidden />
          </Link>
          <Link
            href="/library"
            className="group flex items-start gap-3 rounded-lg border border-app-border bg-app-surface p-4 transition-colors hover:border-app-hover hover:bg-app-surface-hover"
          >
            <span className="rounded-md bg-accent-primary/15 p-2 text-accent-primary">
              <RefreshCw className="size-5" aria-hidden />
            </span>
            <div>
              <span className="font-medium text-app-primary block">2. Scan your library</span>
              <span className="text-sm text-app-tertiary">We read metadata to power playlists.</span>
            </div>
            <ChevronRight className="size-4 text-app-tertiary shrink-0 mt-0.5 group-hover:text-app-primary" aria-hidden />
          </Link>
          <Link
            href="/playlists/new"
            className="group flex items-start gap-3 rounded-lg border border-app-border bg-app-surface p-4 transition-colors hover:border-app-hover hover:bg-app-surface-hover"
          >
            <span className="rounded-md bg-accent-primary/15 p-2 text-accent-primary">
              <ListMusic className="size-5" aria-hidden />
            </span>
            <div>
              <span className="font-medium text-app-primary block">3. Create a playlist</span>
              <span className="text-sm text-app-tertiary">Pick mood, genre, length—we do the rest.</span>
            </div>
            <ChevronRight className="size-4 text-app-tertiary shrink-0 mt-0.5 group-hover:text-app-primary" aria-hidden />
          </Link>
        </div>

        {/* Jump back in — card wider than page content, max 80vw, centered */}
        {!loading && hasReturningContent && (
          <div className="mt-10 w-screen max-w-none ml-[calc(50%-50vw)]">
            <div className="mx-auto w-[80vw] max-w-[80vw] rounded-lg border border-app-border bg-app-surface py-6">
              <div className="mx-auto max-w-6xl px-4">
              <h2 className="text-xl font-medium text-app-primary mb-2 flex items-center gap-2">
                <Zap className="size-5 text-accent-primary" aria-hidden />
                Jump back in
              </h2>
              <p className="text-app-secondary text-sm mb-4">
                Pick up where you left off—your collections, devices, and playlists.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs font-medium text-app-tertiary uppercase tracking-wider mb-2">Collections</p>
                  <div className="space-y-2">
                    {collections.length > 0 ? (
                      collections.map((c) => (
                        <Link
                          key={c.id}
                          href="/library"
                          className="flex items-center gap-2 rounded-lg border border-app-border bg-app-hover/50 p-3 text-app-primary hover:border-app-hover hover:bg-app-surface-hover transition-colors group"
                        >
                          <Library className="size-4 text-accent-primary shrink-0" aria-hidden />
                          <span className="truncate flex-1 text-sm font-medium">{c.name}</span>
                          <ChevronRight className="size-3.5 text-app-tertiary group-hover:text-app-primary shrink-0" aria-hidden />
                        </Link>
                      ))
                    ) : (
                      <p className="text-app-tertiary text-xs py-2">No collections yet</p>
                    )}
                  </div>
                  <Link href="/library" className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline">
                    Open library <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
                <div>
                  <p className="text-xs font-medium text-app-tertiary uppercase tracking-wider mb-2">Devices</p>
                  <div className="space-y-2">
                    {devices.length > 0 ? (
                      devices.map((d) => (
                        <Link
                          key={d.id}
                          href="/device-sync"
                          className="flex items-center gap-2 rounded-lg border border-app-border bg-app-hover/50 p-3 text-app-primary hover:border-app-hover hover:bg-app-surface-hover transition-colors group"
                        >
                          <Smartphone className="size-4 text-accent-primary shrink-0" aria-hidden />
                          <span className="truncate flex-1 text-sm font-medium">{d.label}</span>
                          <ChevronRight className="size-3.5 text-app-tertiary group-hover:text-app-primary shrink-0" aria-hidden />
                        </Link>
                      ))
                    ) : (
                      <p className="text-app-tertiary text-xs py-2">No devices yet</p>
                    )}
                  </div>
                  <Link href="/device-sync" className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline">
                    Device sync <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
                <div>
                  <p className="text-xs font-medium text-app-tertiary uppercase tracking-wider mb-2">Playlists</p>
                  <div className="space-y-2">
                    {recentPlaylists.length > 0 ? (
                      recentPlaylists.map((p) => (
                        <Link
                          key={p.id}
                          href={`/playlists/view?id=${p.id}`}
                          className="flex items-center gap-2 rounded-lg border border-app-border bg-app-hover/50 p-3 text-app-primary hover:border-app-hover hover:bg-app-surface-hover transition-colors group"
                        >
                          <ListMusic className="size-4 text-accent-primary shrink-0" aria-hidden />
                          <span className="truncate flex-1 text-sm font-medium">{p.title || "Untitled"}</span>
                          <ChevronRight className="size-3.5 text-app-tertiary group-hover:text-app-primary shrink-0" aria-hidden />
                        </Link>
                      ))
                    ) : (
                      <p className="text-app-tertiary text-xs py-2">No playlists yet</p>
                    )}
                  </div>
                  <Link href="/playlists/saved" className="mt-2 inline-flex items-center gap-1 text-xs text-accent-primary hover:underline">
                    View all saved <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
              </div>
              </div>
            </div>
          </div>
        )}

        {/* Privacy & Metadata callouts — no cards, divider above, extra spacing */}
        <hr className="border-app-border mt-12 mb-0" />
        <div className="grid gap-4 md:grid-cols-2 py-10">
          <div className="flex items-start gap-3 text-left">
            <CheckCircle2 className="size-5 text-accent-primary shrink-0 mt-0.5" aria-hidden />
            <div>
              <h3 className="text-app-primary mb-1.5 text-sm font-medium">Privacy First</h3>
              <p className="text-app-secondary text-xs leading-relaxed">
                All music files are processed locally in your browser. No files are uploaded to any server. Your music library stays completely private.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 text-left relative">
            <Sparkles className="size-5 text-accent-primary shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-app-primary text-sm font-medium">Metadata Enhancement</h3>
                <button
                  type="button"
                  onClick={() => setMetadataInfoOpen((prev) => !prev)}
                  onBlur={() => setMetadataInfoOpen(false)}
                  className="p-1 rounded-sm hover:bg-app-hover text-app-tertiary hover:text-app-primary transition-colors"
                  aria-label="Metadata enhancement info"
                >
                  <Info className="size-4" aria-hidden />
                </button>
              </div>
              <p className="text-app-secondary text-xs leading-relaxed">
                Enhance track metadata using MusicBrainz API and audio analysis. This will add genres, similar artists, and tempo/BPM information.
              </p>
              {metadataInfoOpen && (
                <div className="absolute left-0 right-0 top-full mt-2 w-full max-w-md bg-app-surface border border-app-border rounded-sm shadow-lg p-3 text-xs text-app-tertiary z-10">
                  <p className="font-medium mb-1 text-app-primary">Note:</p>
                  <ul className="list-disc list-inside space-y-0.5">
                    <li>MusicBrainz API rate limit: 1 request per second</li>
                    <li>Enhancement may take several minutes for large libraries</li>
                    <li>Tempo detection requires audio file access (may not work for all tracks)</li>
                    <li>Manual edits take precedence over auto-enhanced data</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Using the app + Suggested next steps (returning users) */}
      {!loading && hasReturningContent && (
        <section className="mt-12">
          <div className="grid gap-8 md:grid-cols-2">
            {/* Left: New music discovery + Device sync */}
            <div className="space-y-8">
              <div className="rounded-lg border border-app-border bg-app-surface p-6">
                <h2 className="text-lg font-medium text-app-primary mb-3 flex items-center gap-2">
                  <Compass className="size-5 text-accent-primary" aria-hidden />
                  New music discovery
                </h2>
                <p className="text-app-secondary text-sm leading-relaxed mb-3">
                  When you create a playlist, enable <strong className="text-app-primary">Discovery</strong> to mix in tracks you don&apos;t own yet—suggestions come from MusicBrainz based on your chosen genres, artists, and mood. Discovery tracks appear in the playlist with a note that they&apos;re for finding new music; you can export or sync the rest of the playlist as usual.
                </p>
                <Link href="/playlists/new" className="inline-flex items-center gap-1 text-sm text-accent-primary hover:underline">
                  Create a playlist with discovery <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
              <div className="rounded-lg border border-app-border bg-app-surface p-6">
                <h2 className="text-lg font-medium text-app-primary mb-3 flex items-center gap-2">
                  <Usb className="size-5 text-accent-primary" aria-hidden />
                  Device sync
                </h2>
                <p className="text-app-secondary text-sm leading-relaxed mb-3">
                  Sync playlists to a USB device or export for Jellyfin. Presets are available for <strong className="text-app-primary">iPod</strong>, <strong className="text-app-primary">Walkman</strong>, <strong className="text-app-primary">Zune</strong>, <strong className="text-app-primary">generic USB</strong> (M3U/PLS/XSPF), and <strong className="text-app-primary">Jellyfin</strong> (playlist export only). Select your device, pick playlists or collection tracks, and we copy files and write playlists to the device.
                </p>
                <p className="text-app-tertiary text-xs leading-relaxed mb-3">
                  <strong className="text-app-secondary">iPod sync:</strong> Uses a WebAssembly build of libgpod (WASM, default) or an experimental TypeScript backend. If the device database is corrupted or you see parse errors, try the other backend in settings. Artwork sync is supported on compatible devices with the WASM build.
                </p>
                <Link href="/device-sync" className="inline-flex items-center gap-1 text-sm text-accent-primary hover:underline">
                  Open device sync <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </div>

            {/* Right: Suggested next steps */}
            <div className="rounded-lg border border-app-border bg-app-surface p-6">
              <h2 className="text-xl font-medium text-app-primary mb-4 flex items-center gap-2">
                <BookOpen className="size-5 text-accent-primary" aria-hidden />
                Suggested next steps
              </h2>
              <ul className="space-y-2">
                <li>
                  <Link
                    href="/playlists/new"
                    className="flex items-center gap-3 rounded-lg border border-app-border bg-app-hover/50 p-3 transition-colors hover:border-app-hover hover:bg-app-surface-hover group"
                  >
                    <Music className="size-4 text-accent-primary shrink-0" aria-hidden />
                    <span className="text-app-primary">Create a playlist from a mood or activity</span>
                    <ChevronRight className="size-4 text-app-tertiary group-hover:text-app-primary shrink-0 ml-auto" aria-hidden />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/device-sync"
                    className="flex items-center gap-3 rounded-lg border border-app-border bg-app-hover/50 p-3 transition-colors hover:border-app-hover hover:bg-app-surface-hover group"
                  >
                    <Smartphone className="size-4 text-accent-primary shrink-0" aria-hidden />
                    <span className="text-app-primary">Sync a playlist to your iPod or device</span>
                    <ChevronRight className="size-4 text-app-tertiary group-hover:text-app-primary shrink-0 ml-auto" aria-hidden />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/library"
                    className="flex items-center gap-3 rounded-lg border border-app-border bg-app-hover/50 p-3 transition-colors hover:border-app-hover hover:bg-app-surface-hover group"
                  >
                    <Library className="size-4 text-accent-primary shrink-0" aria-hidden />
                    <span className="text-app-primary">Browse your library and try discovery</span>
                    <ChevronRight className="size-4 text-app-tertiary group-hover:text-app-primary shrink-0 ml-auto" aria-hidden />
                  </Link>
                </li>
                <li>
                  <Link
                    href="/playlists/saved"
                    className="flex items-center gap-3 rounded-lg border border-app-border bg-app-hover/50 p-3 transition-colors hover:border-app-hover hover:bg-app-surface-hover group"
                  >
                    <RefreshCw className="size-4 text-accent-primary shrink-0" aria-hidden />
                    <span className="text-app-primary">Remix or edit a saved playlist</span>
                    <ChevronRight className="size-4 text-app-tertiary group-hover:text-app-primary shrink-0 ml-auto" aria-hidden />
                  </Link>
                </li>
              </ul>
              <p className="mt-3 text-xs text-app-tertiary">
                Tip: Use the &quot;recent&quot; source when creating a playlist to build from your newest additions.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Quick links when no returning content yet */}
      {!loading && !hasReturningContent && (
        <section>
          <h2 className="text-xl font-medium text-app-primary mb-4">Explore</h2>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/library"
              className="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-4 py-2.5 text-app-primary hover:bg-app-surface-hover transition-colors"
            >
              <Library className="size-4" aria-hidden />
              Library
            </Link>
            <Link
              href="/playlists/new"
              className="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-4 py-2.5 text-app-primary hover:bg-app-surface-hover transition-colors"
            >
              <ListMusic className="size-4" aria-hidden />
              New Playlist
            </Link>
            <Link
              href="/device-sync"
              className="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-surface px-4 py-2.5 text-app-primary hover:bg-app-surface-hover transition-colors"
            >
              <Smartphone className="size-4" aria-hidden />
              Device Sync
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
