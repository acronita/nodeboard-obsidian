import { Notice, TAbstractFile, TFile } from "obsidian";
import type MaguilanotePlugin from "./main";
import { parseBoard } from "./types";
import { boardFolder, hideInFileExplorerCss, linkedBoardPaths, nestedBoardPaths } from "./nested-board-refs";

/** how long a board stays hidden without a card pointing to it: a new board
 * until its parent saves the card (about 2 s), a removed one until it goes to
 * the trash, so cut/paste and undo can bring its card back */
const PENDING_MS = 5000;

/**
 * Keeps track of which boards are nested in another board (settings
 * "Hide nested boards in the file explorer" and "Move deleted nested boards to
 * trash"). Every .board file is read once on startup and again whenever it is
 * created, changed or renamed.
 */
export class NestedBoards {
  /** board path -> every board path its cards point to */
  private links = new Map<string, string[]>();
  /** boards hidden besides the nested ones: just created by "New board" (card not
   * saved yet) or removed and waiting for the trash */
  private extraHidden = new Set<string>();
  /** adopted stylesheet with the hide rules (plugins may not add <style> elements) */
  private sheet: CSSStyleSheet | null = null;

  constructor(private plugin: MaguilanotePlugin) {}

  start() {
    const { app } = this.plugin;
    app.workspace.onLayoutReady(async () => {
      for (const file of app.vault.getFiles()) await this.scan(file);
      this.render();
      const refresh = async (file: TAbstractFile) => {
        if (await this.scan(file)) this.render();
      };
      this.plugin.registerEvent(app.vault.on("create", (file) => void refresh(file)));
      this.plugin.registerEvent(app.vault.on("modify", (file) => void refresh(file)));
      this.plugin.registerEvent(app.vault.on("delete", (file) => {
        if (this.links.delete(file.path)) this.render();
      }));
      this.plugin.registerEvent(app.vault.on("rename", (file, oldPath) => {
        this.links.delete(oldPath);
        void refresh(file);
      }));
    });
    this.plugin.register(() => this.detachSheet());
  }

  /** "New board" creates the file before the card is saved in its parent: keep it
   * hidden from the start instead of letting it flash in the file explorer. */
  expectNested(path: string) {
    this.extraHidden.add(path);
    this.render();
    window.setTimeout(() => {
      this.extraHidden.delete(path);
      this.render();
    }, PENDING_MS);
  }

  /** re-apply after a settings change */
  render() {
    const hide = this.plugin.settings.hideNestedBoards;
    const nested = [...this.links.keys()].flatMap((p) => this.nestedIn(p));
    const css = hide ? hideInFileExplorerCss([...new Set([...nested, ...this.extraHidden])]) : "";
    if (!css) {
      this.detachSheet();
      return;
    }
    if (!this.sheet) {
      // the file explorer lives in the main window
      const doc = this.plugin.app.workspace.containerEl.doc;
      this.sheet = new CSSStyleSheet();
      doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, this.sheet];
    }
    this.sheet.replaceSync(css);
  }

  private detachSheet() {
    if (!this.sheet) return;
    const doc = this.plugin.app.workspace.containerEl.doc;
    doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== this.sheet);
    this.sheet = null;
  }

  private nestedIn(boardPath: string): string[] {
    const folder = boardFolder(boardPath);
    return (this.links.get(boardPath) ?? []).filter((p) => boardFolder(p) === folder);
  }

  /** Reads one board; false for files that aren't boards. A board that doesn't
   * parse (e.g. half-written) keeps its last known links. */
  private async scan(file: TAbstractFile): Promise<boolean> {
    if (!(file instanceof TFile) || file.extension !== "board") return false;
    const raw = await this.plugin.app.vault.read(file);
    try {
      JSON.parse(raw);
    } catch {
      return true;
    }
    const before = this.nestedIn(file.path);
    const data = parseBoard(raw);
    this.links.set(file.path, linkedBoardPaths(file.path, data));
    const after = nestedBoardPaths(file.path, data);
    if (this.plugin.settings.trashRemovedNestedBoards) {
      for (const path of before) if (!after.includes(path)) this.trashLater(path);
    }
    return true;
  }

  private trashLater(path: string) {
    this.extraHidden.add(path);
    window.setTimeout(() => void (async () => {
      const stillLinked = [...this.links.values()].some((paths) => paths.includes(path));
      const file = this.plugin.app.vault.getAbstractFileByPath(path);
      if (!stillLinked && file instanceof TFile) {
        await this.plugin.app.fileManager.trashFile(file); // follows the user's "Deleted files" preference
        new Notice(`Moved nested board "${file.basename}" to the trash`);
      }
      this.extraHidden.delete(path);
      this.render();
    })(), PENDING_MS);
  }
}
