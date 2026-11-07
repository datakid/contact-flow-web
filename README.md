# Contact Flow 3.0

Contact manager that runs entirely in the browser. It imports, searches, edits and exports contacts, and stores them in SQLite (WASM) on the Origin Private File System. Nothing is uploaded.

## What it does

- Shows contacts in a list or a table, with a detail pane for inline editing and a dialog to create a contact.
- Imports through a wizard with source, column mapping, preview, review and finish steps. It sniffs and decodes CSV, TSV, Excel, vCard, JSON and text files, including windows-1256 Arabic CSV and Excel files with the wrong extension.
- Exports to CSV, Excel, vCard, JSON or text, with a preview.
- Runs batch operations: find and replace, prefix or suffix, numbered rename patterns, change case, swap first and last names, clean up names, aliases (add, keep the current name, swap, clear), add or remove a country code, change a prefix, reformat numbers, remove repeated numbers, set a company and add a note.
- Finds duplicates, and keeps a history that supports undo.
- Searches with Arabic letter folding, phonetic matching (Double Metaphone), transliteration, Chinese pinyin and fuzzy matching. Phone numbers are parsed with libphonenumber-js.
- Queues messages for contacts one by one, with templates that fill in name, alias and company, for WhatsApp, Signal, SMS or a call.
- Has a command palette, a shortcuts dialog, settings with a default country, an in-app self-test, right-to-left and mobile layouts, and accessibility checks in the end-to-end tests.

## What it does not do

- It does not sync or back up. The contacts live in this browser's Origin Private File System, and clearing site data removes them.
- It sends nothing itself. A message link opens WhatsApp, Signal, the SMS app or the dialler, and you send from there.
- It does not read a phone's address book. Contacts come in through files.

## Network and install

No network calls. Files stay in the tab. The fonts are bundled. Installable (PWA); works offline after the first load.

## Built with

React 18, TypeScript, Vite and Tailwind CSS 4. SQLite WASM (`@sqlite.org/sqlite-wasm`) stores the data, and Comlink connects the UI to the database, import and export workers. Also glide-data-grid, Radix UI, zustand, TanStack Virtual, libphonenumber-js, double-metaphone, pinyin-pro, jschardet, PapaParse, a vendored SheetJS build and `@streamparser/json`. Fonts are IBM Plex Sans Arabic, Instrument Serif and Manrope through Fontsource. Tests use Vitest, Playwright and axe-core.

## Run locally

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
