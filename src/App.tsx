import { useState } from "react";
import { SearchBar } from "./components/SearchBar";
import { PrintingsList } from "./components/PrintingsList";
import { Collection } from "./components/Collection";
import { WebcamScanner } from "./components/WebcamScanner";
import { useLocalStorage } from "./hooks/useLocalStorage";
import type { CollectionItem } from "./types/collection";
import type { ScryfallCard } from "./types/scryfall";
import { getCardImageUrl, getPriceForFinish } from "./utils/card";
import "./App.css";

function App() {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [scannedQuery, setScannedQuery] = useState<string | undefined>(undefined);
  const [items, setItems] = useLocalStorage<CollectionItem[]>("mtg-collection", []);

  function handleAddToCollection(card: ScryfallCard, foil: boolean) {
    const newItem: CollectionItem = {
      id: crypto.randomUUID(),
      cardId: card.id,
      name: card.name,
      setName: card.set_name,
      setCode: card.set,
      collectorNumber: card.collector_number,
      rarity: card.rarity,
      imageUrl: getCardImageUrl(card),
      foil,
      priceNonfoil: getPriceForFinish(card, false),
      priceFoil: getPriceForFinish(card, true),
      tcgplayerUrl: card.purchase_uris?.tcgplayer ?? null,
      qty: 1,
      addedAt: Date.now(),
    };
    setItems((prev) => [newItem, ...prev]);
  }

  function handleUpdateQty(id: string, qty: number) {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, qty } : item)));
  }

  function handleRemove(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function handleToggleFoil(id: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, foil: !item.foil } : item)),
    );
  }

  function handleClear() {
    if (items.length > 0 && !confirm("Clear your entire collection list?")) return;
    setItems([]);
  }

  function handleScannedName(name: string) {
    setScannedQuery(name);
  }

  function handleImport(imported: CollectionItem[]) {
    setItems((prev) => [...imported, ...prev]);
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>MTG Pricer</h1>
        <p>Look up TCGPlayer market pricing from Scryfall while you sort your collection.</p>
      </header>

      <main className="app-main">
        <section className="app-search">
          <SearchBar onSelectCard={setSelectedCard} externalQuery={scannedQuery} />
          <WebcamScanner onNameFound={handleScannedName} />
          <PrintingsList cardName={selectedCard} onAddToCollection={handleAddToCollection} />
        </section>

        <section className="app-collection">
          <Collection
            items={items}
            onUpdateQty={handleUpdateQty}
            onRemove={handleRemove}
            onToggleFoil={handleToggleFoil}
            onClear={handleClear}
            onImport={handleImport}
          />
        </section>
      </main>
    </div>
  );
}

export default App;
