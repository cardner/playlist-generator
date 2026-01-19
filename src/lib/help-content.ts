import { readFile } from "fs/promises";
import path from "path";

export async function getHelpContent(): Promise<string> {
  const filePath = path.join(process.cwd(), "docs", "help.md");
  return readFile(filePath, "utf8");
}
