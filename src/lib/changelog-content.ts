import { readFile } from "fs/promises";
import path from "path";

export async function getChangelogContent(): Promise<string> {
  const filePath = path.join(process.cwd(), "CHANGELOG.md");
  return readFile(filePath, "utf8");
}
