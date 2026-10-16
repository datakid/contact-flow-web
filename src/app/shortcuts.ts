import { useEffect } from "react";
import { toggleStar, undoLast } from "./actions";
import { db } from "./db";
import { useApp } from "./store";
import type { Selection } from "../core/db/library";
import { getListController } from "../features/library/controller";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

async function moveFocus(delta: number, extend: boolean): Promise<void> {
  const controller = getListController();
  const state = useApp.getState();
  if (!controller) return;
  const total = controller.total();
  if (total === 0) return;
  const current = state.focusedId ? controller.indexOfId(state.focusedId) : -1;
  const next = Math.min(total - 1, Math.max(0, current < 0 ? (delta > 0 ? 0 : total - 1) : current + delta));
  await controller.ensureRange(Math.min(current < 0 ? next : current, next), Math.max(current < 0 ? next : current, next));
  const row = controller.getRow(next);
  if (!row) return;
  if (extend) {
    const ids = new Set(state.selected);
    const from = controller.getRow(current < 0 ? next : current);
    if (from) ids.add(from.id);
    ids.add(row.id);
    state.setSelected(ids, state.anchorIndex ?? (current < 0 ? next : current));
  }
  useApp.setState(extend ? { focusedId: row.id } : { focusedId: row.id, anchorIndex: next });
  controller.scrollToIndex(next);
}

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const state = useApp.getState();
      const mod = event.ctrlKey || event.metaKey;
      const typing = isTyping(event.target);
      const key = event.key;

      if (mod && key.toLowerCase() === "k") {
        event.preventDefault();
        state.openDialog(state.dialog === "palette" ? null : "palette");
        return;
      }
      if (state.dialog) return;
      if (mod && key.toLowerCase() === "i") {
        event.preventDefault();
        state.openDialog("import");
        return;
      }
      if (mod && event.shiftKey && key.toLowerCase() === "e") {
        event.preventDefault();
        state.openDialog("export", { kind: "filter", filter: state.filter, search: state.search, exclude: [] });
        return;
      }
      if (mod && key.toLowerCase() === "b") {
        event.preventDefault();
        state.toggleSidebar();
        return;
      }
      if (mod && (key === "1" || key === "2")) {
        event.preventDefault();
        state.setView(key === "1" ? "list" : "table");
        return;
      }
      if (typing) return;
      if (mod && key.toLowerCase() === "z") {
        event.preventDefault();
        void undoLast();
        return;
      }
      if (mod && key.toLowerCase() === "a") {
        event.preventDefault();
        state.selectAllMatching();
        return;
      }
      if (mod) return;
      switch (key) {
        case "/":
          event.preventDefault();
          window.dispatchEvent(new Event("cf:focus-search"));
          break;
        case "?":
          event.preventDefault();
          state.openDialog("shortcuts");
          break;
        case "n":
        case "N":
          event.preventDefault();
          state.openDialog("create");
          break;
        case "e":
        case "E":
          if (state.focusedId) {
            event.preventDefault();
            useApp.setState({ editingId: state.focusedId });
          }
          break;
        case "s":
        case "S":
          if (state.focusedId) {
            event.preventDefault();
            void db.getContact(state.focusedId).then((c) => c && toggleStar(c));
          }
          break;
        case "Delete":
        case "Backspace": {
          const sel = state.selected.size > 0 || state.allMatching ? state.currentSelection() : state.focusedId ? ({ kind: "ids", ids: [state.focusedId] } satisfies Selection) : null;
          if (sel) {
            event.preventDefault();
            state.openDialog("confirmDelete", sel);
          }
          break;
        }
        case "ArrowDown":
        case "ArrowUp":
          event.preventDefault();
          void moveFocus(key === "ArrowDown" ? 1 : -1, event.shiftKey);
          break;
        case "Escape":
          if (state.selected.size > 0 || state.allMatching) state.clearSelection();
          else if (state.mobileDetailOpen) state.setMobileDetail(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
}

