import type { ContactRow } from "../../core/types";

export interface ListController {
  getRow: (index: number) => ContactRow | undefined;
  total: () => number;
  ensureRange: (from: number, to: number) => Promise<void>;
  scrollToIndex: (index: number) => void;
  indexOfId: (id: string) => number;
}

let current: ListController | null = null;

export function setListController(controller: ListController | null): void {
  current = controller;
}

export function getListController(): ListController | null {
  return current;
}
