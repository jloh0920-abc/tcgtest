import type { ScryfallCard, ScryfallCatalog, ScryfallList } from "../types/scryfall";

const BASE_URL = "https://api.scryfall.com";

async function scryfallFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 404) {
      throw new Error("No matching cards found.");
    }
    throw new Error(`Scryfall request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function autocompleteCardNames(query: string): Promise<string[]> {
  if (!query.trim()) return [];
  const data = await scryfallFetch<ScryfallCatalog>(
    `/cards/autocomplete?q=${encodeURIComponent(query)}`,
  );
  return data.data;
}

export async function getCardPrintings(exactName: string): Promise<ScryfallCard[]> {
  const query = `!"${exactName}"`;
  const data = await scryfallFetch<ScryfallList<ScryfallCard>>(
    `/cards/search?q=${encodeURIComponent(query)}&unique=prints&order=released&dir=desc`,
  );
  return data.data;
}

export type CardIdentifier =
  | { id: string }
  | { set: string; collector_number: string }
  | { name: string };

interface ScryfallCollectionResponse {
  object: "list";
  not_found: CardIdentifier[];
  data: ScryfallCard[];
}

interface ScryfallErrorResponse {
  object: "error";
  status: number;
  code: string;
  details?: string;
  warnings?: string[];
}

export interface RejectedIdentifier {
  identifier: CardIdentifier;
  reason: string;
}

export interface CollectionLookupResult {
  found: ScryfallCard[];
  notFound: CardIdentifier[];
  rejected: RejectedIdentifier[];
}

const COLLECTION_CHUNK_SIZE = 75;
const COLLECTION_REQUEST_GAP_MS = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isScryfallId(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

async function readScryfallError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as ScryfallErrorResponse;
    const parts = [body.details, ...(body.warnings ?? [])].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  } catch {
    // not JSON — fall through to a generic message
  }
  return `Scryfall returned HTTP ${res.status}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Looks up one chunk (≤75 identifiers). Scryfall rejects an entire batch with
 * HTTP 400 if any single identifier is malformed, so on a 400 we split the chunk
 * and retry each half, narrowing down to the individual bad identifier(s) so
 * every valid row still imports and only the bad ones are reported.
 */
async function lookupChunk(chunk: CardIdentifier[], result: CollectionLookupResult): Promise<void> {
  const res = await fetch(`${BASE_URL}/cards/collection`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ identifiers: chunk }),
  });

  if (res.ok) {
    const data = (await res.json()) as ScryfallCollectionResponse;
    result.found.push(...data.data);
    result.notFound.push(...data.not_found);
    return;
  }

  const reason = await readScryfallError(res);

  if (res.status === 400 && chunk.length > 1) {
    const mid = Math.ceil(chunk.length / 2);
    await delay(COLLECTION_REQUEST_GAP_MS);
    await lookupChunk(chunk.slice(0, mid), result);
    await delay(COLLECTION_REQUEST_GAP_MS);
    await lookupChunk(chunk.slice(mid), result);
    return;
  }

  if (res.status === 400) {
    result.rejected.push({ identifier: chunk[0], reason });
    return;
  }

  // Anything other than a 400 (rate limit, outage, …) is not the file's fault.
  throw new Error(`Scryfall lookup failed: ${reason}`);
}

export async function getCardsByIdentifiers(
  identifiers: CardIdentifier[],
): Promise<CollectionLookupResult> {
  const result: CollectionLookupResult = { found: [], notFound: [], rejected: [] };

  for (let i = 0; i < identifiers.length; i += COLLECTION_CHUNK_SIZE) {
    if (i > 0) await delay(COLLECTION_REQUEST_GAP_MS);
    await lookupChunk(identifiers.slice(i, i + COLLECTION_CHUNK_SIZE), result);
  }

  return result;
}

export async function findClosestCardName(rawText: string): Promise<string | null> {
  const cleaned = rawText.trim();
  if (!cleaned) return null;
  try {
    const card = await scryfallFetch<ScryfallCard>(
      `/cards/named?fuzzy=${encodeURIComponent(cleaned)}`,
    );
    return card.name;
  } catch {
    return null;
  }
}
