# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**TTIS — Tasks Tracking & Invoicing System** for Landmark (LMP).
A pure-frontend browser app. No build step, no server, no dependencies to install. Open `index.html` directly in a browser.

## Running the app

Just open `index.html` in a browser. The app will show an upload screen — drag/drop or browse to a `.xlsm`/`.xlsx` file. There is no server required.

> The old `server.py` / `requirements.txt` files are from a previous Flask-based version and are no longer used.

## Architecture

The app is split into 6 JS modules loaded in order via `<script>` tags at the bottom of `index.html`:

```
js/data.js        → SheetJS parsing + all shared formatting helpers
js/dashboard.js   → Renders Dashboard section (KPI cards + Chart.js charts)
js/tasks.js       → Renders Tasks section (table + filters); also defines shared helpers
                    used by invoicing.js and readiness.js:
                    _esc, _renderPagination, _updateSortHeaders,
                    _acceptBadge, _poBadge, _statusBadge
js/invoicing.js   → Renders Invoicing section (financial KPIs + table)
js/readiness.js   → Renders Invoice Readiness section (see below)
js/app.js         → Bootstrap: upload screen events, tab routing, file loading orchestration
```

**Key dependency**: `tasks.js` must load before `invoicing.js` and `readiness.js` because both reuse helpers defined at module level in tasks.js.

**Global state**: All data flows through `_rows` in `app.js`. After parsing, `app.js` calls `buildDashboard(rows)`, `Tasks.init(rows)`, `Invoicing.init(rows)`, `Readiness.init(rows)` — each section owns its own filtered/sorted/paged state internally via IIFEs (`Tasks`, `Invoicing`, `Readiness`) or a plain function (`buildDashboard`).

## Invoice Readiness module (`js/readiness.js`)

**Ready criteria** — a row is "ready to invoice" when all four conditions hold:
1. `acceptance_status` is `FAC` or `TOC`
2. `fac_date` is non-empty
3. `tsr_sub` is empty
4. `po_status` is empty

**Two optional secondary file uploads** (within the Readiness tab, not the main upload screen):

| Upload | Source | What it does |
|--------|--------|--------------|
| TSR File | "Request Form - VF" sheet | Header detected dynamically by scanning col G for "item description"; col G = line item name, col AY (index 50) = remaining qty |
| Previous Export | TTIS-generated `.xlsx` | Scans first 10 rows for an `ID#` column header; extracts all ID values into `_prevIds` Set |

**TSR analysis logic**:
1. Groups non-invoiced ready rows by normalised `line_item` (lowercase)
2. Sums `act_qty × distance_multiplier` per group
3. Distance multipliers: ≤100 km → ×1.0 · ≤400 km → ×1.1 · ≤800 km → ×1.2 · >800 km → ×1.25
4. Line item matching: exact first, then substring in either direction
5. Status per line_item group: `OK` / `EXCEEDS` / `NOT_FOUND`; each row inherits its group's status

**De-duplication**: rows whose `ID#` appears in `_prevIds` are flagged `_alreadyInvoiced = true`; they are greyed out and hidden by the default "New Only" filter.

**Export**: clicking "Export to Excel" writes all 40 original tracking columns (defined in `EXPORT_COLS` array in readiness.js) to a sheet named `TTIS Invoice Export`. The exported file can be re-uploaded as "Previous Export" on the next run. Export scope: selected rows if any checkboxes are ticked; otherwise all visible non-invoiced rows.

## Excel data contract

- Sheet name: `"Invoicing Track"` (constant `SHEET_NAME` in `data.js`)
- Header row: row 4 (0-based index 3, constant `HEADER_ROW`)
- Data starts: row 5 (0-based index 4, constant `DATA_START`)
- Column → internal key mapping is the `COL_MAP` object in `data.js`
- Numeric columns are listed in `NUMERIC_KEYS` (Set) in `data.js`

## Styling

Three CSS files, loaded in order:
- `css/main.css` — CSS variables (the entire color theme lives in `:root`), reset, upload screen, header
- `css/components.css` — cards, table, filter bar, badges, pagination
- `css/charts.css` — chart grid layout, region bars, invoice progress panel

**Theme**: Light mode, navy blue accent. Primary accent color is `--cyan: #1a56db`. To change the theme, edit only the `:root` block in `css/main.css` plus the hardcoded Chart.js colors in `js/dashboard.js` (`_buildDonut` and `_buildBar` functions).

## CDN dependencies (no npm/package.json)

- SheetJS: `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js`
- Chart.js 4.4.0: `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`
- Google Fonts: Rajdhani (headings/values), JetBrains Mono (data/numbers), Inter (body)
