# Contact Flow — Web

*Your contacts, moved beautifully.*

The web version of the Contact Flow Android app (v2.2.0). It runs entirely in the browser. Contacts are kept in IndexedDB on the device and never uploaded. No server, no analytics, no ads.

## Completed features
- **Library**: an A–Z list with serif letter headings and an A–Z rail on desktop. Sort by name or by most recent. Filters: all, starred, no number, no name, and groups. Long-press or tap an avatar to select contacts.
- **Fuzzy search**: tolerates typos (`jonatan` finds Jonathan) and ignores accents (`jose` finds José). Arabic search ignores vowel marks and letter variants. Chinese names can be found by pinyin or initials (`wang`, `lxl`). Search also works across scripts (`mohamed` finds محمد) and finds aliases (shown as "aka"). Partial numbers work, including Arabic-Indic digits and local numbers with a leading 0. Results show tags like "close match", "sounds alike" and "pinyin".
- **Contact detail**: Call, SMS, WhatsApp and Signal links. Copy a number in international format. Share as vCard, star, add to a group, delete.
- **Create and edit**: name, multiple aliases, numbers and emails, company, groups, note, star.
- **Import**: pick several files at once, drag and drop, or paste text. Supported formats are CSV/TSV, vCard 2.1/3.0/4.0 (including quoted-printable), Excel (.xlsx/.xls/.ods), .numbers (when readable), JSON and plain TXT. Columns are detected from headers in EN, AR, ZH, ES and FR, or from the cell contents if there is no header.
- **Review import**: shows new contacts and existing ones separately, and merges duplicates inside the file. An **Update mode** matches rows by contact_id, then number, then exact name. You can choose Fill empty, Overwrite or Add numbers. Conflicts are never guessed.
- **Export**: all contacts, the current search or filter results, or a selection. Formats are CSV, vCard, Excel, Numbers (written as .xlsx), JSON and TXT. Number style can be as saved, international or digits only. Field toggles, including `contact_id` for syncing back. Live preview. Save the file or share it with the Web Share API.
- **Batch edit table**: edit cells inline, with changed cells highlighted. 17 operations, each with a before/after preview: find & replace, prefix/suffix, pattern rename (`{name} {first} {last} {alias} {company} {n}`), change case, swap first/last, clean up names, four alias operations, add or remove country code, change prefix, reformat numbers, remove repeated numbers, set company, add note. Undo is available in the table.
- **Review screen**: shows field-by-field differences before anything is written.
- **History / undo**: every change keeps a backup. You can undo from the snackbar or from Settings → History (last 30 changes, kept 30 days), and download a backup as .vcf.
- **Duplicates**: groups contacts that share a number or a name. You choose which one to keep, and the other names become aliases.
- **Message queue**: personalised messages opened one by one in SMS, WhatsApp or Signal. The queue picks up where it left off after a reload. Group SMS shows a warning first. The site never sends anything itself.
- **Settings**: theme (system/light/dark), English or العربية with full right-to-left layout, about, what's new, open-source licenses.

## Entry points
- `index.html` — the app
- `index.html?sample=1` — loads 30 sample contacts if the library is empty
- `?q=mohamed` — starts with a search · `?lang=ar|en` · `?open=batch|export|dups|settings|import`
- `tests.html` — 26 tests for search and format round-trips

## Layouts
Compact is the single column. Desktop shows the library on one side and the selected contact on the other, with Up and Down to move through contacts and Esc to deselect. Settings → Layout picks Auto (Desktop from 1000px wide), Compact or Desktop.

## Large libraries
The list is windowed, indexing is time-sliced and changes are written to IndexedDB incrementally, so libraries of 200k contacts and more stay responsive. Typo and sound-alike matching only runs on libraries above 20k contacts when exact matching finds fewer than 40 results. Call and SMS actions appear only on phones and tablets.

## Not included on the web
- Reading or writing the phone's real address book (accounts, Nickname field sync, Google/Samsung warnings). The browser cannot access it, so the web version uses its own library.
- Writing Apple's native .numbers format. Exports are .xlsx, which Numbers opens directly.
- Spanish, French and Chinese interface languages.

## Structure
```
index.html, manifest.json, tests.html
css/style.css
js/platform.js IndexedDB store + lazy loader for SheetJS and pinyin-pro
js/i18n.js     EN/AR strings + changelog
js/search.js   text folding, fuzzy index, transliteration, pinyin
js/formats.js  csv · vcard · xlsx · json · txt parse & export
js/sample.js   demo data
js/app.js      state, screens, batch ops, history
images/        app icons
```

## Data
IndexedDB `contact-flow`: stores `contacts` and `history`. localStorage keys: `cf.settings`, `cf.lang`, `cf.queue`. Older `cf.contacts` and `cf.history` data is migrated on first load.
Contact record: `{id, name, aliases[], phones[], emails[], company, note, starred, groups[], createdAt, updatedAt}`.
CDN libraries (SheetJS and pinyin-pro load only when needed): SheetJS 0.18.5, pinyin-pro 3.26, Google Fonts. Icons are an inline SVG sprite from Font Awesome Free 6.4 (Manrope, Instrument Serif, IBM Plex Sans Arabic).

## Next steps
- Add ES/FR/ZH interface strings
- Add an offline service worker so the site works as an installable PWA
- Add optional encrypted export/import of the whole library

## License
Code MIT. Fonts SIL OFL 1.1.
