import { describe, it, expect } from "@jest/globals";
import { parseChangelog } from "@/lib/parse-changelog";

describe("parse-changelog", () => {
  it("parses a single release", () => {
    const md = `
## [1.0.0] - 2026-02-04

### Added
- initial release
`;
    const releases = parseChangelog(md);
    expect(releases).toHaveLength(1);
    expect(releases[0]).toEqual({
      version: "1.0.0",
      date: "2026-02-04",
      body: "### Added\n- initial release",
    });
  });

  it("parses multiple releases in order", () => {
    const md = `
## [1.1.0] - 2026-02-05

### Added
- feature one

## [1.0.0] - 2026-02-04

### Added
- initial release
`;
    const releases = parseChangelog(md);
    expect(releases).toHaveLength(2);
    expect(releases[0].version).toBe("1.1.0");
    expect(releases[0].date).toBe("2026-02-05");
    expect(releases[1].version).toBe("1.0.0");
    expect(releases[1].date).toBe("2026-02-04");
  });

  it("skips [Unreleased] section", () => {
    const md = `
## [Unreleased]

### Added
- not yet released

## [1.0.0] - 2026-02-04

### Added
- initial release
`;
    const releases = parseChangelog(md);
    expect(releases).toHaveLength(1);
    expect(releases[0].version).toBe("1.0.0");
  });

  it("strips ### Other Changes subsection when filterOtherChanges is true (default)", () => {
    const md = `
## [1.0.0] - 2026-02-04

### Added
- user-facing feature

### Other Changes
- Merge pull request #1 from org/branch
- Internal refactor
`;
    const releases = parseChangelog(md);
    expect(releases).toHaveLength(1);
    expect(releases[0].body).not.toContain("Other Changes");
    expect(releases[0].body).not.toContain("Merge pull request");
    expect(releases[0].body).toContain("### Added");
    expect(releases[0].body).toContain("user-facing feature");
  });

  it("keeps ### Other Changes when filterOtherChanges is false", () => {
    const md = `
## [1.0.0] - 2026-02-04

### Added
- user-facing feature

### Other Changes
- Merge pull request #1
`;
    const releases = parseChangelog(md, { filterOtherChanges: false });
    expect(releases).toHaveLength(1);
    expect(releases[0].body).toContain("### Other Changes");
    expect(releases[0].body).toContain("Merge pull request");
  });

  it("keeps content after Other Changes when next ### exists", () => {
    const md = `
## [1.0.0] - 2026-02-04

### Added
- feature

### Other Changes
- merge stuff

### Fixed
- a bug fix
`;
    const releases = parseChangelog(md);
    expect(releases[0].body).toContain("### Fixed");
    expect(releases[0].body).toContain("a bug fix");
    expect(releases[0].body).not.toContain("Other Changes");
    expect(releases[0].body).not.toContain("merge stuff");
  });

  it("returns empty array for empty or header-only markdown", () => {
    expect(parseChangelog("")).toEqual([]);
    expect(
      parseChangelog(`
# Changelog
Nothing here yet.
`)
    ).toEqual([]);
  });
});
