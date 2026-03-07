# TTIS — Tasks Tracking & Invoicing System

A pure-frontend browser dashboard for Landmark (LMP) to track task progress, invoicing, and invoice readiness — reading directly from an uploaded Excel file. No server, no installation required.

---

## Quick Start

1. Open `index.html` in Chrome or Edge
2. Drag & drop your `.xlsm` / `.xlsx` tracking file onto the upload screen
3. The app reads the **"Invoicing Track"** sheet (headers on row 4, data from row 5)

---

## Features

| Tab | What it does |
|-----|-------------|
| **Dashboard** | KPI cards + 6 charts: task status, acceptance, region, vendor, PO status, invoice collection progress |
| **Tasks** | Full table — search + 5 filters (status, acceptance, region, vendor, stream), sortable columns, 100 rows/page |
| **Invoicing** | Financial KPI cards + payment table (1st/2nd receivings, remaining, LMP/Contractor portions) |
| **Invoice Readiness** | Shows FAC/TOC tasks ready to invoice; optional TSR qty check + previous export de-duplication; export to Excel |

---

## Invoice Readiness Workflow

1. Switch to the **Invoice Readiness** tab
2. Optionally load your **TSR file** — checks remaining quantity per line item (OK / EXCEEDS / NOT FOUND)
3. Optionally load a **previous TTIS export** — automatically greys out already-invoiced tasks by ID#
4. Select rows (or leave none selected to export all new items) → **Export to Excel**
5. Next session: load that exported file as "Previous Export" to avoid duplicates

---

## File Structure

```
index.html          ← App shell + upload screen
css/
├── main.css        ← CSS variables, theme, upload screen, header
├── components.css  ← Cards, tables, badges, filters, pagination
└── charts.css      ← Chart grid and region bar styles
js/
├── data.js         ← SheetJS parsing, column mapping, shared helpers
├── dashboard.js    ← Dashboard KPIs + Chart.js charts
├── tasks.js        ← Tasks table (filter / sort / paginate)
├── invoicing.js    ← Invoicing KPIs + payment table
├── readiness.js    ← Invoice Readiness tab (TSR check, de-dup, export)
└── app.js          ← Bootstrap, upload events, tab routing
```

---

## No Installation Needed

All dependencies are loaded from CDN:
- [SheetJS](https://sheetjs.com/) — reads `.xlsm` / `.xlsx` files in the browser
- [Chart.js](https://www.chartjs.org/) — dashboard charts
- Google Fonts — Rajdhani, JetBrains Mono, Inter
