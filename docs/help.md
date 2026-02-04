# Help & Guidance

## About this app
This app generates playlists from your local music library and can optionally discover new tracks related to your collection. You can tune the playlist using genres, mood, activity, tempo, and other controls, then export in multiple formats.

**Remember** you mileage will vary depending on the quality of the metadata in your files. There are some tools in here to try and help like enhancing metadata and the tempo checker, but the better the quality of the metadata on the files as your create the collection the better the quality of the playlists generated.

## How to use
1. **Select or scan a library**: Choose a music folder to scan or import an existing collection.
2. **Choose a mode**: Use the Library tab for playlists from your collection, or Discovery to add new music suggestions.
3. **Configure your playlist**: Fill in genres, mood, activity, tempo, and other options.
4. **Generate**: Submit the form to build the playlist.
5. **Export**: Download the playlist in your preferred format and path style.

## Configurable options explained
### Genres
Pick one or more genres from your collection. Genres drive the overall sound and filtering.

### Length
Choose duration in minutes or track count. This controls playlist size.

### Mood
Add descriptive mood tags (e.g., relaxed, energetic). Helps refine the vibe.

### Activity
Add context tags (e.g., workout, study). Helps select tracks that fit use-cases.

### Tempo
Pick a bucket (slow/medium/fast) and optionally a BPM range. BPM range overrides the bucket.

### Include artists, albums, tracks
Add preferred artists/albums/tracks to prioritize. These are hints, not hard locks.

### Exclude artists
Exclude artists you do not want in the playlist.

### Artist variety (minimum unique artists)
Sets a floor for how many different artists should appear in the playlist.

### Surprise level
Controls how adventurous the selection is. Higher values allow more variety.

### Music discovery
Enables adding new tracks not in your library. Discovery frequency controls how often these appear.

### Agent type and LLM provider
The built-in agent is deterministic and fast. The LLM agent can provide more nuanced selection but may require a provider API key and can be slower.

## Metadata optimization
- **Normalize artists and albums**: Consistent naming improves matching (e.g., avoid duplicate artist spellings).
- **Fill missing tags**: Ensure Artist, Album, Title, and Genre are present for better results.
- **Consistent genres**: Prefer a few well-defined genres over many near-duplicates.
- **Clean track titles**: Remove clutter like file suffixes or non-song annotations.
- **Mood and activity tags**: Run metadata enhancement to infer mood and activity from BPM and genres when tags are missing. Better tags improve playlist matching.

## Collections: import and export
- **Export**: In the collections manager, export a collection to JSON for backup or transfer.
- **Import**: Import a JSON collection file and choose whether to replace or create a new collection when names conflict.
- **Tip**: If you switch machines, export first, then import on the new device.

## Playlist export paths
- **Absolute paths** are safest for most players.
- **Relative to playlist** works best when you store playlists inside the library root.
- **Relative to library root** is useful for portable libraries.
- If you see path warnings, relink your library root so relative paths can be rebuilt.
- When exporting to media servers (e.g., Jellyfin/Plex), set the media library path and network path options to match your server.

## Tips & tricks

### USB device sync write access
- If a device is read-only, unplug and reconnect it, then confirm it mounts as a writable drive.
- Some devices use MTP/PTP; these cannot be written by the browser. Use the companion app or export formats instead.
- Use the **Check write access** button in Device Sync to confirm the mount is writable before syncing.
- macOS: Check Finder Get Info and Disk Utility to confirm the volume is not read-only.
- Windows: Check the drive properties and ensure the device is not write-protected.

## Music discovery tips
- **Start with a tight seed**: Select a few representative genres, artists, or albums.
- **Adjust surprise**: Increase surprise for broader discovery; lower it for closer matches.
- **Use the LLM agent for nuance**: When you want more descriptive matching on mood/activity, try the LLM agent.
- **Discovery frequency**: Use "every other track" for a balanced mix of library and new music.

## FAQ
### How can I optimize metadata for better results?
Make sure Artist, Album, Title, and Genre tags are accurate and consistent. Normalize spelling and avoid duplicates.

### How do I import or export collections?
Use the collection manager to export a collection to JSON, then import it on another device or to restore a backup. If a name conflict exists, you can replace or create a new collection.

### Why do exported playlists have broken paths?
This usually means relative paths are missing or your library moved. Relink the library root and re-export. Absolute paths are the most reliable when unsure.

### What do all the playlist options mean?
Each option influences filtering or ordering: genres and mood guide selection, tempo and activity refine the feel, surprise controls variety, and discovery inserts new tracks at a chosen frequency.

### Which agent should I use for music discovery?
Use the built-in agent for fast, deterministic results. Use the LLM agent for richer semantic matching when you have an API key configured.
