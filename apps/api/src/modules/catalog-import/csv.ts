import { AppError } from "../../shared/errors.js";

/**
 * Parses comma-separated text (RFC 4180): quoted fields may contain commas, line breaks and
 * doubled quotes. A leading byte order mark, as Excel writes, is ignored.
 */
export function parseCsv(text: string): string[][] {
  const input = text.startsWith("\uFEFF") ? text.slice(1) : text;
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;

  for (let i = 0; i < input.length; i++) {
    const char = input[i]!;
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (char === "\n") line++;
        field += char;
      }
    } else if (char === '"' && field === "") {
      quoted = true;
    } else if (char === ",") {
      record.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      line++;
    } else {
      field += char;
    }
  }

  if (quoted) {
    throw new AppError(400, "INVALID_CSV", `A quoted value starting before line ${line} is never closed`);
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function escapeField(value: string) {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: string[][]) {
  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n") + "\r\n";
}
