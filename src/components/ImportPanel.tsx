import { useRef, useState } from "react";
import { getCardsByIdentifiers, type CardIdentifier } from "../api/scryfall";
import { parseImportCsv } from "../utils/manaboxImport";
import type { CollectionItem } from "../types/collection";
import type { ImportRow } from "../types/import";
import type { ScryfallCard } from "../types/scryfall";
import { getCardImageUrl, getPriceForFinish } from "../utils/card";

interface ImportPanelProps {
  onImport: (items: CollectionItem[]) => void;
}

type ImportStatus = "idle" | "working" | "done" | "error";

function toIdentifier(row: ImportRow): CardIdentifier {
  if (row.scryfallId) return { id: row.scryfallId };
  if (row.setCode && row.collectorNumber) {
    return { set: row.setCode, collector_number: row.collectorNumber };
  }
  return { name: row.name };
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
          "Couldn't find any usable rows. Expected columns like Name, Set code, Collector number, and Scryfall ID.",
        );
        return;
      }

      setMessage(`Looking up ${rows.length} card${rows.length === 1 ? "" : "s"} on Scryfall…`);
      const identifiers = rows.map(toIdentifier);
      const { found, rejected } = await getCardsByIdentifiers(identifiers);
      // Rows Scryfall refused outright are reported separately — don't also
      // count them as "couldn't be matched".
      const rejectedKeys = new Set(rejected.map((r) => JSON.stringify(r.identifier)));

      const byId = new Map(found.map((c) => [c.id, c]));
      const bySetNumber = new Map(
        found.map((c) => [`${c.set}:${c.collector_number}`.toLowerCase(), c]),
      );
      const byName = new Map<string, ScryfallCard>();
      for (const c of found) {
        const key = c.name.toLowerCase();
        if (!byName.has(key)) byName.set(key, c);
      }

      function resolveCard(row: ImportRow): ScryfallCard | undefined {
        if (row.scryfallId) {
          const byIdMatch = byId.get(row.scryfallId);
          if (byIdMatch) return byIdMatch;
        }
        if (row.setCode && row.collectorNumber) {
          const bySetMatch = bySetNumber.get(
            `${row.setCode}:${row.collectorNumber}`.toLowerCase(),
          );
          if (bySetMatch) return bySetMatch;
        }
        if (row.name) return byName.get(row.name.toLowerCase());
        return undefined;
      }

      const items: CollectionItem[] = [];
      let unresolved = 0;
      rows.forEach((row, i) => {
        const card = resolveCard(row);
        if (!card) {
          if (!rejectedKeys.has(JSON.stringify(identifiers[i]))) unresolved++;
          return;
        }
        items.push(buildCollectionItem(card, row));
      });

      if (items.length > 0) onImport(items);

      const parts = [`Imported ${items.length} card${items.length === 1 ? "" : "s"}.`];
      if (unresolved > 0) {
        parts.push(`${unresolved} couldn't be matched on Scryfall.`);
      }
      if (rejected.length > 0) {
        // Scryfall tells us exactly why it refused an identifier; show the first reason.
        parts.push(
          `${rejected.length} row${rejected.length === 1 ? " was" : "s were"} rejected by Scryfall (${rejected[0].reason}).`,
        );
      }
      if (invalidIds > 0) {
        parts.push(
          `${invalidIds} row${invalidIds === 1 ? " had" : "s had"} an invalid Scryfall ID and matched by set/number instead.`,
        );
      }
      if (skipped > 0) {
        parts.push(`${skipped} row${skipped === 1 ? "" : "s"} skipped (missing card info).`);
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
