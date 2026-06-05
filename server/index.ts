import cors from "cors";
import "dotenv/config";
import express from "express";
import multer from "multer";
import Papa from "papaparse";
import { checkDatabase } from "./db";
import {
  bulkInsertTransactions,
  cleanTransactionData,
  ensureRetailTransactionsTable,
  getInsights,
  getKpis,
  getMonthlyPerformance,
  getRevenueByCountry,
  getTopProducts,
  type RawTransactionRow,
} from "./analyticsRepository";
import {
  createImportMetadata,
  ensureImportMetadataTable,
  getImportMetadata,
  listColumnMappings,
  listImportMetadata,
  replaceColumnMappings,
} from "./importRepository";

const app = express();
const acceptedExtensions = new Set(["csv", "xlsx"]);
const acceptedMappingLabels = new Set([
  "Revenue",
  "Date",
  "Quantity",
  "Product",
  "Customer",
  "Country",
  "InvoiceNo",
]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const port = Number(process.env.PORT ?? 4000);

app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

app.get("/api/health", async (_request, response) => {
  const database = await checkDatabase();
  response.json({
    ok: true,
    service: "retail-analytics-api",
    database,
  });
});

// ---------------------------------------------------------------------------
// Imports (metadata)
// ---------------------------------------------------------------------------

app.get("/api/imports", async (_request, response, next) => {
  try {
    const imports = await listImportMetadata();
    response.json({ imports });
  } catch (error) {
    next(error);
  }
});

app.post(
  "/api/imports",
  upload.single("dataset"),
  async (request, response, next) => {
    try {
      const file = request.file;

      if (!file) {
        response.status(400).json({ message: "Dataset file is required." });
        return;
      }

      const fileType =
        file.originalname.split(".").pop()?.toLowerCase() ?? "";
      if (!acceptedExtensions.has(fileType)) {
        response
          .status(400)
          .json({ message: "Only CSV and XLSX files are supported." });
        return;
      }

      const rowCount = Number(request.body.rowCount ?? 0);
      const columnCount = Number(request.body.columnCount ?? 0);
      const columns = parseColumns(request.body.columns);

      if (!Number.isInteger(rowCount) || rowCount < 0) {
        response
          .status(400)
          .json({ message: "rowCount must be a positive integer." });
        return;
      }

      if (!Number.isInteger(columnCount) || columnCount < 0) {
        response
          .status(400)
          .json({ message: "columnCount must be a positive integer." });
        return;
      }

      if (columns.length !== columnCount) {
        response
          .status(400)
          .json({ message: "columns must match columnCount." });
        return;
      }

      // 1. Store metadata
      const importRecord = await createImportMetadata({
        originalFilename: file.originalname,
        fileType,
        mimeType: file.mimetype || "application/octet-stream",
        fileSize: file.size,
        rowCount,
        columnCount,
        columns,
      });

      // 2. Parse CSV and bulk-insert rows into retail_transactions
      if (fileType === "csv") {
        try {
          const csvText = stripBom(file.buffer.toString("utf-8"));
          const transactionRows = parseCsvToTransactions(csvText, columns);

          if (transactionRows.length > 0) {
            const result = await bulkInsertTransactions(
              importRecord.id,
              transactionRows
            );
            console.log(
              `Imported ${result.inserted} transaction rows for ${importRecord.originalFilename}`
            );
          }
        } catch (parseError) {
          console.error("CSV row import failed (metadata still saved):", parseError);
        }
      }

      response.status(201).json({ import: importRecord });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Column mappings
// ---------------------------------------------------------------------------

app.get(
  "/api/imports/:importId/mappings",
  async (request, response, next) => {
    try {
      const importRecord = await getImportMetadata(request.params.importId);
      if (!importRecord) {
        response.status(404).json({ message: "Import not found." });
        return;
      }

      const mappings = await listColumnMappings(request.params.importId);
      response.json({ import: importRecord, mappings });
    } catch (error) {
      next(error);
    }
  }
);

app.put(
  "/api/imports/:importId/mappings",
  async (request, response, next) => {
    try {
      const importRecord = await getImportMetadata(request.params.importId);
      if (!importRecord) {
        response.status(404).json({ message: "Import not found." });
        return;
      }

      const mappings = parseMappings(request.body.mappings);
      const sourceColumns = new Set(importRecord.columns);

      for (const mapping of mappings) {
        if (!sourceColumns.has(mapping.sourceColumn)) {
          response
            .status(400)
            .json({
              message: `${mapping.sourceColumn} is not a known column.`,
            });
          return;
        }

        if (!acceptedMappingLabels.has(mapping.mappedLabel)) {
          response
            .status(400)
            .json({
              message: `${mapping.mappedLabel} is not a supported label.`,
            });
          return;
        }
      }

      const savedMappings = await replaceColumnMappings(
        request.params.importId,
        mappings
      );
      response.json({ mappings: savedMappings });
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Data cleaning
// ---------------------------------------------------------------------------

app.post(
  "/api/imports/:importId/clean",
  async (request, response, next) => {
    try {
      const importRecord = await getImportMetadata(request.params.importId);
      if (!importRecord) {
        response.status(404).json({ message: "Import not found." });
        return;
      }

      const result = await cleanTransactionData(request.params.importId);
      response.json(result);
    } catch (error) {
      next(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Analytics endpoints (real data)
// ---------------------------------------------------------------------------

app.get("/api/analytics/kpis", async (request, response, next) => {
  try {
    const importId = String(request.query.importId ?? "");
    if (!importId) {
      response
        .status(400)
        .json({ message: "importId query parameter is required." });
      return;
    }

    const kpis = await getKpis(importId);
    response.json(kpis);
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/monthly", async (request, response, next) => {
  try {
    const importId = String(request.query.importId ?? "");
    if (!importId) {
      response
        .status(400)
        .json({ message: "importId query parameter is required." });
      return;
    }

    const months = await getMonthlyPerformance(importId);
    response.json({ months });
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/top-products", async (request, response, next) => {
  try {
    const importId = String(request.query.importId ?? "");
    if (!importId) {
      response
        .status(400)
        .json({ message: "importId query parameter is required." });
      return;
    }

    const limit = Math.min(Number(request.query.limit ?? 10), 50);
    const products = await getTopProducts(importId, limit);
    response.json({ products });
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/by-country", async (request, response, next) => {
  try {
    const importId = String(request.query.importId ?? "");
    if (!importId) {
      response
        .status(400)
        .json({ message: "importId query parameter is required." });
      return;
    }

    const limit = Math.min(Number(request.query.limit ?? 10), 50);
    const countries = await getRevenueByCountry(importId, limit);
    response.json({ countries });
  } catch (error) {
    next(error);
  }
});

app.get("/api/analytics/insights", async (request, response, next) => {
  try {
    const importId = String(request.query.importId ?? "");
    if (!importId) {
      response
        .status(400)
        .json({ message: "importId query parameter is required." });
      return;
    }

    const insights = await getInsights(importId);
    response.json(insights);
  } catch (error) {
    next(error);
  }
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({ message: "Files must be 25MB or smaller." });
      return;
    }

    console.error(error);
    response.status(500).json({ message: "Unexpected server error." });
  }
);

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function startServer() {
  await ensureImportMetadataTable();
  await ensureRetailTransactionsTable();

  app.listen(port, () => {
    console.log(
      `Retail analytics API listening on http://127.0.0.1:${port}`
    );
  });
}

startServer().catch((error) => {
  console.error("Failed to start server.", error);
  process.exit(1);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseColumns(value: unknown) {
  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(String)
      .map((column) => column.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseMappings(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((mapping) => {
      if (!mapping || typeof mapping !== "object") {
        return null;
      }

      const candidate = mapping as Record<string, unknown>;
      return {
        sourceColumn: String(candidate.sourceColumn ?? "").trim(),
        mappedLabel: String(candidate.mappedLabel ?? "").trim(),
      };
    })
    .filter(
      (
        mapping
      ): mapping is { sourceColumn: string; mappedLabel: string } => {
        return Boolean(mapping?.sourceColumn && mapping.mappedLabel);
      }
    );
}

/**
 * Strip UTF-8 BOM character that causes header detection to fail.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Known Kaggle retail dataset column names used to identify the real header row.
 */
const knownColumnPatterns = [
  "invoiceno", "stockcode", "description", "quantity",
  "invoicedate", "unitprice", "customerid", "country",
  "totalprice", "month", "year", "isreturn"
];

/**
 * Scan parsed CSV rows to find the actual header row, skipping title rows
 * such as "Retail_Sample_Data" that sometimes appear before the real headers.
 */
function findCsvHeaderRow(
  rows: string[][]
): { headers: string[]; dataRows: string[][] } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i].map((h) => h.trim());
    const matchCount = row.filter((cell) => {
      const normalized = cell.toLowerCase().replace(/[^a-z0-9]/g, "");
      return knownColumnPatterns.includes(normalized);
    }).length;
    const filledCells = row.filter((c) => c !== "").length;
    if (matchCount >= 3 && filledCells >= row.length / 2) {
      return {
        headers: row,
        dataRows: rows.slice(i + 1).filter((r) => r.some((c) => c.trim() !== "")),
      };
    }
  }
  return null;
}

/**
 * Parse CSV text into RawTransactionRow[].
 * Detects columns by header name. Supports the 12-column Kaggle retail dataset:
 * InvoiceNo, StockCode, Description, Quantity, InvoiceDate, UnitPrice,
 * CustomerID, Country, TotalPrice, Month, Year, IsReturn
 */
function parseCsvToTransactions(
  csvText: string,
  _detectedColumns: string[]
): RawTransactionRow[] {
  const result = Papa.parse<string[]>(stripBom(csvText), {
    skipEmptyLines: true,
  });

  if (result.data.length < 2) return [];

  // Detect real header row (skip title rows like "Retail_Sample_Data")
  const found = findCsvHeaderRow(result.data);

  if (!found) {
    console.warn("Could not find a valid header row in CSV. Headers:", result.data[0]);
    return [];
  }

  const headers = found.headers;
  const dataRows = found.dataRows;

  console.log("Detected CSV headers:", headers);

  // Find column indices by exact match first, then fuzzy match
  const find = (patterns: string[]): number => {
    // Try exact case-insensitive match first
    const exactIdx = headers.findIndex((h) =>
      patterns.some((p) => h.toLowerCase() === p.toLowerCase())
    );
    if (exactIdx !== -1) return exactIdx;

    // Fall back to partial match
    return headers.findIndex((h) => {
      const lower = h.toLowerCase().replace(/[^a-z0-9]/g, "");
      return patterns.some((p) => lower.includes(p.toLowerCase().replace(/[^a-z0-9]/g, "")));
    });
  };

  const invoiceIdx = find(["InvoiceNo", "invoice_no", "invoiceid"]);
  const stockIdx = find(["StockCode", "stock_code", "sku"]);
  const descIdx = find(["Description", "productname", "product", "sku_name"]);
  const qtyIdx = find(["Quantity", "units", "unitssold", "units_sold", "qty"]);
  const dateIdx = find(["InvoiceDate", "invoice_date"]);
  const priceIdx = find(["UnitPrice", "unit_price"]);
  const customerIdx = find(["CustomerID", "customer_id", "customer"]);
  const countryIdx = find(["Country", "region", "store_region"]);
  const totalPriceIdx = find(["TotalPrice", "total_price", "totalprice", "net_sales"]);
  const monthIdx = find(["Month"]);
  const yearIdx = find(["Year"]);
  const isReturnIdx = find(["IsReturn", "is_return", "isreturn"]);

  // We need at least invoice, quantity, and date
  if (invoiceIdx === -1 || qtyIdx === -1 || dateIdx === -1) {
    console.warn(
      "CSV missing required columns. Found:",
      { invoiceIdx, qtyIdx, dateIdx, priceIdx, totalPriceIdx },
      "Headers:", headers
    );
    return [];
  }

  // Need at least one of: TotalPrice or UnitPrice
  if (totalPriceIdx === -1 && priceIdx === -1) {
    console.warn("CSV has neither TotalPrice nor UnitPrice. Skipping.");
    return [];
  }

  const rows: RawTransactionRow[] = [];

  for (const row of dataRows) {
    const invoiceNo = (row[invoiceIdx] ?? "").trim();
    const quantityRaw = parseFloat(row[qtyIdx] ?? "");
    const dateRaw = (row[dateIdx] ?? "").trim();

    // Skip obviously bad rows
    if (!invoiceNo || isNaN(quantityRaw) || !dateRaw) {
      continue;
    }

    const unitPrice = priceIdx >= 0 ? parseFloat(row[priceIdx] ?? "0") || 0 : 0;

    // Use TotalPrice from CSV if available, otherwise compute it
    let totalPrice = 0;
    if (totalPriceIdx >= 0) {
      totalPrice = parseFloat(row[totalPriceIdx] ?? "0") || 0;
    } else {
      totalPrice = quantityRaw * unitPrice;
    }

    // Detect return: from IsReturn column, or C-prefix, or negative qty
    let isReturn = false;
    if (isReturnIdx >= 0) {
      const val = (row[isReturnIdx] ?? "").trim().toLowerCase();
      isReturn = val === "true" || val === "1" || val === "yes";
    } else {
      isReturn = invoiceNo.startsWith("C") || invoiceNo.startsWith("c") || quantityRaw < 0;
    }

    const month = monthIdx >= 0 ? parseInt(row[monthIdx] ?? "", 10) || null : null;
    const year = yearIdx >= 0 ? parseInt(row[yearIdx] ?? "", 10) || null : null;

    rows.push({
      invoiceNo,
      stockCode: stockIdx >= 0 ? (row[stockIdx] ?? "").trim() : "",
      description: descIdx >= 0 ? (row[descIdx] ?? "").trim() : "",
      quantity: Math.round(quantityRaw),
      invoiceDate: dateRaw,
      unitPrice,
      customerId: customerIdx >= 0 ? (row[customerIdx] ?? "").trim() : "",
      country: countryIdx >= 0 ? (row[countryIdx] ?? "").trim() : "",
      totalPrice,
      month,
      year,
      isReturn,
    });
  }

  console.log(`Parsed ${rows.length} transaction rows from CSV`);
  return rows;
}
