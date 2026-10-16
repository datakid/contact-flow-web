import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { db, nextRequestId } from "../../app/db";
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
  matchTotal: number;
  loading: boolean;
  searching: boolean;
  letters: LetterEntry[];
  getRow: (index: number) => ContactRow | undefined;
  ensure: (index: number) => void;
  ensureRange: (from: number, to: number) => Promise<void>;
  indexOfId: (id: string) => number;
  generation: number;
}

interface ListSnapshot {
  total: number;
  matchTotal: number;
  letters: LetterEntry[];
  searching: boolean;
  loading: boolean;
  generation: number;
}

const MAX_REFRESH_PAGES = 10;

export function useLibraryList(): LibraryList {
  const filter = useApp((s) => s.filter);
  const sort = useApp((s) => s.sort);
  const search = useApp((s) => s.search);
  const version = useApp((s) => s.version);
  const debounced = useDebounced(search, 120);
  const [snapshot, setSnapshot] = useState<ListSnapshot>({ total: 0, matchTotal: 0, letters: [], searching: false, loading: true, generation: 0 });
  const pagesRef = useRef(new Map<number, ContactRow[]>());
  const pendingRef = useRef(new Set<number>());
  const requestRef = useRef(0);
  const searchingRef = useRef(false);
  const keyRef = useRef("");
  const lastPageRef = useRef(0);

  const key = useMemo(() => JSON.stringify([filter, sort, debounced]), [filter, sort, debounced]);
  const searching = debounced.trim() !== "";

  useEffect(() => {
    const requestId = nextRequestId();
    requestRef.current = requestId;
    const changedQuery = keyRef.current !== key;
    keyRef.current = key;
    searchingRef.current = searching;
    pendingRef.current.clear();
    if (changedQuery) setSnapshot((s) => ({ ...s, loading: true }));
    void (async () => {
      const needLetters = !searching && (sort === "nameAsc" || sort === "nameDesc");
      const [result, offsets] = await Promise.all([
        db.list({ filter, sort, search: debounced, offset: 0, limit: searching ? 500 : PAGE_SIZE, channel: "library", requestId }),
        needLetters ? db.letterOffsets(filter, sort) : Promise.resolve([] as LetterEntry[])
      ]);
      if (result.cancelled || requestRef.current !== requestId) return;
      const pages = new Map<number, ContactRow[]>();
      if (searching) {
        for (let i = 0; i < result.rows.length; i += PAGE_SIZE) pages.set(i / PAGE_SIZE, result.rows.slice(i, i + PAGE_SIZE));
      } else {
        pages.set(0, result.rows);
        if (!changedQuery) {
          const keep = [...pagesRef.current.keys()]
            .filter((page) => page !== 0 && page * PAGE_SIZE < result.total)
            .sort((a, b) => Math.abs(a - lastPageRef.current) - Math.abs(b - lastPageRef.current))
            .slice(0, MAX_REFRESH_PAGES);
          const fetched = await Promise.all(keep.map((page) => db.list({ filter, sort, search: "", offset: page * PAGE_SIZE, limit: PAGE_SIZE, channel: "aux", requestId: nextRequestId() })));
          if (requestRef.current !== requestId) return;
          keep.forEach((page, i) => {
            const rows = fetched[i]?.rows;
            if (rows) pages.set(page, rows);
          });
        }
      }
      pagesRef.current = pages;
      setSnapshot((s) => ({ total: searching ? result.rows.length : result.total, matchTotal: result.total, letters: offsets, searching, loading: false, generation: s.generation + 1 }));
    })();
  }, [key, version, filter, sort, debounced, searching]);

  const loadPage = useCallback(
    async (page: number): Promise<void> => {
      lastPageRef.current = page;
      if (searchingRef.current || pagesRef.current.has(page) || pendingRef.current.has(page)) return;
      pendingRef.current.add(page);
      const requestId = requestRef.current;
      try {
        const result = await db.list({ filter, sort, search: "", offset: page * PAGE_SIZE, limit: PAGE_SIZE, channel: "aux", requestId: nextRequestId() });
        if (requestRef.current === requestId && !result.cancelled) {
          pagesRef.current.set(page, result.rows);
          setSnapshot((s) => ({ ...s, generation: s.generation + 1 }));
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

  return { total: snapshot.total, matchTotal: snapshot.matchTotal, loading: snapshot.loading, searching: snapshot.searching, letters: snapshot.letters, getRow, ensure, ensureRange, indexOfId, generation: snapshot.generation };
}
