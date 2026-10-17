import { Menu } from "obsidian";
import type { BoardView } from "./board-view";
import type { Item } from "./types";
import { CARD_TOOLS, MEDIA_TOOLS, type CardTool } from "./board-item-crud";

export function onContextMenu(view: BoardView, e: MouseEvent) {
  if (view.drawMode) { e.preventDefault(); return; }
  const target = e.target as HTMLElement;
  // edges use the contextual toolbar (via selection) instead of a right-click menu
  const edgeEl = target.closest<HTMLElement>(".mgn-edge-hit, .mgn-edge-label");
  if (edgeEl?.dataset.id) {
    e.preventDefault();
    return;
  }

  const cardEl = target.closest<HTMLElement>(".mgn-card");
  if (!cardEl?.dataset.id) {
    e.preventDefault();
    showAddMenu(view, e.clientX, e.clientY);
    return;
  }
  e.preventDefault();
  const it = view.item(cardEl.dataset.id);
  if (!it) return;
  if (!view.selection.has(it.id)) {
    view.selection = new Set([it.id]);
    view.refreshSelectionClasses();
  }
  showCardMenu(view, it, e.clientX, e.clientY);
}

/** empty-canvas right-click: the toolbar's card tools, created at the click point */
function showAddMenu(view: BoardView, x: number, y: number) {
  const w = view.screenToWorld(x, y);
  const menu = new Menu();
  const add = (t: CardTool) =>
    menu.addItem((i) => i.setTitle(t.label).setIcon(t.icon).onClick(() => view.createFromTool(t.key, w.x, w.y)));
  CARD_TOOLS.forEach(add);
  menu.addSeparator();
  MEDIA_TOOLS.forEach(add);
  menu.showAtPosition({ x, y });
}

export function showCardMenu(view: BoardView, it: Item, x: number, y: number) {
  if (!view.selection.has(it.id)) {
    view.selection = new Set([it.id]);
    view.refreshSelectionClasses();
  }
  const menu = new Menu();
  menu.addItem((i) => i.setTitle(it.locked ? "Unlock" : "Lock on board").setIcon(it.locked ? "unlock" : "lock").onClick(() => {
    it.locked = !it.locked;
    view.commit();
  }));
  menu.addItem((i) => i.setTitle("Duplicate (Ctrl+D)").setIcon("copy").onClick(() => view.duplicateSelection()));
  menu.addItem((i) => i.setTitle("Bring to front").setIcon("arrow-up").onClick(() => {
    const idx = view.board.items.findIndex((x) => x.id === it.id);
    const [moved] = view.board.items.splice(idx, 1);
    view.board.items.push(moved);
    view.commit();
  }));
  menu.addItem((i) => i.setTitle("Send to back").setIcon("arrow-down").onClick(() => {
    const idx = view.board.items.findIndex((x) => x.id === it.id);
    const [moved] = view.board.items.splice(idx, 1);
    view.board.items.unshift(moved);
    view.commit();
  }));
  menu.addSeparator();
  menu.addItem((i) => i.setTitle("Delete").setIcon("trash").onClick(() => view.deleteSelection()));
  menu.showAtPosition({ x, y });
}
