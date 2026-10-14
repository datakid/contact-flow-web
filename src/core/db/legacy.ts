import type { ContactInput } from "../types";

interface LegacyContact {
  id?: string;
  name?: string;
  company?: string;
  note?: string;
  starred?: boolean;
  phones?: unknown[];
  emails?: unknown[];
  aliases?: unknown[];
  groups?: unknown[];
  contact_id?: string;
  created?: number;
  updated?: number;
  createdAt?: number;
  updatedAt?: number;
}

function strings(list: unknown[] | undefined): string[] {
  return (list ?? []).map((item) => (typeof item === "string" ? item : String((item as { value?: unknown })?.value ?? ""))).map((s) => s.trim()).filter(Boolean);
}

export function legacyToInput(c: LegacyContact): ContactInput {
  const created = c.createdAt ?? c.created;
  const updated = c.updatedAt ?? c.updated;
  return {
    id: c.id ? String(c.id) : undefined,
    name: String(c.name ?? ""),
    company: String(c.company ?? ""),
    note: String(c.note ?? ""),
    starred: Boolean(c.starred),
    phones: strings(c.phones).map((value) => ({ value, label: "mobile" })),
    emails: strings(c.emails).map((value) => ({ value, label: "work" })),
    aliases: strings(c.aliases),
    groups: strings(c.groups),
    createdAt: typeof created === "number" ? created : undefined,
    updatedAt: typeof updated === "number" ? updated : undefined
  };
}

export function legacyDatabaseExists(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(false);
      return;
    }
    const request = indexedDB.open("contact-flow");
    let created = false;
    request.onupgradeneeded = () => {
      created = true;
    };
    request.onsuccess = () => {
      const db = request.result;
      const has = !created && db.objectStoreNames.contains("contacts");
      db.close();
      if (created) indexedDB.deleteDatabase("contact-flow");
      resolve(has);
    };
    request.onerror = () => resolve(false);
  });
}

export function readLegacyBatches(batchSize: number, onBatch: (batch: ContactInput[]) => void): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("contact-flow");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("contacts", "readonly");
      const cursorRequest = tx.objectStore("contacts").openCursor();
      let batch: ContactInput[] = [];
      let total = 0;
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor) {
          batch.push(legacyToInput(cursor.value as LegacyContact));
          if (batch.length >= batchSize) {
            total += batch.length;
            onBatch(batch);
            batch = [];
          }
          cursor.continue();
          return;
        }
        if (batch.length) {
          total += batch.length;
          onBatch(batch);
        }
        db.close();
        resolve(total);
      };
      cursorRequest.onerror = () => {
        db.close();
        reject(cursorRequest.error);
      };
    };
  });
}
