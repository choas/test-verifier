export type DiffLineType = "added" | "removed" | "context";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber: number | null;
  newLineNumber: number | null;
}

export interface DiffHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  hunks: DiffHunk[];
}

const DIFF_HEADER_QUOTED_RE = /^diff --git "a\/(.+)" "b\/(.+)"$/;
const DIFF_HEADER_RE = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER_RE = /^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@(.*)$/;

function assertNoDotDot(filePath: string): void {
  const segments = filePath.replace(/\\/g, "/").split("/");
  for (const seg of segments) {
    if (seg === "..") {
      throw new Error(`Path traversal (..) in diff path: ${filePath}`);
    }
  }
  if (filePath.startsWith("/") || filePath.startsWith("\\")) {
    throw new Error(`Absolute path in diff not allowed: ${filePath}`);
  }
}

export function parseDiff(diffStr: string): FileDiff[] {
  if (!diffStr.trim()) return [];

  const lines = diffStr.split("\n");
  const files: FileDiff[] = [];
  let currentFile: FileDiff | null = null;
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const diffMatch = line.match(DIFF_HEADER_QUOTED_RE) ?? line.match(DIFF_HEADER_RE);
    if (diffMatch) {
      const oldPath = diffMatch[1];
      const newPath = diffMatch[2];
      assertNoDotDot(oldPath);
      assertNoDotDot(newPath);
      currentFile = { oldPath, newPath, hunks: [] };
      files.push(currentFile);
      currentHunk = null;
      continue;
    }

    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("index ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("similarity index") ||
      line.startsWith("rename from") ||
      line.startsWith("rename to") ||
      line.startsWith("Binary files")
    ) {
      continue;
    }

    const hunkMatch = line.match(HUNK_HEADER_RE);
    if (hunkMatch && currentFile) {
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: hunkMatch[2] !== undefined ? parseInt(hunkMatch[2], 10) : 1,
        newStart: parseInt(hunkMatch[3], 10),
        newCount: hunkMatch[4] !== undefined ? parseInt(hunkMatch[4], 10) : 1,
        header: hunkMatch[5].trim(),
        lines: [],
      };
      currentFile.hunks.push(currentHunk);
      oldLine = currentHunk.oldStart;
      newLine = currentHunk.newStart;
      continue;
    }

    if (!currentHunk) continue;

    if (line.startsWith("+")) {
      currentHunk.lines.push({
        type: "added",
        content: line.slice(1),
        oldLineNumber: null,
        newLineNumber: newLine,
      });
      newLine++;
    } else if (line.startsWith("-")) {
      currentHunk.lines.push({
        type: "removed",
        content: line.slice(1),
        oldLineNumber: oldLine,
        newLineNumber: null,
      });
      oldLine++;
    } else if (line.startsWith(" ") || line === "") {
      currentHunk.lines.push({
        type: "context",
        content: line.startsWith(" ") ? line.slice(1) : line,
        oldLineNumber: oldLine,
        newLineNumber: newLine,
      });
      oldLine++;
      newLine++;
    } else if (line.startsWith("\\")) {
      // "\ No newline at end of file" — skip
      continue;
    }
  }

  return files;
}
