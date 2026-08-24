import type { CollectionItem } from "../types/collection";
import { currentUnitPrice } from "./card";

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function collectionToCsv(items: CollectionItem[]): string {
  const header = [
    "Name",
    "Set",
    "Collector Number",
    "Rarity",
    "Foil",
    "Quantity",
    "Unit Price (USD)",
    "Subtotal (USD)",
    "TCGPlayer Link",
  ];
  const rows = items.map((item) => {
    const unitPrice = currentUnitPrice(item);
    return [
      item.name,
      item.setName,
      item.collectorNumber,
      item.rarity,
      item.foil ? "Yes" : "No",
      String(item.qty),
      unitPrice != null ? unitPrice.toFixed(2) : "",
      unitPrice != null ? (unitPrice * item.qty).toFixed(2) : "",
      item.tcgplayerUrl ?? "",
    ];
  });
  return [header, ...rows]
    .map((row) => row.map(escapeCsvField).join(","))
    .join("\n");
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i++;
    } else if (char === ",") {
      row.push(field);
      field = "";
      i++;
    } else if (char === "\r") {
      i++;
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
    } else {
      field += char;
      i++;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
