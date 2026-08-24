import { useEffect, useState } from "react";
import { getCardPrintings } from "../api/scryfall";
import type { ScryfallCard } from "../types/scryfall";
import { formatUsd, getCardThumbUrl, getPriceForFinish, hasFinish } from "../utils/card";

interface PrintingsListProps {
  cardName: string | null;
  onAddToCollection: (card: ScryfallCard, foil: boolean) => void;
}

export function PrintingsList({ cardName, onAddToCollection }: PrintingsListProps) {
  const [printings, setPrintings] = useState<ScryfallCard[]>([]);
  const [foilByCard, setFoilByCard] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!cardName) {
      setPrintings([]);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    getCardPrintings(cardName)
      .then((cards) => {
        if (cancelled) return;
        setPrintings(cards);
        setStatus("idle");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setErrorMessage(err.message);
        setStatus("error");
        setPrintings([]);
      });
    return () => {
      cancelled = true;
    };
  }, [cardName]);

  function toggleFoil(cardId: string) {
    setFoilByCard((prev) => ({ ...prev, [cardId]: !prev[cardId] }));
  }

  if (!cardName) {
    return (
      <div className="printings-empty">
        Search for a card above to see every printing and its price.
      </div>
    );
  }

  if (status === "loading") {
    return <div className="printings-empty">Loading printings for “{cardName}”…</div>;
  }

  if (status === "error") {
    return <div className="printings-empty error">{errorMessage}</div>;
  }

  return (
    <div className="printings-list">
      <h2>{cardName}</h2>
      <p className="hint">
        Prices are Scryfall's TCGPlayer market price (not a Low/Mid breakdown — Scryfall's
        public API doesn't expose price tiers). Use the TCGPlayer link on each row to see the
        exact Low/Mid price before you list a card.
      </p>
      <div className="printings-grid">
        {printings.map((card) => {
          const foilAvailable = hasFinish(card, "foil");
          const nonfoilAvailable = hasFinish(card, "nonfoil");
          const isFoil = foilByCard[card.id] ?? false;
          const effectiveFoil = isFoil && foilAvailable;
          const price = getPriceForFinish(card, effectiveFoil);
          const thumb = getCardThumbUrl(card);

          return (
            <div className="printing-card" key={card.id}>
              {thumb ? (
                <img src={thumb} alt={`${card.name} — ${card.set_name}`} loading="lazy" />
              ) : (
                <div className="printing-thumb-placeholder" />
              )}
              <div className="printing-info">
                <div className="printing-set" title={card.set_name}>
                  {card.set_name}
                </div>
                <div className="printing-meta">
                  #{card.collector_number} · {card.rarity}
                </div>

                <label className="foil-toggle">
                  <input
                    type="checkbox"
                    checked={effectiveFoil}
                    disabled={!foilAvailable}
                    onChange={() => toggleFoil(card.id)}
                  />
                  Foil {!foilAvailable && "(not printed)"}
                </label>

                <div className="printing-price">{formatUsd(price)}</div>

                <div className="printing-actions">
                  <button
                    type="button"
                    disabled={!nonfoilAvailable && !foilAvailable}
                    onClick={() => onAddToCollection(card, effectiveFoil)}
                  >
                    Add to collection
                  </button>
                  {card.purchase_uris?.tcgplayer && (
                    <a
                      href={card.purchase_uris.tcgplayer}
                      target="_blank"
                      rel="noreferrer noopener"
                    >
                      View on TCGPlayer ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
