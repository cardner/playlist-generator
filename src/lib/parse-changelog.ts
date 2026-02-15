export type ChangelogRelease = {
  version: string;
  date: string;
  body: string;
};

const RELEASE_HEADER = /^##\s*\[(.+?)\]\s*-\s*(.+)$/;

/**
 * Strip the "### Other Changes" section and everything under it until the next ### or end.
 */
function stripOtherChangesSection(body: string): string {
  const lines = body.split("\n");
  const result: string[] = [];
  let skip = false;

  for (const line of lines) {
    const isOtherChanges = /^###\s+Other\s+Changes\s*$/i.test(line.trim());
    const isOtherH3 = /^###\s+/.test(line) && !isOtherChanges;

    if (isOtherChanges) {
      skip = true;
      continue;
    }
    if (skip && isOtherH3) {
      skip = false;
    }
    if (!skip) {
      result.push(line);
    }
  }

  return result.join("\n").trim();
}

/**
 * Parse CHANGELOG.md (Keep a Changelog format) into release entries.
 * Skips [Unreleased]. Optionally filters out the "Other Changes" subsection per release.
 */
export function parseChangelog(
  markdown: string,
  options?: { filterOtherChanges?: boolean }
): ChangelogRelease[] {
  const filterOther = options?.filterOtherChanges ?? true;
  const releases: ChangelogRelease[] = [];
  const lines = markdown.split("\n");

  let current: { version: string; date: string; lines: string[] } | null = null;

  for (const line of lines) {
    const match = line.match(RELEASE_HEADER);
    if (match) {
      const version = match[1].trim();
      const date = match[2].trim();

      if (current) {
        let body = current.lines.join("\n").trim();
        if (filterOther) {
          body = stripOtherChangesSection(body);
        }
        releases.push({
          version: current.version,
          date: current.date,
          body,
        });
      }

      if (version.toLowerCase() === "unreleased") {
        current = null;
        continue;
      }

      current = { version, date, lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    let body = current.lines.join("\n").trim();
    if (filterOther) {
      body = stripOtherChangesSection(body);
    }
    releases.push({
      version: current.version,
      date: current.date,
      body,
    });
  }

  return releases;
}
