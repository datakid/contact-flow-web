import * as Comlink from "comlink";
import type { DbApi } from "../core/db/api";
import type { ExportWorkerApi } from "../workers/export.worker";
import type { ImportWorkerApi } from "../workers/import.worker";

const dbWorker = new Worker(new URL("../workers/db.worker.ts", import.meta.url), { type: "module" });

export const db = Comlink.wrap<DbApi>(dbWorker);

let requestSeq = 0;

export function nextRequestId(): number {
  requestSeq += 1;
  return requestSeq;
}

export interface WorkerHandle<T> {
  api: Comlink.Remote<T>;
  terminate: () => void;
}

export async function spawnImportWorker(): Promise<WorkerHandle<ImportWorkerApi>> {
  const worker = new Worker(new URL("../workers/import.worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<ImportWorkerApi>(worker);
  const channel = new MessageChannel();
  await db.attachImportPort(Comlink.transfer(channel.port1, [channel.port1]));
  await api.attachDbPort(Comlink.transfer(channel.port2, [channel.port2]));
  return { api, terminate: () => worker.terminate() };
}

export async function spawnExportWorker(): Promise<WorkerHandle<ExportWorkerApi>> {
  const worker = new Worker(new URL("../workers/export.worker.ts", import.meta.url), { type: "module" });
  const api = Comlink.wrap<ExportWorkerApi>(worker);
  const channel = new MessageChannel();
  Comlink.expose({ readPage: (s: Parameters<DbApi["readPage"]>[0], a: number, l: number) => db.readPage(s, a, l) }, channel.port1);
  await api.attachDbPort(Comlink.transfer(channel.port2, [channel.port2]));
  return { api, terminate: () => worker.terminate() };
}
