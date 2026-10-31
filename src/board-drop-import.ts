import { TFile, normalizePath } from "obsidian";
import type { BoardView } from "./board-view";
import { IMAGE_EXTS, VIDEO_EXTS } from "./types";

export async function onDrop(view: BoardView, e: DragEvent) {
  e.preventDefault();
  const w = view.screenToWorld(e.clientX, e.clientY);

  // drag from the left toolbar creates the element at the drop point
  const toolKey = e.dataTransfer?.getData("mgn-tool");
  if (toolKey) {
    view.createFromTool(toolKey, w.x, w.y);
    return;
  }

  // drag from Obsidian's file explorer (internal drag manager)
  // dragManager is internal (not in the public API), so only rely on the fields we check
  const dm = (view.app as unknown as { dragManager?: { draggable?: { type?: string; file?: unknown; files?: unknown } | null } }).dragManager;
  const draggable = dm?.draggable;
  if (draggable) {
    const files: TFile[] = [];
    if (draggable.type === "file" && draggable.file instanceof TFile) files.push(draggable.file);
    if (draggable.type === "files" && Array.isArray(draggable.files)) {
      for (const f of draggable.files as unknown[]) if (f instanceof TFile) files.push(f);
    }
    if (files.length) {
      let off = 0;
      for (const f of files) {
        view.addVaultFileAt(f, w.x + off, w.y + off);
        off += 30;
      }
      return;
    }
  }

  // files dragged from the OS
  const files = Array.from(e.dataTransfer?.files ?? []);
  if (files.length) {
    let off = 0;
    for (const f of files) {
      await view.importOsFile(f, w.x + off, w.y + off);
      off += 30;
    }
    return;
  }

  const text = e.dataTransfer?.getData("text/plain");
  if (text) {
    // a dropped wiki-style path from Obsidian resolves to a vault file
    const linked = view.app.metadataCache.getFirstLinkpathDest(
      text.replace(/^\[\[|\]\]$/g, "").trim(),
      view.file?.path ?? ""
    );
    if (linked) {
      view.addVaultFileAt(linked, w.x, w.y);
      return;
    }
    if (/^https?:\/\//.test(text.trim())) {
      view.addItem({ type: "link", url: text.trim(), title: text.trim().replace(/^https?:\/\//, "") }, w.x, w.y);
    } else {
      view.addItem({ type: "note", text }, w.x, w.y);
    }
  }
}

export async function onPaste(view: BoardView, e: ClipboardEvent) {
  const target = e.target as HTMLElement;
  if (target.closest("input, textarea, [contenteditable=true]")) return;
  const files = clipboardFiles(e);
  if (files.length) {
    e.preventDefault();
    // a copied image/file is what the user wants now, not the board's own clipboard
    if (view.pendingInternalPaste !== null) window.clearTimeout(view.pendingInternalPaste);
    view.pendingInternalPaste = null;
    const c = view.viewCenter();
    let off = 0;
    for (const f of files) {
      await view.importOsFile(f, c.x + off, c.y + off);
      off += 30;
    }
    return;
  }
  const text = e.clipboardData?.getData("text/plain");
  if (text && !view.plugin.clipboard) {
    e.preventDefault();
    const c = view.viewCenter();
    if (/^https?:\/\/\S+$/.test(text.trim())) {
      view.addItem({ type: "link", url: text.trim(), title: text.trim().replace(/^https?:\/\//, "") }, c.x, c.y);
    } else {
      view.addItem({ type: "note", text }, c.x, c.y);
    }
  }
}

/** files on the clipboard (a screenshot, a copied image or OS file). Images get
 * Obsidian's "Pasted image <timestamp>" name: clipboard images are all "image.png". */
function clipboardFiles(e: ClipboardEvent): File[] {
  const data = e.clipboardData;
  if (!data) return [];
  let files = Array.from(data.files);
  if (!files.length) {
    files = Array.from(data.items)
      .filter((i) => i.kind === "file")
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
  }
  const stamp = window.moment().format("YYYYMMDDHHmmss");
  return files.map((f) => {
    if (!f.type.startsWith("image/") || (f.name && f.name !== "image.png")) return f;
    const ext = f.type.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") || "png";
    return new File([f], `Pasted image ${stamp}.${ext}`, { type: f.type });
  });
}

export async function importOsFile(view: BoardView, f: File, x: number, y: number) {
  if (!f || !f.name) return;
  const buf = await f.arrayBuffer();
  const base = normalizePath(view.plugin.settings.assetsFolder?.trim() || "Nodeboard Assets");
  if (!view.app.vault.getAbstractFileByPath(base)) {
    await view.app.vault.createFolder(base).catch(() => {});
  }
  const safe = f.name.replace(/[\\/:*?"<>|]/g, "-") || "file";
  let path = normalizePath(`${base}/${safe}`);
  let i = 1;
  const dot = safe.lastIndexOf(".");
  const stem = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : "";
  while (view.app.vault.getAbstractFileByPath(path)) {
    path = normalizePath(`${base}/${stem}-${i++}${ext}`);
  }
  const tf = await view.app.vault.createBinary(path, buf);
  const lower = tf.extension.toLowerCase();
  if (IMAGE_EXTS.includes(lower)) {
    view.addItem({ type: "image", path: tf.path, w: 280 }, x, y);
  } else {
    const video = VIDEO_EXTS.includes(lower);
    view.addItem({ type: "file", path: tf.path, w: video ? 420 : 260 }, x, y);
  }
}
