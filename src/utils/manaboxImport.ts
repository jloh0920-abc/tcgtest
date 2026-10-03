import { parseCsv } from "./csv";
import { isScryfallId, looksLikeSetCode } from "../api/scryfall";
import type { ImportRow } from "../types/import";

// Header names accepted for each field (case-insensitive). Covers ManaBox's
// export, this app's own export (old and new), and common names from other
// collection tools.
const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ["name", "card name", "card"],
  setCode: ["set code", "set_code", "setcode", "edition code", "code"],
  setName: ["set name", "set_name", "setname", "set", "edition", "expansion"],
  collectorNumber: [
    "collector number",
    "collector_number",
    "collector #",
    "collector no",
    "card number",
    "number",
    "no.",
  ],
  scryfallId: ["scryfall id", "scryfall_id", "scryfallid", "scryfall"],
  foil: ["foil", "finish"],
  quantity: ["quantity", "qty", "count", "amount"],
};

function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
}

// "Yes"/"No" (this app's export), "foil"/"normal"/"etched" (ManaBox),
// true/false, 1/0, and finish names like "surge foil" all need to work.
const FOIL_TRUE = new Set(["yes", "y", "true", "1", "foil", "etched"]);
const FOIL_FALSE = new Set(["no", "n", "false", "0", "normal", "nonfoil", "non-foil", "non foil", ""]);

export function parseFoil(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (FOIL_TRUE.has(v)) return true;
  if (FOIL_FALSE.has(v)) return false;
  if (v.includes("non")) return false;
  return v.includes("foil") || v.includes("etched");
}

export interface ParsedImport {
  rows: ImportRow[];
  /** Rows with no usable card info at all (no ID, no set+number, no name). */
  skipped: number;
  /** Rows whose Scryfall ID cell wasn't a valid ID; they fall back to set+number or name. */
  invalidIds: number;
}

export function parseImportCsv(text: string): ParsedImport {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], skipped: 0, invalidIds: 0 };

  const [headerRow, ...dataRows] = table;
  const columns = {
    name: findColumn(headerRow, HEADER_ALIASES.name),
    setCode: findColumn(headerRow, HEADER_ALIASES.setCode),
    setName: findColumn(headerRow, HEADER_ALIASES.setName),
    collectorNumber: findColumn(headerRow, HEADER_ALIASES.collectorNumber),
    scryfallId: findColumn(headerRow, HEADER_ALIASES.scryfallId),
    foil: findColumn(headerRow, HEADER_ALIASES.foil),
    quantity: findColumn(headerRow, HEADER_ALIASES.quantity),
  };

  const cell = (row: string[], col: number) => (col !== -1 ? (row[col] ?? "").trim() : "");

  const rows: ImportRow[] = [];
  let skipped = 0;
  let invalidIds = 0;

  for (const dataRow of dataRows) {
    const name = cell(dataRow, columns.name);
    const rawId = cell(dataRow, columns.scryfallId);
    const collectorNumber = cell(dataRow, columns.collectorNumber);

    // A column labelled "Set" might hold a code ("2XM") or a full name
    // ("Double Masters"), and a "Set code" column might hold a name. Sort each
    // value by what it looks like rather than trusting the header.
    let setCode = "";
    let setName = "";
    for (const value of [cell(dataRow, columns.setCode), cell(dataRow, columns.setName)]) {
      if (!value) continue;
      if (looksLikeSetCode(value)) {
        if (!setCode) setCode = value.toLowerCase();
      } else if (!setName) {
        setName = value;
      }
    }

    // Scryfall rejects a whole batch if any `id` isn't a real UUID, so only
    // keep IDs that look valid; anything else falls back to set+number/name.
    let scryfallId = "";
    if (rawId) {
      if (isScryfallId(rawId)) {
        scryfallId = rawId.toLowerCase();
      } else {
        invalidIds++;
      }
    }

    if (!scryfallId && !((setCode || setName) && collectorNumber) && !name) {
      skipped++;
      continue;
    }

    const quantity = Number.parseInt(cell(dataRow, columns.quantity), 10);

    rows.push({
      name,
      setCode,
      setName,
      collectorNumber,
      scryfallId,
      foil: parseFoil(cell(dataRow, columns.foil)),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    });
  }

  return { rows, skipped, invalidIds };
}
