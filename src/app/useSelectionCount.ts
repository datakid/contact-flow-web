import { useEffect, useState } from "react";
import type { Selection } from "../core/db/library";
import { db } from "./db";
import { useApp } from "./store";

export function useSelectionCount(selection: Selection | null): number | null {
  const version = useApp((s) => s.version);
  const key = selection ? JSON.stringify(selection) : "";
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!selection) {
      setCount(null);
      return;
    }
    let current = true;
    setCount(null);
    void db.countSelection(selection).then((n) => {
      if (current) setCount(n);
    });
    return () => {
      current = false;
    };
  }, [key, version]);

  return selection ? count : null;
}
