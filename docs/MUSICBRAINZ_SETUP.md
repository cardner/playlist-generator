# MusicBrainz Database Setup

This guide explains how to set up a local MusicBrainz database for the music discovery feature.

## Overview

The music discovery feature uses a local MusicBrainz PostgreSQL database to find similar tracks that aren't in your library. This allows the app to suggest new music based on your existing collection.

## Prerequisites

- PostgreSQL 12 or later
- At least 50GB of free disk space (for full database)
- A web server or API endpoint to proxy database queries (since the app runs in the browser)

## Option 1: Download Pre-built Database Snapshot

MusicBrainz provides database snapshots that are updated twice weekly.

### Steps

1. **Download the database snapshot**
   - Visit: https://musicbrainz.org/doc/MusicBrainz_Database/Download
   - Download the latest PostgreSQL database dump
   - Choose the "Core" data snapshot (CC0 licensed)

2. **Extract and import**
   ```bash
   # Create database
   createdb musicbrainz

   # Import (this will take several hours)
   pg_restore -d musicbrainz -j 4 musicbrainz_db_*.tar
   ```

3. **Verify installation**
   ```bash
   psql musicbrainz -c "SELECT COUNT(*) FROM recording;"
   ```

## Option 2: Use MusicBrainz API (Alternative)

If you don't want to set up a local database, you can use the MusicBrainz API through a proxy server. However, this requires:
- Rate limiting (1 request per second)
- Internet connection
- API key (for higher rate limits)

## Configuration

### Browser Environment

Since the app runs in the browser, you'll need to configure the database connection through the app's settings:

1. Open the app settings
2. Navigate to "MusicBrainz Configuration"
3. Enter your database connection details:
   - Host: Your server hostname/IP
   - Port: 5432 (default PostgreSQL port)
   - Database: musicbrainz
   - Username: Your PostgreSQL username
   - Password: Your PostgreSQL password

**Note:** The database connection must be proxied through an API endpoint (`/api/musicbrainz/*`) since browsers cannot directly connect to PostgreSQL.

### Server-Side API Endpoint

You'll need to create API endpoints that proxy database queries. Example structure:

```
/api/musicbrainz/similar - Find similar recordings
/api/musicbrainz/recording/:mbid - Get recording details
/api/musicbrainz/search - Search recordings
/api/musicbrainz/genre - Find recordings by genre
/api/musicbrainz/related-artists - Find related artists
/api/musicbrainz/health - Check database connection
/api/musicbrainz/validate-schema - Validate database schema
/api/musicbrainz/stats - Get database statistics
```

## Database Schema

The MusicBrainz database uses a complex schema. Key tables for discovery:

- `recording` - Individual recordings (tracks)
- `artist` - Artists
- `release` - Releases (albums)
- `release_group` - Release groups
- `tag` - User tags (genres, styles)
- `genre` - Official genres
- `l_artist_recording` - Artist-recording relationships
- `l_recording_recording` - Recording-recording relationships

## Query Examples

### Find Similar Recordings

```sql
SELECT DISTINCT r.id, r.gid, r.name
FROM recording r
JOIN l_artist_recording lar ON r.id = lar.entity1
JOIN artist a ON lar.entity0 = a.id
WHERE a.name ILIKE '%Artist Name%'
  AND r.name ILIKE '%Track Title%'
LIMIT 20;
```

### Find by Genre

```sql
SELECT DISTINCT r.id, r.gid, r.name
FROM recording r
JOIN recording_tag rt ON r.id = rt.recording
JOIN tag t ON rt.tag = t.id
WHERE t.name ILIKE '%genre%'
LIMIT 20;
```

## Troubleshooting

### Connection Issues

- Verify PostgreSQL is running: `pg_isready`
- Check firewall settings
- Verify credentials in configuration

### Performance Issues

- Ensure proper indexes exist on `recording.name`, `artist.name`, `tag.name`
- Consider using a read replica for better performance
- Use connection pooling

### Schema Validation

Run the schema validation endpoint to ensure all required tables exist:

```bash
curl http://your-api/api/musicbrainz/validate-schema
```

## Security Considerations

- Never expose PostgreSQL directly to the internet
- Use SSL/TLS for database connections
- Implement rate limiting on API endpoints
- Use connection pooling to prevent connection exhaustion
- Consider using read-only database user

## Alternative: Mock Data for Development

For development without a full database, you can create mock API endpoints that return sample data. See `src/features/discovery/musicbrainz-client.ts` for the expected response format.

## Resources

- [MusicBrainz Database Documentation](https://musicbrainz.org/doc/MusicBrainz_Database)
- [MusicBrainz Schema](https://musicbrainz.org/doc/MusicBrainz_Database/Schema)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)

