import type { ScryfallCard } from "../types/scryfall";

export function getCardImageUrl(card: ScryfallCard): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  const face = card.card_faces?.find((f) => f.image_uris?.normal);
  return face?.image_uris?.normal ?? null;
}

export function getCardThumbUrl(card: ScryfallCard): string | null {
  if (card.image_uris?.small) return card.image_uris.small;
  const face = card.card_faces?.find((f) => f.image_uris?.small);
  return face?.image_uris?.small ?? null;
}

export function hasFinish(card: ScryfallCard, finish: "foil" | "nonfoil"): boolean {
  return card.finishes.includes(finish);
}

export function getPriceForFinish(card: ScryfallCard, foil: boolean): number | null {
  const raw = foil ? card.prices.usd_foil : card.prices.usd;
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function currentUnitPrice(item: {
  foil: boolean;
  priceNonfoil: number | null;
  priceFoil: number | null;
}): number | null {
  return item.foil ? item.priceFoil : item.priceNonfoil;
}

export function formatUsd(value: number | null): string {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
}
