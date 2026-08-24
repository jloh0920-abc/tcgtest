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
