import { parseCsv } from "./csv";
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

export function parseImportCsv(text: string): { rows: ImportRow[]; skipped: number } {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], skipped: 0 };

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

  for (const dataRow of dataRows) {
    const name = cell(dataRow, columns.name);
    const scryfallId = cell(dataRow, columns.scryfallId);
    const setCode = cell(dataRow, columns.setCode).toLowerCase();
    const collectorNumber = cell(dataRow, columns.collectorNumber);

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

  return { rows, skipped };
}
