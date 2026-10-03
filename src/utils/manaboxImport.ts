import { parseCsv } from "./csv";
import { isScryfallId } from "../api/scryfall";
import type { ImportRow } from "../types/import";

const HEADER_ALIASES: Record<keyof ImportRow, string[]> = {
  name: ["name", "card name"],
  setCode: ["set code", "set"],
  collectorNumber: ["collector number", "collector #", "number"],
  scryfallId: ["scryfall id", "scryfallid"],
  foil: ["foil"],
  quantity: ["quantity", "qty", "count"],
};

function findColumn(headers: string[], aliases: string[]): number {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const alias of aliases) {
    const idx = normalized.indexOf(alias);
    if (idx !== -1) return idx;
  }
  return -1;
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
    const setCode = cell(dataRow, columns.setCode).toLowerCase();
    const collectorNumber = cell(dataRow, columns.collectorNumber);

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

    if (!scryfallId && !(setCode && collectorNumber) && !name) {
      skipped++;
      continue;
    }

    const foilRaw = cell(dataRow, columns.foil).toLowerCase();
    const quantity = Number.parseInt(cell(dataRow, columns.quantity), 10);

    rows.push({
      name,
      setCode,
      collectorNumber,
      scryfallId,
      foil: foilRaw.includes("foil"),
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
    });
  }

  return { rows, skipped, invalidIds };
}
