import type { ScryfallCard, ScryfallCatalog, ScryfallList } from "../types/scryfall";

const BASE_URL = "https://api.scryfall.com";

const NETWORK_ERROR_MESSAGE =
  "Couldn't reach Scryfall — a network error, ad blocker, or rate limit got in the way. Wait a minute and try again.";

async function scryfallFetch<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    // fetch() itself rejecting (as opposed to an HTTP error) means the browser
    // never got a usable response: offline, blocked, or a CORS-less error page.
    throw new Error(NETWORK_ERROR_MESSAGE);
  }
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
  | { name: string; set: string }
  | { name: string };

// Scryfall set codes are 3–5 letters/digits ("lea", "2xm", "plst", "plg21").
// Anything longer or with spaces/punctuation is a set *name*, not a code.
const SET_CODE_PATTERN = /^[a-z0-9]{3,5}$/i;

export function looksLikeSetCode(value: string): boolean {
  return SET_CODE_PATTERN.test(value.trim());
}

interface ScryfallSet {
  code: string;
  name: string;
  set_type: string;
  card_count: number;
  digital?: boolean;
}

// When two sets share a name, prefer the real paper set over tokens/promos/digital.
function setPreference(set: ScryfallSet): number {
  let score = set.card_count ?? 0;
  if (["token", "memorabilia", "minigame"].includes(set.set_type)) score -= 100_000;
  if (set.digital) score -= 50_000;
  return score;
}

let setCodeMapPromise: Promise<Map<string, string>> | null = null;

/** Lowercased set name → set code, from Scryfall's full set list. Fetched once and cached. */
export function fetchSetCodeMap(): Promise<Map<string, string>> {
  if (!setCodeMapPromise) {
    setCodeMapPromise = (async () => {
      const list = await scryfallFetch<ScryfallList<ScryfallSet>>("/sets");
      const best = new Map<string, ScryfallSet>();
      for (const set of list.data) {
        const key = set.name.trim().toLowerCase();
        const current = best.get(key);
        if (!current || setPreference(set) > setPreference(current)) best.set(key, set);
      }
      return new Map([...best].map(([name, set]) => [name, set.code.toLowerCase()]));
    })().catch((err: unknown) => {
      setCodeMapPromise = null; // let a later import retry after a transient failure
      throw err;
    });
  }
  return setCodeMapPromise;
}

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
// A well-formed file needs ceil(rows / 75) requests. The cap only bites when a
// file is so malformed that splitting failed batches would snowball into
// hundreds of requests and get the browser rate-limited by Scryfall.
const MAX_REQUESTS_PER_IMPORT = 80;
const MAX_RATE_LIMIT_RETRIES = 2;

interface RequestBudget {
  remaining: number;
}

async function postCollection(chunk: CardIdentifier[], budget: RequestBudget): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    if (budget.remaining <= 0) {
      throw new Error(
        "This file needed too many lookups — it may be in a format the importer doesn't recognize. Check the column headers (Name, Set code or Set name, Collector number, Scryfall ID) and try again.",
      );
    }
    budget.remaining--;

    let res: Response;
    try {
      res = await fetch(`${BASE_URL}/cards/collection`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ identifiers: chunk }),
      });
    } catch {
      throw new Error(NETWORK_ERROR_MESSAGE);
    }

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterSeconds = Number(res.headers.get("Retry-After"));
      const waitMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : 1500;
      await delay(Math.min(waitMs, 5000));
      continue;
    }
    return res;
  }
}

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
async function lookupChunk(
  chunk: CardIdentifier[],
  result: CollectionLookupResult,
  budget: RequestBudget,
): Promise<void> {
  const res = await postCollection(chunk, budget);

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
    await lookupChunk(chunk.slice(0, mid), result, budget);
    await delay(COLLECTION_REQUEST_GAP_MS);
    await lookupChunk(chunk.slice(mid), result, budget);
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
  const budget: RequestBudget = { remaining: MAX_REQUESTS_PER_IMPORT };

  for (let i = 0; i < identifiers.length; i += COLLECTION_CHUNK_SIZE) {
    if (i > 0) await delay(COLLECTION_REQUEST_GAP_MS);
    await lookupChunk(identifiers.slice(i, i + COLLECTION_CHUNK_SIZE), result, budget);
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
