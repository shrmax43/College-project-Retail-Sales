import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Database,
  FileSpreadsheet,
  LayoutDashboard,
  LineChart,
  Loader2,
  Plus,
  UploadCloud,
  UserRound,
  X
} from "lucide-react";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import type { Row } from "read-excel-file/browser";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";

type PageKey = "upload" | "mapping" | "analysis";

const navItems = [
  { key: "upload" as const, label: "Upload Dataset", icon: UploadCloud },
  { key: "mapping" as const, label: "Label Mapping", icon: ClipboardList },
  { key: "analysis" as const, label: "Analysis Dashboard", icon: LayoutDashboard }
];

const metricCardMeta = [
  { key: "totalRevenue", label: "Total Revenue", icon: CircleDollarSign, tint: "bg-rose-50", iconTint: "bg-rose-500" },
  { key: "totalOrders", label: "Total Transactions", icon: BarChart3, tint: "bg-teal-50", iconTint: "bg-teal-500" },
  { key: "totalCustomers", label: "Total Customers", icon: UserRound, tint: "bg-amber-50", iconTint: "bg-amber-500" },
  { key: "avgOrderValue", label: "Average Order Value", icon: FileSpreadsheet, tint: "bg-violet-50", iconTint: "bg-violet-600" },
] as const;


async function safeJson<T>(res: Response): Promise<T | null> {
  if (res.status === 204) return null;
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json") && !contentType.includes("text/json")) {
    const text = await res.text();
    try { return JSON.parse(text) as T; } catch { return null; }
  }
  try { return (await res.json()) as T; } catch { return null; }
}

type PreviewCell = string | number | boolean | Date | null;

type DatasetImport = {
  id: string;
  originalFilename: string;
  fileType: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: string[];
  status: string;
  createdAt: string;
};

type MappingLabel = "Revenue" | "Date" | "Quantity" | "Product" | "Customer" | "Country" | "InvoiceNo";

type ColumnMapping = {
  importId: string;
  sourceColumn: string;
  mappedLabel: MappingLabel;
  createdAt: string;
  updatedAt: string;
};

const mappingLabels: MappingLabel[] = ["Revenue", "Date", "Quantity", "Product", "Customer", "Country", "InvoiceNo"];

type SidebarSummary = {
  totalRecords: number | null;
  totalCustomers: number | null;
  totalProducts: number | null;
  totalCountries: number | null;
  topCountry: string | null;
  bestSeller: string | null;
  bestMonth: string | null;
  datasetName: string | null;
};

function App() {
  const [page, setPage] = useState<PageKey>("analysis");
  const [sidebarSummary, setSidebarSummary] = useState<SidebarSummary>({
    totalRecords: null, totalCustomers: null, totalProducts: null,
    totalCountries: null, topCountry: null, bestSeller: null,
    bestMonth: null, datasetName: null,
  });

  const pageTitle = useMemo(
    () => navItems.find((item) => item.key === page)?.label ?? "Dashboard",
    [page]
  );

  // Fetch summary data for sidebar independently of page
  useEffect(() => {
    async function loadSummary() {
      try {
        const importsRes = await fetch("/api/imports");
        if (!importsRes.ok) return;
        const importsData = await safeJson<{ imports: DatasetImport[] }>(importsRes);
        const firstImport = importsData?.imports?.[0];
        if (!firstImport) return;

        const importId = firstImport.id;
        const [kpiRes, productsRes, countriesRes, insightsRes] = await Promise.all([
          fetch(`/api/analytics/kpis?importId=${importId}`),
          fetch(`/api/analytics/top-products?importId=${importId}&limit=100`),
          fetch(`/api/analytics/by-country?importId=${importId}&limit=50`),
          fetch(`/api/analytics/insights?importId=${importId}`),
        ]);

        const kpis = kpiRes.ok ? await safeJson<KpiData>(kpiRes) : null;
        const prodsData = productsRes.ok ? await safeJson<{ products: ProductData[] }>(productsRes) : null;
        const ctrData = countriesRes.ok ? await safeJson<{ countries: CountryData[] }>(countriesRes) : null;
        const insights = insightsRes.ok ? await safeJson<{
          highestRevenueMonth: string | null;
          highestRevenueCountry: string | null;
          mostSoldProduct: string | null;
          totalCustomers: number;
        }>(insightsRes) : null;

        setSidebarSummary({
          totalRecords: firstImport.rowCount ?? null,
          totalCustomers: kpis?.totalCustomers ?? insights?.totalCustomers ?? null,
          totalProducts: prodsData?.products?.length ?? null,
          totalCountries: ctrData?.countries?.length ?? null,
          topCountry: insights?.highestRevenueCountry ?? null,
          bestSeller: insights?.mostSoldProduct ?? null,
          bestMonth: insights?.highestRevenueMonth ?? null,
          datasetName: firstImport.originalFilename ?? null,
        });
      } catch { /* ignore */ }
    }
    void loadSummary();
  }, []);

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto flex min-h-screen max-w-[1500px] p-4 lg:p-6">
        <aside className="hidden w-72 shrink-0 rounded-l-[28px] border border-line bg-white/85 shadow-card lg:block">
          <Sidebar activePage={page} onPageChange={setPage} summary={sidebarSummary} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] border border-line bg-[#fbfaf7] shadow-card lg:rounded-l-none lg:border-l-0">
          <Header title={pageTitle} />
          <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-white/70 px-4 py-3 lg:hidden">
            {navItems.map((item) => (
              <button
                key={item.key}
                onClick={() => setPage(item.key)}
                className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  page === item.key
                    ? "bg-ink text-white"
                    : "bg-white text-muted ring-1 ring-line"
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
          </div>
          <section className="flex-1 overflow-y-auto px-5 py-6 sm:px-8 lg:px-10 lg:py-9">
            {page === "upload" && <UploadDatasetPage />}
            {page === "mapping" && <LabelMappingPage />}
            {page === "analysis" && <AnalysisDashboardPage />}
          </section>
        </main>
      </div>
    </div>
  );
}

function Sidebar({
  activePage,
  onPageChange,
  summary,
}: {
  activePage: PageKey;
  onPageChange: (page: PageKey) => void;
  summary: SidebarSummary;
}) {
  const hasData = summary.totalRecords !== null;

  const summaryRows: { label: string; value: string; color: string }[] = hasData
    ? [
        { label: "Total Records",   value: formatNumber(summary.totalRecords ?? 0),   color: "bg-teal-500" },
        { label: "Total Customers", value: formatNumber(summary.totalCustomers ?? 0), color: "bg-violet-500" },
        { label: "Total Products",  value: formatNumber(summary.totalProducts ?? 0),  color: "bg-sky-500" },
        { label: "Total Countries", value: formatNumber(summary.totalCountries ?? 0), color: "bg-amber-500" },
      ]
    : [
        { label: "Top Country",  value: summary.topCountry  ?? "—", color: "bg-teal-500" },
        { label: "Best Seller",  value: summary.bestSeller  ?? "—", color: "bg-violet-500" },
        { label: "Best Month",   value: summary.bestMonth   ?? "—", color: "bg-sky-500" },
      ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-line px-6 py-6">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#0f6374] text-white shadow-sm">
          <LineChart size={24} />
        </div>
        <div>
          <p className="text-base font-bold leading-tight">Retail Analytics</p>
          <p className="text-xs font-medium text-muted">Intelligence System</p>
        </div>
      </div>

      <nav className="space-y-2 px-4 py-7">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === activePage;
          return (
            <button
              key={item.key}
              onClick={() => onPageChange(item.key)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                active
                  ? "bg-[#f1edff] text-violet-700"
                  : "text-muted hover:bg-[#f7f3ed] hover:text-ink"
              }`}
            >
              <Icon size={19} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Dataset Summary card */}
      <div className="mt-auto border-t border-line px-4 py-5">
        <p className="mb-3 px-1 text-xs font-bold uppercase tracking-[0.14em] text-muted">
          Dataset Summary
        </p>

        {summary.datasetName && (
          <p className="mb-3 truncate px-1 text-[11px] font-semibold text-muted" title={summary.datasetName}>
            📁 {summary.datasetName}
          </p>
        )}

        <div className="space-y-2">
          {summaryRows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between rounded-xl bg-[#f7f3ed] px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${row.color}`} />
                <span className="text-xs font-semibold text-muted">{row.label}</span>
              </div>
              <span className="text-xs font-black text-ink">{row.value}</span>
            </div>
          ))}
        </div>

        {!hasData && (
          <p className="mt-3 px-1 text-[10px] text-muted">
            Upload &amp; clean a dataset to see full stats.
          </p>
        )}
      </div>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <header className="border-b border-line bg-white/75 px-5 py-4 sm:px-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
        Retail workspace
      </p>
      <h1 className="mt-0.5 text-xl font-bold sm:text-2xl">{title}</h1>
    </header>
  );
}

function UploadDatasetPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewCell[][]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [columnCount, setColumnCount] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imports, setImports] = useState<DatasetImport[]>([]);

  useEffect(() => {
    void refreshImports();
  }, []);

  async function refreshImports() {
    try {
      const response = await fetch("/api/imports");
      if (!response.ok) {
        return;
      }

      const data = await safeJson<{ imports: DatasetImport[] }>(response);
      if (data) setImports(data.imports);
    } catch {
      setImports([]);
    }
  }

  async function handleFile(file: File) {
    setError("");
    setStatus("");
    setIsParsing(true);

    try {
      validateDatasetFile(file);
      const preview = await parsePreview(file);
      setSelectedFile(file);
      setHeaders(preview.headers);
      setPreviewRows(preview.rows);
      setRowCount(preview.rowCount);
      setColumnCount(preview.columnCount);
      setStatus("Preview ready. Metadata has not been stored yet.");
    } catch (parseError) {
      clearSelection();
      setError(parseError instanceof Error ? parseError.message : "Could not read this file.");
    } finally {
      setIsParsing(false);
    }
  }

  function clearSelection() {
    setSelectedFile(null);
    setHeaders([]);
    setPreviewRows([]);
    setRowCount(0);
    setColumnCount(0);
    setStatus("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function storeMetadata() {
    if (!selectedFile) {
      setError("Choose a CSV or XLSX file first.");
      return;
    }

    setIsUploading(true);
    setError("");
    setStatus("");

    try {
      const formData = new FormData();
      formData.append("dataset", selectedFile);
      formData.append("rowCount", String(rowCount));
      formData.append("columnCount", String(columnCount));
      formData.append("columns", JSON.stringify(headers));

      const response = await fetch("/api/imports", {
        method: "POST",
        body: formData
      });

      const payload = await safeJson<{ message?: string }>(response);
      if (!response.ok) {
        throw new Error(payload?.message ?? "Upload failed.");
      }

      setStatus("Metadata stored in PostgreSQL.");
      await refreshImports();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files.item(0);
    if (file) {
      void handleFile(file);
    }
  }

  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.item(0);
    if (file) {
      void handleFile(file);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
      <section className="space-y-6 rounded-[24px] border border-line bg-white p-6 shadow-card">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Upload Dataset</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Import retail sales data as CSV or XLSX. Preview the first 10
              rows, then store file metadata in PostgreSQL.
            </p>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
            CSV / XLSX
          </span>
        </div>

        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onFileInputChange}
        />

        <div
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          className={`grid min-h-[300px] place-items-center rounded-[22px] border-2 border-dashed px-5 py-10 text-center transition ${
            isDragging
              ? "border-violet-400 bg-[#f1edff]"
              : "border-[#d8cfc2] bg-[#fbf8f2]"
          }`}
        >
          <div>
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-white text-violet-700 shadow-sm">
              {isParsing ? <Loader2 className="animate-spin" size={30} /> : <UploadCloud size={30} />}
            </div>
            <h3 className="mt-5 text-lg font-bold">Drop your retail dataset here</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              Files must be CSV or XLSX and no larger than 25MB. Only upload
              metadata is saved in this phase.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white"
                type="button"
              >
                Select File
              </button>
              <button
                onClick={clearSelection}
                className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-muted ring-1 ring-line"
                type="button"
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        {(error || status) && (
          <div
            className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
              error ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"
            }`}
          >
            {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{error || status}</span>
          </div>
        )}

        {selectedFile && (
          <section className="rounded-[22px] border border-line bg-[#fbf8f2] p-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <p className="text-sm font-bold text-muted">Selected Dataset</p>
                <h3 className="mt-1 text-lg font-black">{selectedFile.name}</h3>
                <p className="mt-1 text-sm text-muted">
                  {formatBytes(selectedFile.size)} · {rowCount.toLocaleString()} rows ·{" "}
                  {columnCount.toLocaleString()} columns
                </p>
              </div>
              <button
                onClick={storeMetadata}
                disabled={isUploading}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
              >
                {isUploading && <Loader2 className="animate-spin" size={16} />}
                Store Metadata
              </button>
            </div>
          </section>
        )}

        {headers.length > 0 && (
          <section className="overflow-hidden rounded-[22px] border border-line bg-white">
            <div className="flex items-center justify-between border-b border-line px-5 py-4">
              <div>
                <h3 className="font-bold">Preview</h3>
                <p className="text-sm text-muted">First 10 rows only</p>
              </div>
              <span className="rounded-full bg-[#f7f3ed] px-3 py-1 text-xs font-bold text-muted">
                No analytics processing
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-[#fbf8f2] text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    {headers.map((header, index) => (
                      <th key={`${header}-${index}`} className="px-3 py-3 sm:px-4">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {previewRows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {headers.map((header, columnIndex) => (
                        <td key={`${header}-${columnIndex}`} className="max-w-40 truncate px-3 py-3 sm:max-w-52 sm:px-4">
                          {formatCell(row[columnIndex])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>

      <section className="rounded-[24px] border border-line bg-white p-6 shadow-card">
        <h2 className="text-lg font-bold">Recent Imports</h2>
        <div className="mt-5 space-y-4">
          {imports.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line p-4 text-sm leading-6 text-muted">
              No uploaded metadata yet. Add a CSV or XLSX file to populate this list.
            </div>
          )}
          {imports.map((record) => (
            <div key={record.id} className="rounded-2xl border border-line p-4">
              <div className="flex items-center justify-between gap-3">
                <FileSpreadsheet className="text-teal-600" size={20} />
                <span className="rounded-full bg-[#f7f3ed] px-3 py-1 text-xs font-bold text-muted">
                  {record.status}
                </span>
              </div>
              <p className="mt-3 break-words font-bold">{record.originalFilename}</p>
              <p className="mt-1 text-sm text-muted">
                {record.rowCount.toLocaleString()} rows · {record.columnCount} columns
              </p>
              <p className="mt-1 text-xs font-medium text-muted">
                {new Date(record.createdAt).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function validateDatasetFile(file: File) {
  const fileExtension = file.name.split(".").pop()?.toLowerCase();
  const validExtension = fileExtension === "csv" || fileExtension === "xlsx";
  const maxSize = 25 * 1024 * 1024;

  if (!validExtension) {
    throw new Error("Only CSV and XLSX files are supported.");
  }

  if (file.size === 0) {
    throw new Error("This file is empty.");
  }

  if (file.size > maxSize) {
    throw new Error("Files must be 25MB or smaller.");
  }
}

const knownHeaderPatterns = [
  "invoiceno", "stockcode", "description", "quantity",
  "invoicedate", "unitprice", "customerid", "country",
  "totalprice", "month", "year", "isreturn"
];

function looksLikeHeader(cell: PreviewCell): boolean {
  const label = formatCell(cell).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  return knownHeaderPatterns.includes(label);
}

function findHeaderRow(rows: PreviewCell[][]): { headerRow: PreviewCell[]; dataRows: PreviewCell[][] } | null {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const matchCount = row.filter(looksLikeHeader).length;
    const filledCells = row.filter((c) => c !== null && String(c).trim() !== "").length;
    // A genuine header row has at least 3 known column names and most cells filled
    if (matchCount >= 3 && filledCells >= row.length / 2) {
      return {
        headerRow: row,
        dataRows: rows.slice(i + 1).filter((r) => r.some((c) => c !== null && String(c).trim() !== ""))
      };
    }
  }
  return null;
}

async function parsePreview(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const rows: PreviewCell[][] =
    extension === "csv" ? await parseCsvFile(file) : rowsFromXlsx(await readSheet(file));
  const normalizedRows = rows
    .map((row) => row.map((cell) => normalizeCell(cell)))
    .filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ""));

  if (normalizedRows.length === 0) {
    throw new Error("No rows were found in this dataset.");
  }

  // Detect real header row (skip title rows like "Retail_Sample_Data")
  const found = findHeaderRow(normalizedRows);

  const usedHeaderRow = found ? found.headerRow : normalizedRows[0];
  const usedDataRows = found ? found.dataRows : normalizedRows.slice(1);

  const headers = usedHeaderRow.map((cell, index) => {
    const label = formatCell(cell).trim();
    return label || `Column ${index + 1}`;
  });

  if (headers.length === 0) {
    throw new Error("No columns were found in this dataset.");
  }

  return {
    headers,
    rows: usedDataRows.slice(0, 10),
    rowCount: usedDataRows.length,
    columnCount: headers.length
  };
}

async function parseCsvFile(file: File): Promise<PreviewCell[][]> {
  let text = await file.text();
  // Strip UTF-8 BOM that causes first header to be unreadable
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const result = Papa.parse<PreviewCell[]>(text, {
    skipEmptyLines: true
  });

  if (result.errors.length > 0) {
    throw new Error(result.errors[0].message);
  }

  return result.data;
}

function rowsFromXlsx(rows: Row[]): PreviewCell[][] {
  return rows.map((row) => row.map((cell) => normalizeCell(cell)));
}

function normalizeCell(cell: unknown): PreviewCell {
  if (cell === undefined || cell === null) {
    return null;
  }

  if (cell instanceof Date || typeof cell === "boolean" || typeof cell === "number") {
    return cell;
  }

  return String(cell);
}

function formatCell(cell: PreviewCell | undefined) {
  if (cell === undefined || cell === null) {
    return "";
  }

  if (cell instanceof Date) {
    return cell.toLocaleDateString();
  }

  return String(cell);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function LabelMappingPage() {
  const [imports, setImports] = useState<DatasetImport[]>([]);
  const [activeImportId, setActiveImportId] = useState("");
  const [mappings, setMappings] = useState<Record<string, MappingLabel | "">>({});
  const [excludedColumns, setExcludedColumns] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeImport = imports.find((record) => record.id === activeImportId);
  const visibleColumns = activeImport?.columns.filter((col) => !excludedColumns.has(col)) ?? [];
  const excludedColumnsList = activeImport?.columns.filter((col) => excludedColumns.has(col)) ?? [];
  const mappedCount = visibleColumns.filter((col) => mappings[col]).length;

  useEffect(() => {
    async function loadImports() {
      setIsLoading(true);
      setError("");

      try {
        const response = await fetch("/api/imports");
        if (!response.ok) {
          throw new Error("Could not load uploaded datasets.");
        }

        const data = await safeJson<{ imports: DatasetImport[] }>(response);
        if (!data) throw new Error("Empty response");
        setImports(data.imports);
        const firstImportWithColumns = data.imports.find((record) => record.columns.length > 0);
        if (firstImportWithColumns) {
          setActiveImportId(firstImportWithColumns.id);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load mappings.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadImports();
  }, []);

  useEffect(() => {
    if (!activeImportId) {
      return;
    }

    async function loadMappings() {
      setError("");
      setMessage("");
      setExcludedColumns(new Set());

      try {
        const response = await fetch(`/api/imports/${activeImportId}/mappings`);
        if (!response.ok) {
          throw new Error("Could not load saved mappings.");
        }

        const data = await safeJson<{
          import: DatasetImport;
          mappings: ColumnMapping[];
        }>(response);
        if (!data) throw new Error("Empty response");
        const savedMappingLookup = Object.fromEntries(
          data.mappings.map((mapping) => [mapping.sourceColumn, mapping.mappedLabel])
        ) as Record<string, MappingLabel>;

        const nextMappings = Object.fromEntries(
          data.import.columns.map((column) => [
            column,
            savedMappingLookup[column] ?? inferMappingLabel(column)
          ])
        ) as Record<string, MappingLabel | "">;

        setMappings(nextMappings);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Could not load mappings.");
      }
    }

    void loadMappings();
  }, [activeImportId]);

  async function saveMappings() {
    if (!activeImport) {
      setError("Upload a dataset before mapping labels.");
      return;
    }

    setIsSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        mappings: Object.entries(mappings)
          .filter((entry): entry is [string, MappingLabel] => Boolean(entry[1]) && !excludedColumns.has(entry[0]))
          .map(([sourceColumn, mappedLabel]) => ({ sourceColumn, mappedLabel }))
      };

      const response = await fetch(`/api/imports/${activeImport.id}/mappings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const body = await safeJson<{ message?: string }>(response);
      if (!response.ok) {
        throw new Error(body?.message ?? "Could not save mappings.");
      }

      setMessage("Mappings stored in PostgreSQL.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save mappings.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
      <section className="rounded-[24px] border border-line bg-white p-6 shadow-card">
        <h2 className="text-2xl font-bold">Label Mapping</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          Map extracted dataset columns to the labels required for analysis.
          Mappings are saved in PostgreSQL, but analytics are not processed yet.
        </p>
        <div className="mt-7 space-y-4">
          <div className="rounded-2xl border border-line bg-[#fbf8f2] p-4">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-violet-700">
                <Database size={18} />
              </div>
              <div>
                <p className="font-bold">Required Labels</p>
                <p className="text-sm text-muted">Revenue, Date, Quantity, Product, Customer, Country, InvoiceNo</p>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-white p-4">
            <p className="text-sm font-bold text-muted">Uploaded Dataset</p>
            <select
              value={activeImportId}
              onChange={(event) => setActiveImportId(event.target.value)}
              className="mt-3 w-full rounded-2xl border border-line bg-[#fbf8f2] px-4 py-3 text-sm font-semibold text-ink"
            >
              <option value="">Select dataset</option>
              {imports.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.originalFilename}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            {mappingLabels.map((label) => (
              <div key={label} className="rounded-2xl border border-line bg-[#fbf8f2] p-4">
                <p className="text-sm font-black">{label}</p>
                <p className="mt-1 text-xs font-medium text-muted">
                  {Object.entries(mappings).find(([, mappedLabel]) => mappedLabel === label)?.[0] ??
                    "Not mapped"}
                </p>
              </div>
            ))}
          </div>

          {(error || message) && (
            <div
              className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
                error ? "bg-rose-50 text-rose-700" : "bg-teal-50 text-teal-700"
              }`}
            >
              {error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
              <span>{error || message}</span>
            </div>
          )}
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-line bg-white shadow-card">
        <div className="flex flex-col justify-between gap-4 border-b border-line px-6 py-5 md:flex-row md:items-center">
          <div>
            <h3 className="text-lg font-bold">Detected Columns</h3>
            <div className="mt-2 space-y-1">
              <p className="text-sm text-muted">
                {activeImport
                  ? `${activeImport.originalFilename} · ${activeImport.columns.length} columns`
                  : "Upload a dataset to extract columns"}
              </p>
              {activeImport && (
                <div className="flex items-center gap-4 text-sm font-semibold">
                  <span className="text-ink">Mapped Columns: <span className="text-violet-700">{mappedCount}</span></span>
                  <span className="text-muted">Excluded Columns: <span className="text-muted">{excludedColumnsList.length}</span></span>
                </div>
              )}
            </div>
          </div>
          <button
            onClick={saveMappings}
            disabled={!activeImport || isSaving || mappedCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
          >
            {isSaving && <Loader2 className="animate-spin" size={16} />}
            Store Mappings
          </button>
        </div>

        {isLoading && (
          <div className="grid min-h-[360px] place-items-center text-muted">
            <Loader2 className="animate-spin" size={26} />
          </div>
        )}

        {!isLoading && !activeImport && (
          <div className="grid min-h-[360px] place-items-center px-6 text-center">
            <div>
              <UploadCloud className="mx-auto text-violet-700" size={34} />
              <h3 className="mt-4 text-lg font-bold">No extracted columns yet</h3>
              <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                Upload a CSV or XLSX file first. Phase 3 will use that file's
                headers for label mapping.
              </p>
            </div>
          </div>
        )}

        {!isLoading && activeImport && (
          <div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="bg-[#fbf8f2] text-xs uppercase tracking-[0.12em] text-muted">
                  <tr>
                    <th className="px-3 py-4 sm:px-6">Source Column</th>
                    <th className="px-3 py-4 sm:px-6">Mapped Label</th>
                    <th className="px-3 py-4 sm:px-6">Status</th>
                    <th className="px-3 py-4 sm:px-6">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visibleColumns.map((column) => (
                    <tr key={column}>
                      <td className="px-3 py-5 font-semibold sm:px-6">{column}</td>
                      <td className="px-3 py-5 sm:px-6">
                        <select
                          value={mappings[column] ?? ""}
                          onChange={(event) =>
                            setMappings((current) => ({
                              ...current,
                              [column]: event.target.value as MappingLabel | ""
                            }))
                          }
                          className="w-full rounded-xl border border-line bg-[#f6f3ef] px-3 py-2 text-sm font-semibold text-ink sm:min-w-52 sm:px-4"
                        >
                          <option value="">Ignore column</option>
                          {mappingLabels.map((label) => (
                            <option key={label} value={label}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-5 sm:px-6">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-bold whitespace-nowrap ${
                            mappings[column]
                              ? "bg-teal-50 text-teal-700"
                              : "bg-[#f7f3ed] text-muted"
                          }`}
                        >
                          {mappings[column] ? "Mapped" : "Ignored"}
                        </span>
                      </td>
                      <td className="px-3 py-5 sm:px-6">
                        <button
                          onClick={() => setExcludedColumns((prev) => new Set([...prev, column]))}
                          className="inline-flex items-center justify-center rounded-lg p-2 hover:bg-rose-50 text-rose-600 transition"
                          type="button"
                          title="Exclude column"
                        >
                          <X size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {excludedColumnsList.length > 0 && (
              <div className="border-t border-line px-6 py-6">
                <h4 className="mb-4 text-sm font-bold text-ink">Excluded Columns</h4>
                <div className="flex flex-wrap gap-3">
                  {excludedColumnsList.map((column) => (
                    <div
                      key={column}
                      className="inline-flex items-center gap-2 rounded-full bg-[#f7f3ed] px-4 py-2"
                    >
                      <span className="text-sm font-semibold text-ink">{column}</span>
                      <button
                        onClick={() => setExcludedColumns((prev) => {
                          const next = new Set(prev);
                          next.delete(column);
                          return next;
                        })}
                        className="inline-flex items-center justify-center rounded-full hover:bg-white transition"
                        type="button"
                        title="Include column"
                      >
                        <Plus size={16} className="text-violet-700" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function inferMappingLabel(columnName: string): MappingLabel | "" {
  const lower = columnName.toLowerCase().trim();

  // Exact matches for the 12-column Kaggle dataset
  if (lower === "totalprice" || lower === "total_price" || lower === "net_sales") return "Revenue";
  if (lower === "invoicedate" || lower === "invoice_date") return "Date";
  if (lower === "quantity" || lower === "units_sold" || lower === "unitssold") return "Quantity";
  if (lower === "description" || lower === "productname" || lower === "sku_name") return "Product";
  if (lower === "customerid" || lower === "customer_id") return "Customer";
  if (lower === "country" || lower === "region" || lower === "store_region") return "Country";
  if (lower === "invoiceno" || lower === "invoice_no" || lower === "invoiceid") return "InvoiceNo";

  // Fuzzy fallbacks
  const normalized = lower.replace(/[^a-z0-9]+/g, "_");
  if (normalized.includes("total") && normalized.includes("price")) return "Revenue";
  if (normalized.includes("date") || normalized.includes("timestamp")) return "Date";
  if (normalized.includes("quantity") || normalized.includes("qty") || normalized.includes("units")) return "Quantity";
  if (normalized.includes("description") || normalized.includes("product") || normalized.includes("item") || normalized.includes("sku")) return "Product";
  if (normalized.includes("customer")) return "Customer";
  if (normalized.includes("country")) return "Country";
  if (normalized.includes("invoice") && normalized.includes("no")) return "InvoiceNo";

  return "";
}

type KpiData = {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalQuantitySold: number;
  totalCustomers: number;
};

type MonthlyData = {
  month: string;
  revenue: number;
  orders: number;
  quantity: number;
};

type ProductData = {
  description: string;
  revenue: number;
  quantity: number;
};

type CountryData = {
  country: string;
  revenue: number;
  orders: number;
  percentage: number;
};

function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(1)}K`;
  return `£${value.toFixed(2)}`;
}

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

const donutColors = [
  "#6366f1", "#e95c91", "#2dc6b6", "#8b5cf6", "#f59e0b",
  "#3b82f6", "#ef4444", "#10b981", "#f97316", "#06b6d4"
];

function AnalysisDashboardPage() {
  const [imports, setImports] = useState<DatasetImport[]>([]);
  const [activeImportId, setActiveImportId] = useState("");
  const [kpis, setKpis] = useState<KpiData | null>(null);
  const [monthly, setMonthly] = useState<MonthlyData[]>([]);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [countries, setCountries] = useState<CountryData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cleaningResult, setCleaningResult] = useState<{ totalBefore: number; totalAfter: number; removedReturns: number; removedBadPrice: number; removedNoDescription: number } | null>(null);
  const [isCleaning, setIsCleaning] = useState(false);
  const [insights, setInsights] = useState<{
    highestRevenueMonth: string | null;
    highestRevenueCountry: string | null;
    mostSoldProduct: string | null;
    totalCustomers: number;
  } | null>(null);

  // Load imports list
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/imports");
        if (!res.ok) return;
        const data = await safeJson<{ imports: DatasetImport[] }>(res);
        if (!data) return;
        setImports(data.imports);
        if (data.imports.length > 0) {
          setActiveImportId(data.imports[0].id);
        }
      } catch { /* ignore */ }
    }
    void load();
  }, []);

  // Load analytics when import changes
  useEffect(() => {
    if (!activeImportId) return;

    async function loadAnalytics() {
      setIsLoading(true);
      try {
        const [kpiRes, monthlyRes, productsRes, countriesRes, insightsRes] = await Promise.all([
          fetch(`/api/analytics/kpis?importId=${activeImportId}`),
          fetch(`/api/analytics/monthly?importId=${activeImportId}`),
          fetch(`/api/analytics/top-products?importId=${activeImportId}&limit=10`),
          fetch(`/api/analytics/by-country?importId=${activeImportId}&limit=8`),
          fetch(`/api/analytics/insights?importId=${activeImportId}`)
        ]);

        if (kpiRes.ok) {
          const d = await safeJson<KpiData>(kpiRes);
          if (d) setKpis(d);
        }
        if (monthlyRes.ok) {
          const d = await safeJson<{ months: MonthlyData[] }>(monthlyRes);
          if (d) setMonthly(d.months);
        }
        if (productsRes.ok) {
          const d = await safeJson<{ products: ProductData[] }>(productsRes);
          if (d) setProducts(d.products);
        }
        if (countriesRes.ok) {
          const d = await safeJson<{ countries: CountryData[] }>(countriesRes);
          if (d) setCountries(d.countries);
        }
        if (insightsRes.ok) {
          const d = await safeJson<{
            highestRevenueMonth: string | null;
            highestRevenueCountry: string | null;
            mostSoldProduct: string | null;
            totalCustomers: number;
          }>(insightsRes);
          if (d) setInsights(d);
        }
      } catch { /* ignore */ }
      setIsLoading(false);
    }

    void loadAnalytics();
  }, [activeImportId]);

  async function handleClean() {
    if (!activeImportId) return;
    setIsCleaning(true);
    try {
      const res = await fetch(`/api/imports/${activeImportId}/clean`, { method: "POST" });
      if (res.ok) {
        const result = await safeJson<{
          totalBefore: number; totalAfter: number;
          removedReturns: number; removedBadPrice: number; removedNoDescription: number;
        }>(res);
        if (result) setCleaningResult(result);
        // Reload analytics after cleaning
        setActiveImportId((prev) => { const id = prev; setActiveImportId(""); setTimeout(() => setActiveImportId(id), 50); return prev; });
      }
    } catch { /* ignore */ }
    setIsCleaning(false);
  }

  const kpiValues: Record<string, string> = kpis
    ? {
        totalRevenue: formatCurrency(kpis.totalRevenue),
        totalOrders: formatNumber(kpis.totalOrders),
        avgOrderValue: formatCurrency(kpis.avgOrderValue),
        totalQuantitySold: formatNumber(kpis.totalQuantitySold),
        totalCustomers: formatNumber(kpis.totalCustomers)
      }
    : { totalRevenue: "—", totalOrders: "—", avgOrderValue: "—", totalQuantitySold: "—", totalCustomers: "—" };

  // Normalize monthly data for bar chart heights
  const maxRevenue = Math.max(...monthly.map((m) => m.revenue), 1);
  const maxQuantity = Math.max(...monthly.map((m) => m.quantity), 1);
  const maxOrders = Math.max(...monthly.map((m) => m.orders), 1);

  // Build conic gradient for country donut
  const countryGradient = useMemo(() => {
    if (countries.length === 0) return "#e5e7eb";
    let cumulative = 0;
    const stops: string[] = [];
    countries.forEach((c, i) => {
      const color = donutColors[i % donutColors.length];
      const start = cumulative;
      cumulative += c.percentage;
      stops.push(`${color} ${start}% ${cumulative}%`);
    });
    // Fill remaining to 100%
    if (cumulative < 100) {
      stops.push(`#e5e7eb ${cumulative}% 100%`);
    }
    return `conic-gradient(${stops.join(", ")})`;
  }, [countries]);

  return (
    <div className="space-y-8">
      {/* Dataset selector + clean button */}
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Overview</h2>
          <div className="mt-3 flex items-center gap-3">
            <select
              value={activeImportId}
              onChange={(e) => { setActiveImportId(e.target.value); setCleaningResult(null); }}
              className="rounded-2xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink"
            >
              <option value="">Select dataset</option>
              {imports.map((rec) => (
                <option key={rec.id} value={rec.id}>{rec.originalFilename}</option>
              ))}
            </select>
            <button
              onClick={handleClean}
              disabled={!activeImportId || isCleaning}
              className="inline-flex items-center gap-2 rounded-2xl bg-ink px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {isCleaning && <Loader2 className="animate-spin" size={14} />}
              Clean Data
            </button>
          </div>
        </div>
        {cleaningResult && (
          <div className="rounded-2xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-700">
            <CheckCircle2 size={16} className="mr-1 inline" />
            Cleaned: {cleaningResult.totalBefore.toLocaleString()} → {cleaningResult.totalAfter.toLocaleString()} rows
            (removed {cleaningResult.removedReturns} returns, {cleaningResult.removedBadPrice} bad prices, {cleaningResult.removedNoDescription} empty descriptions)
          </div>
        )}
      </section>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid min-h-[120px] place-items-center text-muted">
          <Loader2 className="animate-spin" size={28} />
        </div>
      ) : (
        <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-4">
          {metricCardMeta.map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.key}
                className={`rounded-[22px] ${card.tint} p-5 shadow-sm ring-1 ring-white/80`}
              >
                <div className="flex items-center gap-3">
                  <div className={`grid h-11 w-11 place-items-center rounded-xl text-white ${card.iconTint}`}>
                    <Icon size={21} />
                  </div>
                  <p className="text-sm font-bold">{card.label}</p>
                </div>
                <p className="mt-5 text-3xl font-black tracking-normal">{kpiValues[card.key]}</p>
                <p className="mt-2 text-xs font-medium text-muted">Computed from uploaded data</p>
              </article>
            );
          })}
        </section>
      )}

      {/* Monthly bar chart + Country donut */}
      <section className="grid gap-6 xl:grid-cols-[1fr_300px]">
        {/* Monthly chart — fully responsive, no overflow */}
        <div className="min-w-0 overflow-hidden rounded-[24px] border border-line bg-white p-5 shadow-card">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Monthly Performance</h2>
              <p className="mt-0.5 text-xs text-muted">Revenue, quantity, and order trends by month</p>
            </div>
            <div className="flex flex-wrap gap-3 text-xs font-semibold text-muted">
              <Legend color="bg-sky-500" label="Revenue" />
              <Legend color="bg-emerald-500" label="Quantity" />
              <Legend color="bg-amber-400" label="Orders" />
            </div>
          </div>
          {monthly.length === 0 ? (
            <div className="grid h-48 place-items-center text-sm text-muted">
              No monthly data available. Upload and clean a dataset first.
            </div>
          ) : (
            <div className="w-full">
              {/* Chart area: fixed height, bars fill full width via flex */}
              {/* Each month column is h-full so percentage bar heights resolve correctly */}
              <div className="flex h-48 w-full gap-0.5 border-b border-line">
                {monthly.map((m) => (
                  <div key={m.month} className="flex h-full min-w-0 flex-1 items-end justify-center gap-px">
                    <div
                      className="w-[30%] min-w-[3px] rounded-t-sm bg-sky-500 transition-all"
                      style={{ height: `${Math.round((m.revenue / maxRevenue) * 95) + 5}%` }}
                    />
                    <div
                      className="w-[30%] min-w-[3px] rounded-t-sm bg-emerald-500 transition-all"
                      style={{ height: `${Math.round((m.quantity / maxQuantity) * 95) + 5}%` }}
                    />
                    <div
                      className="w-[30%] min-w-[3px] rounded-t-sm bg-amber-400 transition-all"
                      style={{ height: `${Math.round((m.orders / maxOrders) * 95) + 5}%` }}
                    />
                  </div>
                ))}
              </div>
              {/* X-axis labels — same flex layout as bars, guaranteed alignment */}
              <div className="flex w-full gap-0.5 pt-1.5">
                {monthly.map((m) => (
                  <div key={m.month} className="min-w-0 flex-1 overflow-hidden">
                    <span className="block truncate text-center text-[9px] font-medium text-muted">{m.month}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Country donut — fixed width, contained */}
        <div className="min-w-0 overflow-hidden rounded-[24px] border border-line bg-white p-6 shadow-card">
          <h3 className="font-bold">Revenue by Country</h3>
          {countries.length === 0 ? (
            <div className="mt-8 grid h-40 place-items-center text-sm text-muted">No data</div>
          ) : (
            <>
              <div
                className="mx-auto mt-6 h-36 w-36 rounded-full p-7"
                style={{ background: countryGradient }}
              >
                <div className="h-full w-full rounded-full bg-white" />
              </div>
              <div className="mt-6 space-y-2.5">
                {countries.slice(0, 6).map((c, i) => (
                  <div key={c.country} className="flex items-center gap-2 text-sm">
                    <span
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: donutColors[i % donutColors.length] }}
                    />
                    <span className="min-w-0 truncate">{c.percentage}% {c.country}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Top Products */}
      <section className="min-w-0 overflow-hidden rounded-[24px] border border-line bg-white p-6 shadow-card">
        <h2 className="text-xl font-bold">Top 10 Products by Revenue</h2>
        <p className="mt-2 text-sm text-muted">Ranked by total revenue from the dataset</p>
        {products.length === 0 ? (
          <div className="mt-6 grid h-28 place-items-center text-sm text-muted">
            No product data available.
          </div>
        ) : (
          <div className="mt-5 w-full overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="bg-[#fbf8f2] text-xs uppercase tracking-[0.12em] text-muted">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3 text-right">Revenue</th>
                  <th className="px-4 py-3 text-right">Qty Sold</th>
                  <th className="px-4 py-3">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((p, i) => {
                  const topRevenue = products[0]?.revenue ?? 1;
                  const barWidth = Math.round((p.revenue / topRevenue) * 100);
                  return (
                    <tr key={p.description}>
                      <td className="px-4 py-3.5 font-semibold text-muted">{i + 1}</td>
                      <td className="max-w-[220px] truncate px-4 py-3.5 font-semibold">{p.description}</td>
                      <td className="px-4 py-3.5 text-right font-bold">{formatCurrency(p.revenue)}</td>
                      <td className="px-4 py-3.5 text-right text-muted">{p.quantity.toLocaleString()}</td>
                      <td className="w-28 px-4 py-3.5">
                        <div className="h-2 w-full rounded-full bg-[#f1f0ef]">
                          <div
                            className="h-full rounded-full bg-violet-500 transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Insights */}
      <section className="rounded-[24px] border border-line bg-white p-6 shadow-card">
        <h2 className="text-xl font-bold">Key Insights</h2>
        <p className="mt-2 text-sm text-muted">Top-level findings derived from the uploaded dataset</p>
        {!insights ? (
          <div className="mt-6 grid h-[80px] place-items-center text-sm text-muted">
            No insights available. Upload and process a dataset first.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-line bg-[#fbf8f2] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Best Month</p>
              <p className="mt-2 text-lg font-black">{insights.highestRevenueMonth ?? "—"}</p>
              <p className="mt-1 text-xs text-muted">Highest revenue month</p>
            </div>
            <div className="rounded-2xl border border-line bg-[#fbf8f2] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Top Country</p>
              <p className="mt-2 text-lg font-black">{insights.highestRevenueCountry ?? "—"}</p>
              <p className="mt-1 text-xs text-muted">Highest revenue country</p>
            </div>
            <div className="rounded-2xl border border-line bg-[#fbf8f2] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Best Seller</p>
              <p className="mt-2 truncate text-lg font-black">{insights.mostSoldProduct ?? "—"}</p>
              <p className="mt-1 text-xs text-muted">Most sold product (by qty)</p>
            </div>
            <div className="rounded-2xl border border-line bg-[#fbf8f2] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-muted">Total Customers</p>
              <p className="mt-2 text-lg font-black">{formatNumber(insights.totalCustomers)}</p>
              <p className="mt-1 text-xs text-muted">Unique customer count</p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-3.5 w-3.5 rounded-full ${color}`} />
      <span>{label}</span>
    </div>
  );
}

/* Bar is no longer used — bars are rendered inline in AnalysisDashboardPage */
function Bar({ height, color }: { height: number; color: string }) {
  return (
    <div
      className={`w-[30%] min-w-[3px] rounded-t-sm ${color} transition-all`}
      style={{ height: `${height}%` }}
    />
  );
}

export default App;
