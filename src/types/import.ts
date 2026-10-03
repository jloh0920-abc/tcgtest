export interface ImportRow {
  name: string;
  /** Scryfall set code (e.g. "2xm"), lowercased. Empty if the file only had a set name. */
  setCode: string;
  /** Full set name (e.g. "Double Masters"), used to look up the code when none is given. */
  setName: string;
  collectorNumber: string;
  scryfallId: string;
  foil: boolean;
  quantity: number;
}
