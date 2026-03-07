# LMP Task & Invoicing Tracker

A live-synced web dashboard for tracking task progress and invoicing,
reading directly from your Excel tracking sheet.

---

## Quick Start

### 1. Install Python dependencies
```bash
pip install -r requirements.txt
```

### 2. Run the server
```bash
python server.py --file "C:\path\to\Total_Task_Tracking_New_2026.xlsm"
```

> **Windows tip:** You can also copy your Excel file to this folder and rename it `data.xlsm`,
> then just run `python server.py` without any arguments.

### 3. Open the dashboard
The server will print:
```
🚀  Landmark Tracker running → http://localhost:5000
```
Open that URL in your browser.

---

## Features

| Feature | Details |
|---|---|
| **Live Sync** | Server checks for file changes every 15 seconds and auto-updates |
| **Dashboard** | KPI cards + 5 charts (status, acceptance, regions, vendors, PO status) |
| **Task Table** | 5,900+ rows with search + 5 filters (status, acceptance, region, vendor, stream) |
| **Invoicing Panel** | Financial view with 1st/2nd receivings, remaining amounts, LMP/Contractor portions |
| **Sort** | Click any column header to sort asc/desc |
| **Pagination** | 100 rows per page |

---

## How Live Sync Works

1. You edit/save your Excel file as usual in Excel
2. The Python server detects the file modification (checks every 15 seconds)
3. The browser polls the server every 20 seconds for changes
4. When a change is detected, data auto-refreshes without you doing anything
5. You can also click **⟳ Reload** in the header to force an immediate refresh

---

## Changing the Port

```bash
python server.py --file data.xlsm --port 8080
```

---

## File Structure

```
landmark-tracker/
├── server.py        ← Python backend (run this)
├── index.html       ← Dashboard frontend (auto-served by server)
├── requirements.txt ← Python packages
└── README.md
```
