export interface ScryfallImageUris {
  small?: string;
  normal?: string;
  large?: string;
  art_crop?: string;
}

export interface ScryfallCardFace {
  name: string;
  image_uris?: ScryfallImageUris;
}

export interface ScryfallPrices {
  usd: string | null;
  usd_foil: string | null;
  usd_etched: string | null;
  eur: string | null;
  eur_foil: string | null;
  tix: string | null;
}

export interface ScryfallCard {
  id: string;
  name: string;
  lang: string;
  set: string;
  set_name: string;
  collector_number: string;
  rarity: string;
  released_at: string;
  finishes: string[];
  prices: ScryfallPrices;
  image_uris?: ScryfallImageUris;
  card_faces?: ScryfallCardFace[];
  purchase_uris?: {
    tcgplayer?: string;
    cardmarket?: string;
    cardhoarder?: string;
  };
}

export interface ScryfallList<T> {
  object: "list";
  data: T[];
  has_more?: boolean;
  next_page?: string;
  total_cards?: number;
}

export interface ScryfallCatalog {
  object: "catalog";
  data: string[];
}
