export interface CollectionItem {
  id: string;
  cardId: string;
  name: string;
  setName: string;
  setCode: string;
  collectorNumber: string;
  rarity: string;
  imageUrl: string | null;
  foil: boolean;
  priceNonfoil: number | null;
  priceFoil: number | null;
  tcgplayerUrl: string | null;
  qty: number;
  addedAt: number;
}
