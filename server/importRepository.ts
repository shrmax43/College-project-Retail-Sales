import { pool } from "./db";
import { randomUUID } from "node:crypto";

export type ImportRecord = {
  id: string;
  originalFilename: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: string[];
  status: string;
  createdAt: string;
};

export type ColumnMappingRecord = {
  importId: string;
  sourceColumn: string;
  mappedLabel: string;
  createdAt: string;
  updatedAt: string;
};

export async function ensureImportMetadataTable() {
  await pool.query(`
    create table if not exists dataset_imports (
      id text primary key,
      original_filename text not null,
      file_type text not null,
      mime_type text not null,
      file_size bigint not null,
      row_count integer not null default 0,
      column_count integer not null default 0,
      columns jsonb not null default '[]'::jsonb,
      status text not null default 'Uploaded',
      created_at timestamptz not null default now()
    );
  `);

  await pool.query(`
    alter table dataset_imports
    add column if not exists columns jsonb not null default '[]'::jsonb;
  `);

  await pool.query(`
    create table if not exists dataset_column_mappings (
      id text primary key,
      import_id text not null references dataset_imports(id) on delete cascade,
      source_column text not null,
      mapped_label text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (import_id, source_column)
    );
  `);
}

export async function listImportMetadata(): Promise<ImportRecord[]> {
  const result = await pool.query(`
    select id,
           original_filename,
           file_type,
           mime_type,
           file_size,
           row_count,
           column_count,
           columns,
           status,
           created_at
    from dataset_imports
    order by created_at desc
    limit 10;
  `);

  return result.rows.map(toImportRecord);
}

export async function createImportMetadata(input: {
  originalFilename: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  rowCount: number;
  columnCount: number;
  columns: string[];
}) {
  const result = await pool.query(
    `
      insert into dataset_imports (
        id,
        original_filename,
        file_type,
        mime_type,
        file_size,
        row_count,
        column_count,
        columns,
        status
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'Uploaded')
      returning id,
                original_filename,
                file_type,
                mime_type,
                file_size,
                row_count,
                column_count,
                columns,
                status,
                created_at;
    `,
    [
      randomUUID(),
      input.originalFilename,
      input.fileType,
      input.mimeType,
      input.fileSize,
      input.rowCount,
      input.columnCount,
      JSON.stringify(input.columns)
    ]
  );

  return toImportRecord(result.rows[0]);
}

export async function getImportMetadata(importId: string): Promise<ImportRecord | null> {
  const result = await pool.query(
    `
      select id,
             original_filename,
             file_type,
             mime_type,
             file_size,
             row_count,
             column_count,
             columns,
             status,
             created_at
      from dataset_imports
      where id = $1;
    `,
    [importId]
  );

  if (result.rowCount === 0) {
    return null;
  }

  return toImportRecord(result.rows[0]);
}

export async function listColumnMappings(importId: string): Promise<ColumnMappingRecord[]> {
  const result = await pool.query(
    `
      select import_id,
             source_column,
             mapped_label,
             created_at,
             updated_at
      from dataset_column_mappings
      where import_id = $1
      order by source_column;
    `,
    [importId]
  );

  return result.rows.map(toColumnMappingRecord);
}

export async function replaceColumnMappings(
  importId: string,
  mappings: Array<{ sourceColumn: string; mappedLabel: string }>
) {
  const client = await pool.connect();

  try {
    await client.query("begin");
    await client.query("delete from dataset_column_mappings where import_id = $1", [importId]);

    for (const mapping of mappings) {
      await client.query(
        `
          insert into dataset_column_mappings (
            id,
            import_id,
            source_column,
            mapped_label
          )
          values ($1, $2, $3, $4);
        `,
        [randomUUID(), importId, mapping.sourceColumn, mapping.mappedLabel]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return listColumnMappings(importId);
}

function toImportRecord(row: Record<string, unknown>): ImportRecord {
  return {
    id: String(row.id),
    originalFilename: String(row.original_filename),
    fileType: String(row.file_type),
    mimeType: String(row.mime_type),
    fileSize: Number(row.file_size),
    rowCount: Number(row.row_count),
    columnCount: Number(row.column_count),
    columns: Array.isArray(row.columns) ? row.columns.map(String) : [],
    status: String(row.status),
    createdAt: new Date(String(row.created_at)).toISOString()
  };
}

function toColumnMappingRecord(row: Record<string, unknown>): ColumnMappingRecord {
  return {
    importId: String(row.import_id),
    sourceColumn: String(row.source_column),
    mappedLabel: String(row.mapped_label),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}
