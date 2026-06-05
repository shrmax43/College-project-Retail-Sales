// This file previously contained hardcoded dummy data.
// All analytics are now computed from real data in the retail_transactions table.
// Keeping this file for reference only.

export const overviewMetrics = [
  {
    label: "Total Revenue",
    value: 0,
    displayValue: "—",
    delta: 0
  },
  {
    label: "Total Orders",
    value: 0,
    displayValue: "—",
    delta: 0
  },
  {
    label: "Average Order Value",
    value: 0,
    displayValue: "—",
    delta: 0
  },
  {
    label: "Total Quantity Sold",
    value: 0,
    displayValue: "—",
    delta: 0
  }
];

export const monthlyPerformance: Array<{
  month: string;
  revenue: number;
  quantity: number;
  orders: number;
}> = [];

export const labelMappings = [
  { source: "InvoiceDate", mapped: "Date", confidence: 99 },
  { source: "Description", mapped: "Product", confidence: 95 },
  { source: "UnitPrice", mapped: "UnitPrice", confidence: 99 },
  { source: "Quantity", mapped: "Quantity", confidence: 98 },
  { source: "Country", mapped: "Country", confidence: 97 }
];

export const recentImports: Array<{
  filename: string;
  rows: number;
  status: string;
}> = [];
