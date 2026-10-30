import type { BoardData } from "./types";

export function boardFolder(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

/** Every board a board's cards point to, in any folder (itself excluded). */
export function linkedBoardPaths(boardPath: string, data: BoardData): string[] {
  return data.items
    .filter((it) => it.type === "board" && typeof it.path === "string" && it.path !== boardPath)
    .map((it) => it.path as string);
}

/** Boards nested in a board: its board cards that point into its own folder,
 * which is where "New board" creates them. Boards linked from another folder
 * are references, not nested boards. */
export function nestedBoardPaths(boardPath: string, data: BoardData): string[] {
  const folder = boardFolder(boardPath);
  return linkedBoardPaths(boardPath, data).filter((p) => boardFolder(p) === folder);
}

/** CSS that hides these files in Obsidian's file explorer ("" when there are none). */
export function hideInFileExplorerCss(paths: string[]): string {
  if (!paths.length) return "";
  const selectors = paths.map(
    (p) => `.nav-files-container .nav-file:has(> .nav-file-title[data-path="${p.replace(/["\\]/g, "\\$&")}"])`
  );
  return `${selectors.join(",\n")} {\n  display: none;\n}`;
}
