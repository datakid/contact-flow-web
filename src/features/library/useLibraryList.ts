import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../app/db";
import { useDebounced } from "../../app/hooks";
import { useApp } from "../../app/store";
import type { ContactRow } from "../../core/types";

export const PAGE_SIZE = 200;

export interface LetterEntry {
  letter: string;
  offset: number;
  count: number;
}

export interface LibraryList {
  total: number;
  loading: boolean;
  searching: boolean;
  letters: LetterEntry[];
  getRow: (index: number) => ContactRow | undefined;
  ensure: (index: number) => void;
  ensureRange: (from: number, to: number) => Promise<void>;
  indexOfId: (id: string) => number;
  generation: number;
}

export function useLibraryList(): LibraryList {
  const filter = useApp((s) => s.filter);
  const sort = useApp((s) => s.sort);
  const search = useApp((s) => s.search);
  const version = useApp((s) => s.version);
  const debounced = useDebounced(search, 120);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [letters, setLetters] = useState<LetterEntry[]>([]);
  const [generation, setGeneration] = useState(0);
  const pagesRef = useRef(new Map<number, ContactRow[]>());
  const pendingRef = useRef(new Set<number>());
  const requestRef = useRef(0);
  const searchingRef = useRef(false);
  const keyRef = useRef("");

  const key = useMemo(() => JSON.stringify([filter, sort, debounced]), [filter, sort, debounced]);
  const searching = debounced.trim() !== "";

  useEffect(() => {
    const requestId = ++requestRef.current;
    const changedQuery = keyRef.current !== key;
    keyRef.current = key;
    searchingRef.current = searching;
    pendingRef.current.clear();
    if (changedQuery) setLoading(true);
    void (async () => {
      const result = await db.list({ filter, sort, search: debounced, offset: 0, limit: searching ? 500 : PAGE_SIZE, requestId });
      if (result.cancelled || requestRef.current !== requestId) return;
      const pages = new Map<number, ContactRow[]>();
      if (searching) {
        for (let i = 0; i < result.rows.length; i += PAGE_SIZE) pages.set(i / PAGE_SIZE, result.rows.slice(i, i + PAGE_SIZE));
      } else pages.set(0, result.rows);
      pagesRef.current = pages;
      setTotal(searching ? result.rows.length : result.total);
      setLoading(false);
      setGeneration((g) => g + 1);
      if (!searching && (sort === "nameAsc" || sort === "nameDesc")) {
        const offsets = await db.letterOffsets(filter, sort);
        if (requestRef.current === requestId) setLetters(offsets);
      } else setLetters([]);
    })();
  }, [key, version, filter, sort, debounced, searching]);

  const loadPage = useCallback(
    async (page: number): Promise<void> => {
      if (searchingRef.current || pagesRef.current.has(page) || pendingRef.current.has(page)) return;
      pendingRef.current.add(page);
      const requestId = requestRef.current;
      try {
        const result = await db.list({ filter, sort, search: "", offset: page * PAGE_SIZE, limit: PAGE_SIZE, requestId: requestId + 0.001 * page });
        if (requestRef.current === requestId && !result.cancelled) {
          pagesRef.current.set(page, result.rows);
          setGeneration((g) => g + 1);
        }
      } finally {
        pendingRef.current.delete(page);
      }
    },
    [filter, sort]
  );

  const getRow = useCallback((index: number): ContactRow | undefined => pagesRef.current.get(Math.floor(index / PAGE_SIZE))?.[index % PAGE_SIZE], []);
  const ensure = useCallback((index: number) => void loadPage(Math.floor(index / PAGE_SIZE)), [loadPage]);
  const ensureRange = useCallback(
    async (from: number, to: number) => {
      const first = Math.floor(Math.min(from, to) / PAGE_SIZE);
      const last = Math.floor(Math.max(from, to) / PAGE_SIZE);
      const jobs: Array<Promise<void>> = [];
      for (let p = first; p <= last; p++) jobs.push(loadPage(p));
      await Promise.all(jobs);
    },
    [loadPage]
  );
  const indexOfId = useCallback((id: string): number => {
    for (const [page, rows] of pagesRef.current) {
      const at = rows.findIndex((r) => r.id === id);
      if (at >= 0) return page * PAGE_SIZE + at;
    }
    return -1;
  }, []);

  return { total, loading, searching, letters, getRow, ensure, ensureRange, indexOfId, generation };
}
