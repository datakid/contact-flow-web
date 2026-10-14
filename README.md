# Contact Flow 3.0

Desktop-class contact manager that runs entirely in the browser. Everything is stored locally in SQLite (WASM) on the Origin Private File System. Nothing is uploaded.

## Develop

```
npm install --legacy-peer-deps
npm run dev
npm test
npm run build
npm run fixtures
npm run test:e2e
```

`npm run fixtures` writes sample CSV, TSV, Excel, vCard, JSON and text files, including a misnamed Excel file and a windows-1256 Arabic CSV, to `tests/fixtures`. `npx tsx scripts/bench-search.ts 1000000` seeds a library and times search.

## Layout

- `src/workers/db.worker.ts` owns SQLite. Nothing else touches the database.
- `src/workers/import.worker.ts` sniffs, decodes, parses and maps files and streams batches to the database worker over a MessageChannel.
- `src/workers/export.worker.ts` pages contacts out of the database worker and serializes them.
- `src/core` holds text folding, phonetics, phone parsing, fuzzy matching, format readers, batch operations and the database layer.
- `src/features` holds the interface, one folder per area.
- `vendor/xlsx_full_min.cjs` is the vendored SheetJS build.
- `legacy` is the previous app, kept for reference.
