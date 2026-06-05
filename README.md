# Retail Analytics Dashboard

A college MVP — fully functional retail analytics dashboard that imports Kaggle retail CSV data, stores it in PostgreSQL, and generates real KPI cards, charts, and insights.

## Features

- **Upload**: Drag-and-drop CSV/XLSX file upload with auto-detection of header rows (skips title rows like `Retail_Sample_Data`)
- **Label Mapping**: Auto-infer column mappings (TotalPrice→Revenue, InvoiceDate→Date, etc.) with manual override
- **Analysis Dashboard**: Real-time KPIs, monthly bar charts, country donut chart, top products table, and key insights

## Tech Stack

| Layer     | Technology                     |
|-----------|--------------------------------|
| Frontend  | React, TypeScript, Vite, TailwindCSS |
| Backend   | Express.js, TypeScript, tsx    |
| Database  | PostgreSQL                     |
| Parsing   | PapaParse (CSV), read-excel-file (XLSX) |

## Prerequisites

- Node.js ≥ 18
- PostgreSQL running on `localhost:5432`

## Setup

```bash
npm install
```

Copy `.env.example` to `.env` and update `DATABASE_URL`:

```
DATABASE_URL=postgres://postgres:271106@localhost:5432/retail_analytics
PORT=4000
```

Create the database:

```bash
createdb retail_analytics
```

## Run

```bash
npm run dev
```

- Frontend: `http://127.0.0.1:5173` (or next available port)
- API: `http://127.0.0.1:4000`
- Vite proxies `/api` requests to the backend

## API Endpoints

| Method | Path                                | Description              |
|--------|-------------------------------------|--------------------------|
| GET    | `/api/health`                       | Health check             |
| GET    | `/api/imports`                      | List all imports         |
| POST   | `/api/imports`                      | Upload CSV/XLSX          |
| GET    | `/api/imports/:id/mappings`         | Get column mappings      |
| PUT    | `/api/imports/:id/mappings`         | Save column mappings     |
| POST   | `/api/imports/:id/clean`            | Clean data (remove returns, bad prices) |
| GET    | `/api/analytics/kpis?importId=`     | Total Revenue, Orders, Customers, AOV |
| GET    | `/api/analytics/monthly?importId=`  | Monthly revenue/quantity/orders |
| GET    | `/api/analytics/top-products?importId=` | Top products by revenue |
| GET    | `/api/analytics/by-country?importId=` | Revenue by country      |
| GET    | `/api/analytics/insights?importId=` | Best month, top country, best seller |

## Dataset

Uses the [Kaggle Retail Analysis dataset](https://www.kaggle.com/datasets) with 2136 transactions, 12 columns:
InvoiceNo, StockCode, Description, Quantity, InvoiceDate, UnitPrice, CustomerID, Country, TotalPrice, Month, Year, IsReturn

Expected results with the full dataset:
- **Total Revenue**: £207,887.54
- **Total Orders**: 590
- **Total Customers**: 196
- **Average Order Value**: £352.35
- **Best Month**: 2011-11
- **Top Country**: United Kingdom
- **Best Seller**: RED WOOLLY HOTTIE WHITE HEART
