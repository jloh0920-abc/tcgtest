import type { CollectionItem } from "../types/collection";
import { collectionToCsv, downloadCsv } from "../utils/csv";
import { currentUnitPrice, formatUsd } from "../utils/card";

interface CollectionProps {
  items: CollectionItem[];
  onUpdateQty: (id: string, qty: number) => void;
  onRemove: (id: string) => void;
  onToggleFoil: (id: string) => void;
  onClear: () => void;
}

export function Collection({ items, onUpdateQty, onRemove, onToggleFoil, onClear }: CollectionProps) {
  const total = items.reduce(
    (sum, item) => sum + (currentUnitPrice(item) ?? 0) * item.qty,
    0,
  );
  const cardCount = items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="collection">
      <div className="collection-header">
        <h2>Your Collection</h2>
        <div className="collection-stats">
          <span>{cardCount} card{cardCount === 1 ? "" : "s"}</span>
          <span className="total">{formatUsd(total)}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="hint">Cards you add will show up here with a running total value.</p>
      ) : (
        <>
          <ul className="collection-list">
            {items.map((item) => (
              <li key={item.id} className="collection-item">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} loading="lazy" />
                ) : (
                  <div className="printing-thumb-placeholder" />
                )}
                <div className="collection-item-info">
                  <div className="collection-item-name">{item.name}</div>
                  <div className="printing-meta">
                    {item.setName} · #{item.collectorNumber}
                  </div>
                  <label className="foil-toggle">
                    <input
                      type="checkbox"
                      checked={item.foil}
                      onChange={() => onToggleFoil(item.id)}
                    />
                    Foil
                  </label>
                </div>
                <div className="collection-item-controls">
                  <div className="qty-control">
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.id, Math.max(1, item.qty - 1))}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span>{item.qty}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateQty(item.id, item.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  <div className="collection-item-price">
                    {formatUsd(
                      currentUnitPrice(item) != null
                        ? (currentUnitPrice(item) as number) * item.qty
                        : null,
                    )}
                  </div>
                  <button
                    type="button"
                    className="remove-btn"
                    onClick={() => onRemove(item.id)}
                    aria-label={`Remove ${item.name}`}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="collection-footer">
            <button
              type="button"
              onClick={() => downloadCsv("magic-collection.csv", collectionToCsv(items))}
            >
              Export CSV
            </button>
            <button type="button" className="danger" onClick={onClear}>
              Clear all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
