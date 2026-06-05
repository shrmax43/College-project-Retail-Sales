import { pool } from "./db";

// ---------------------------------------------------------------------------
// Table setup
// ---------------------------------------------------------------------------

export async function ensureRetailTransactionsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS retail_transactions (
      id            SERIAL PRIMARY KEY,
      import_id     TEXT NOT NULL REFERENCES dataset_imports(id) ON DELETE CASCADE,
      invoice_no    TEXT NOT NULL,
      stock_code    TEXT,
      description   TEXT,
      quantity      INTEGER NOT NULL,
      invoice_date  TIMESTAMP NOT NULL,
      unit_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
      customer_id   TEXT,
      country       TEXT,
      total_price   NUMERIC(12,2) NOT NULL DEFAULT 0,
      month         INTEGER,
      year          INTEGER,
      is_return     BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Add columns that may not exist on older tables
  await pool.query(`ALTER TABLE retail_transactions ADD COLUMN IF NOT EXISTS total_price NUMERIC(12,2) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE retail_transactions ADD COLUMN IF NOT EXISTS month INTEGER;`);
  await pool.query(`ALTER TABLE retail_transactions ADD COLUMN IF NOT EXISTS year INTEGER;`);

  // Indexes for analytics queries
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rt_import_id ON retail_transactions(import_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_rt_invoice_date ON retail_transactions(invoice_date);`);
}

// ---------------------------------------------------------------------------
// Bulk insert parsed CSV rows
// ---------------------------------------------------------------------------

export type RawTransactionRow = {
  invoiceNo: string;
  stockCode: string;
  description: string;
  quantity: number;
  invoiceDate: string;
  unitPrice: number;
  customerId: string;
  country: string;
  totalPrice: number;
  month: number | null;
  year: number | null;
  isReturn: boolean;
};

export async function bulkInsertTransactions(
  importId: string,
  rows: RawTransactionRow[]
): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };

  const client = await pool.connect();
  const BATCH_SIZE = 500;
  let totalInserted = 0;

  try {
    await client.query("BEGIN");

    // Clear any prior rows for this import (re-upload scenario)
    await client.query(
      "DELETE FROM retail_transactions WHERE import_id = $1",
      [importId]
    );

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const row of batch) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );

        values.push(
          importId,
          row.invoiceNo,
          row.stockCode,
          row.description,
          row.quantity,
          row.invoiceDate,
          row.unitPrice,
          row.customerId || null,
          row.country,
          row.totalPrice,
          row.month,
          row.year,
          row.isReturn
        );
      }

      const sql = `
        INSERT INTO retail_transactions (
          import_id, invoice_no, stock_code, description,
          quantity, invoice_date, unit_price, customer_id,
          country, total_price, month, year, is_return
        ) VALUES ${placeholders.join(", ")}
      `;

      await client.query(sql, values);
      totalInserted += batch.length;
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return { inserted: totalInserted };
}

// ---------------------------------------------------------------------------
// Data cleaning
// ---------------------------------------------------------------------------

export type CleaningResult = {
  totalBefore: number;
  removedReturns: number;
  removedBadPrice: number;
  removedNoDescription: number;
  totalAfter: number;
};

export async function cleanTransactionData(
  importId: string
): Promise<CleaningResult> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const { rows: beforeRows } = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM retail_transactions WHERE import_id = $1",
      [importId]
    );
    const totalBefore: number = beforeRows[0].cnt;

    // Count returns/cancellations
    const { rows: returnRows } = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM retail_transactions WHERE import_id = $1 AND is_return = true",
      [importId]
    );
    const removedReturns: number = returnRows[0].cnt;

    // Count bad price rows (zero or negative total_price, excluding returns already counted)
    const { rows: priceRows } = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM retail_transactions WHERE import_id = $1 AND is_return = false AND total_price <= 0",
      [importId]
    );
    const removedBadPrice: number = priceRows[0].cnt;

    // Count empty description rows (excluding above)
    const { rows: descRows } = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM retail_transactions WHERE import_id = $1 AND is_return = false AND total_price > 0 AND (description IS NULL OR TRIM(description) = '')",
      [importId]
    );
    const removedNoDescription: number = descRows[0].cnt;

    // Delete all problematic rows
    await client.query(
      "DELETE FROM retail_transactions WHERE import_id = $1 AND is_return = true",
      [importId]
    );
    await client.query(
      "DELETE FROM retail_transactions WHERE import_id = $1 AND total_price <= 0",
      [importId]
    );
    await client.query(
      "DELETE FROM retail_transactions WHERE import_id = $1 AND (description IS NULL OR TRIM(description) = '')",
      [importId]
    );

    const { rows: afterRows } = await client.query(
      "SELECT COUNT(*)::int AS cnt FROM retail_transactions WHERE import_id = $1",
      [importId]
    );
    const totalAfter: number = afterRows[0].cnt;

    await client.query("COMMIT");

    return {
      totalBefore,
      removedReturns,
      removedBadPrice,
      removedNoDescription,
      totalAfter,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Analytics queries — all use total_price from dataset
// ---------------------------------------------------------------------------

export type KpiResult = {
  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  totalQuantitySold: number;
  totalCustomers: number;
};

export async function getKpis(importId: string): Promise<KpiResult> {
  const { rows } = await pool.query(
    `
    SELECT
      COALESCE(SUM(total_price), 0)::float AS total_revenue,
      COUNT(DISTINCT invoice_no)::int AS total_orders,
      COALESCE(SUM(quantity), 0)::int AS total_quantity,
      COUNT(DISTINCT customer_id)::int AS total_customers
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
    `,
    [importId]
  );

  const totalRevenue = rows[0].total_revenue;
  const totalOrders = rows[0].total_orders;
  const totalQuantitySold = rows[0].total_quantity;
  const totalCustomers = rows[0].total_customers;
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  return { totalRevenue, totalOrders, avgOrderValue, totalQuantitySold, totalCustomers };
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

export type InsightsResult = {
  highestRevenueMonth: string | null;
  highestRevenueCountry: string | null;
  mostSoldProduct: string | null;
  totalCustomers: number;
};

export async function getInsights(importId: string): Promise<InsightsResult> {
  const { rows: monthRows } = await pool.query(
    `
    SELECT
      TO_CHAR(invoice_date, 'YYYY-MM') AS month,
      COALESCE(SUM(total_price), 0)::float AS revenue
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
    GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
    ORDER BY revenue DESC
    LIMIT 1
    `,
    [importId]
  );

  const { rows: countryRows } = await pool.query(
    `
    SELECT
      country,
      COALESCE(SUM(total_price), 0)::float AS revenue
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
      AND country IS NOT NULL
      AND TRIM(country) != ''
    GROUP BY country
    ORDER BY revenue DESC
    LIMIT 1
    `,
    [importId]
  );

  const { rows: productRows } = await pool.query(
    `
    SELECT
      description,
      COALESCE(SUM(quantity), 0)::int AS total_qty
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
      AND description IS NOT NULL
      AND TRIM(description) != ''
    GROUP BY description
    ORDER BY total_qty DESC
    LIMIT 1
    `,
    [importId]
  );

  const { rows: customerRows } = await pool.query(
    `
    SELECT COUNT(DISTINCT customer_id)::int AS total_customers
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
    `,
    [importId]
  );

  return {
    highestRevenueMonth: monthRows.length > 0 ? monthRows[0].month : null,
    highestRevenueCountry: countryRows.length > 0 ? countryRows[0].country : null,
    mostSoldProduct: productRows.length > 0 ? productRows[0].description : null,
    totalCustomers: customerRows[0].total_customers,
  };
}

export type MonthlyRow = {
  month: string;
  revenue: number;
  orders: number;
  quantity: number;
};

export async function getMonthlyPerformance(
  importId: string
): Promise<MonthlyRow[]> {
  const { rows } = await pool.query(
    `
    SELECT
      TO_CHAR(invoice_date, 'YYYY-MM') AS month,
      COALESCE(SUM(total_price), 0)::float AS revenue,
      COUNT(DISTINCT invoice_no)::int AS orders,
      COALESCE(SUM(quantity), 0)::int AS quantity
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
    GROUP BY TO_CHAR(invoice_date, 'YYYY-MM')
    ORDER BY month
    `,
    [importId]
  );

  return rows.map((r) => ({
    month: r.month,
    revenue: r.revenue,
    orders: r.orders,
    quantity: r.quantity,
  }));
}

export type TopProductRow = {
  description: string;
  revenue: number;
  quantity: number;
};

export async function getTopProducts(
  importId: string,
  limit = 10
): Promise<TopProductRow[]> {
  const { rows } = await pool.query(
    `
    SELECT
      description,
      COALESCE(SUM(total_price), 0)::float AS revenue,
      COALESCE(SUM(quantity), 0)::int AS quantity
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
      AND description IS NOT NULL
      AND TRIM(description) != ''
    GROUP BY description
    ORDER BY revenue DESC
    LIMIT $2
    `,
    [importId, limit]
  );

  return rows.map((r) => ({
    description: r.description,
    revenue: r.revenue,
    quantity: r.quantity,
  }));
}

export type CountryRow = {
  country: string;
  revenue: number;
  orders: number;
  percentage: number;
};

export async function getRevenueByCountry(
  importId: string,
  limit = 10
): Promise<CountryRow[]> {
  const { rows } = await pool.query(
    `
    WITH totals AS (
      SELECT SUM(total_price) AS grand_total
      FROM retail_transactions
      WHERE import_id = $1
        AND is_return = false
        AND total_price > 0
    )
    SELECT
      country,
      COALESCE(SUM(total_price), 0)::float AS revenue,
      COUNT(DISTINCT invoice_no)::int AS orders,
      ROUND(
        (SUM(total_price) / NULLIF((SELECT grand_total FROM totals), 0)) * 100,
        1
      )::float AS percentage
    FROM retail_transactions
    WHERE import_id = $1
      AND is_return = false
      AND total_price > 0
    GROUP BY country
    ORDER BY revenue DESC
    LIMIT $2
    `,
    [importId, limit]
  );

  return rows.map((r) => ({
    country: r.country,
    revenue: r.revenue,
    orders: r.orders,
    percentage: r.percentage,
  }));
}
