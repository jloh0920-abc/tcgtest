import { useRef, useState } from "react";
import {
  fetchSetCodeMap,
  getCardsByIdentifiers,
  type CardIdentifier,
} from "../api/scryfall";
import { parseImportCsv } from "../utils/manaboxImport";
import type { CollectionItem } from "../types/collection";
import type { ImportRow } from "../types/import";
import type { ScryfallCard } from "../types/scryfall";
import { getCardImageUrl, getPriceForFinish } from "../utils/card";

interface ImportPanelProps {
  onImport: (items: CollectionItem[]) => void;
}

type ImportStatus = "idle" | "working" | "done" | "error";

/** Most-exact identifier available for a row, or null if the row has nothing usable. */
function toIdentifier(row: ImportRow): CardIdentifier | null {
  if (row.scryfallId) return { id: row.scryfallId };
  if (row.setCode && row.collectorNumber) {
    return { set: row.setCode, collector_number: row.collectorNumber };
  }
  if (row.name && row.setCode) return { name: row.name, set: row.setCode };
  if (row.name) return { name: row.name };
  return null;
}

function isExactIdentifier(identifier: CardIdentifier): boolean {
  return "id" in identifier || "collector_number" in identifier;
}

function buildCollectionItem(card: ScryfallCard, row: ImportRow): CollectionItem {
  return {
    id: crypto.randomUUID(),
    cardId: card.id,
    name: card.name,
    setName: card.set_name,
    setCode: card.set,
    collectorNumber: card.collector_number,
    rarity: card.rarity,
    imageUrl: getCardImageUrl(card),
    foil: row.foil,
    priceNonfoil: getPriceForFinish(card, false),
    priceFoil: getPriceForFinish(card, true),
    tcgplayerUrl: card.purchase_uris?.tcgplayer ?? null,
    qty: row.quantity,
    addedAt: Date.now(),
  };
}

function plural(count: number, singular: string, pluralWord = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralWord}`;
}

export function ImportPanel({ onImport }: ImportPanelProps) {
  const [status, setStatus] = useState<ImportStatus>("idle");
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setStatus("working");
    setMessage("Reading file…");
    try {
      const text = await file.text();
      const { rows, skipped, invalidIds } = parseImportCsv(text);
      if (rows.length === 0) {
        setStatus("error");
        setMessage(
          "Couldn't find any usable rows. Expected columns like Name, Set code (or Set name), Collector number, and Scryfall ID.",
        );
        return;
      }

      // Files that only give the set *name* (this app's older exports, some
      // other tools) need the name translated to Scryfall's set code first.
      const unknownSets = new Set<string>();
      if (rows.some((row) => !row.scryfallId && !row.setCode && row.setName)) {
        setMessage("Looking up set codes on Scryfall…");
        const setCodes = await fetchSetCodeMap();
        for (const row of rows) {
          if (row.scryfallId || row.setCode || !row.setName) continue;
          const code = setCodes.get(row.setName.toLowerCase());
          if (code) row.setCode = code;
          else unknownSets.add(row.setName);
        }
      }

      const identifiers = rows.map(toIdentifier);
      const lookups = identifiers.filter((id): id is CardIdentifier => id !== null);
      setMessage(`Looking up ${plural(lookups.length, "card")} on Scryfall…`);
      const { found, rejected } = await getCardsByIdentifiers(lookups);
      // Rows Scryfall refused outright are reported separately — don't also
      // count them as "couldn't be matched".
      const rejectedKeys = new Set(rejected.map((r) => JSON.stringify(r.identifier)));

      const byId = new Map(found.map((c) => [c.id, c]));
      const bySetNumber = new Map(
        found.map((c) => [`${c.set}:${c.collector_number}`.toLowerCase(), c]),
      );
      const byNameInSet = new Map<string, ScryfallCard>();
      const byName = new Map<string, ScryfallCard>();
      for (const c of found) {
        const nameKey = c.name.toLowerCase();
        if (!byNameInSet.has(`${nameKey}|${c.set}`)) byNameInSet.set(`${nameKey}|${c.set}`, c);
        if (!byName.has(nameKey)) byName.set(nameKey, c);
      }

      function resolveCard(row: ImportRow): ScryfallCard | undefined {
        if (row.scryfallId) {
          const match = byId.get(row.scryfallId);
          if (match) return match;
        }
        if (row.setCode && row.collectorNumber) {
          const match = bySetNumber.get(`${row.setCode}:${row.collectorNumber}`.toLowerCase());
          if (match) return match;
        }
        if (row.name) {
          const nameKey = row.name.toLowerCase();
          return (row.setCode && byNameInSet.get(`${nameKey}|${row.setCode}`)) || byName.get(nameKey);
        }
        return undefined;
      }

      const items: CollectionItem[] = [];
      let unresolved = 0;
      let approximate = 0;
      rows.forEach((row, i) => {
        const identifier = identifiers[i];
        const card = resolveCard(row);
        if (!card) {
          if (!identifier || !rejectedKeys.has(JSON.stringify(identifier))) unresolved++;
          return;
        }
        if (identifier && !isExactIdentifier(identifier)) approximate++;
        items.push(buildCollectionItem(card, row));
      });

      if (items.length > 0) onImport(items);

      const parts = [`Imported ${plural(items.length, "card")}.`];
      if (unresolved > 0) {
        parts.push(`${unresolved} couldn't be matched on Scryfall.`);
      }
      if (unknownSets.size > 0) {
        const names = [...unknownSets].slice(0, 3).join(", ");
        parts.push(
          `${plural(unknownSets.size, "set name wasn't", "set names weren't")} recognized (${names}${unknownSets.size > 3 ? ", …" : ""}).`,
        );
      }
      if (approximate > 0) {
        parts.push(
          `${approximate} matched by name only — the printing (and price) may differ from your copy.`,
        );
      }
      if (rejected.length > 0) {
        // Scryfall tells us exactly why it refused an identifier; show the first reason.
        parts.push(
          `${plural(rejected.length, "row was", "rows were")} rejected by Scryfall (${rejected[0].reason}).`,
        );
      }
      if (invalidIds > 0) {
        parts.push(
          `${plural(invalidIds, "row had", "rows had")} an invalid Scryfall ID and matched by set/number instead.`,
        );
      }
      if (skipped > 0) {
        parts.push(`${plural(skipped, "row")} skipped (missing card info).`);
      }
      setStatus(items.length === 0 ? "error" : "done");
      setMessage(parts.join(" "));
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Import failed.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <div className="import-panel">
      <label className="import-button">
        {status === "working" ? "Importing…" : "Import CSV"}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          disabled={status === "working"}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </label>
      {message && (
        <p className={`hint${status === "error" ? " error" : ""}`}>{message}</p>
      )}
    </div>
  );
}
