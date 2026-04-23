/**
 * Convert an array of objects to a CSV string and trigger a browser download.
 * - Escapes commas, quotes, and newlines per RFC 4180.
 * - Accepts an explicit column order; otherwise uses keys of the first row.
 */
export function exportToCsv<T extends Record<string, unknown>>(
  filename: string,
  rows: T[],
  columns?: { key: keyof T & string; label?: string }[],
) {
  if (!rows || rows.length === 0) {
    // Still emit a header-only file when columns are supplied so the user gets feedback
    const headers = columns?.map((c) => c.label ?? c.key) ?? [];
    triggerDownload(filename, headers.join(","));
    return;
  }

  const cols =
    columns ??
    (Object.keys(rows[0]) as (keyof T & string)[]).map((k) => ({ key: k, label: k }));

  const escape = (val: unknown): string => {
    if (val === null || val === undefined) return "";
    const s = typeof val === "string" ? val : typeof val === "object" ? JSON.stringify(val) : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = cols.map((c) => escape(c.label ?? c.key)).join(",");
  const body = rows
    .map((row) => cols.map((c) => escape(row[c.key])).join(","))
    .join("\n");

  triggerDownload(filename, `${header}\n${body}`);
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}