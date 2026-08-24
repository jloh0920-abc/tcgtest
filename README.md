# MTG Pricer

A small tool for pricing out a Magic: The Gathering collection before selling. Type a card
name, pick the exact printing (set/version) and finish, and it pulls pricing data from
[Scryfall](https://scryfall.com). No backend, no account, no build step for the user beyond
running it locally.

## Features

- **Type-to-search** with live autocomplete against Scryfall's card database.
- **Every printing** of a card (every set it was ever released in) shown side by side with
  its own price, image, and set/rarity info.
- **Foil toggle** per printing, and per item once it's in your collection list.
- **Collection list** with running total, quantity per card, and CSV import/export for
  record-keeping.
- **Webcam scanning (bonus)**: hold a card up to your webcam, capture, and the app runs OCR
  on the title, then fuzzy-matches it against Scryfall to fill in the search box for you to
  confirm and pick the right printing.

Your collection list is saved to your browser's local storage, so it survives a refresh.

## About pricing: Low vs. Mid

Scryfall's public API only exposes a single USD figure per card/finish (roughly TCGPlayer's
market price) — it does not expose TCGPlayer's Low/Mid/High price tiers, since that
breakdown isn't part of Scryfall's own data. This app shows Scryfall's price as a quick
reference while you sort your collection, and every printing has a **"View on TCGPlayer"**
link straight to that card's real listing, where you can read off the exact Low or Mid price
before you list it.

## Getting started

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

To build for production:

```bash
npm run build
npm run preview
```

## Using the webcam scanner

Click "Scan with webcam", allow camera access, and line up a card's name inside the guide
box (good, even lighting helps a lot). Click Capture — the app crops just that region, runs
OCR on it, and fuzzy-matches the result against Scryfall's card list. If it can't find a
confident match it'll tell you so you can reposition and try again, or just type the name in
manually. The scanner is a convenience layer on top of the same search — it never adds a
card automatically, you still pick the printing and confirm.

The first scan may take a moment since the OCR engine downloads its language data on first
use (cached by the browser after that).

## Importing a CSV

Click **Import CSV** in the collection panel and pick a file exported from ManaBox (or any
CSV with similar columns). It looks for columns named `Name`, `Set code`, `Collector number`,
`Scryfall ID`, `Foil`, and `Quantity` (matching is case-insensitive, and `Set`/`Qty`/`Count`
are accepted too) — extra columns are ignored.

Each row is looked up on Scryfall to pull the current price and image: the Scryfall ID is
used when present (most exact), falling back to set code + collector number, then card name
alone if that's all a row has. Rows that can't be matched are reported rather than silently
dropped, so you'll see a summary like "Imported 38 cards. 2 couldn't be matched on Scryfall."
Imported cards are added as new entries — the app doesn't try to merge them into cards
already in your list, so undo an accidental double-import by removing the duplicates by hand.

## Tech

Vite + React + TypeScript, [Scryfall's REST API](https://scryfall.com/docs/api) for card
data, and [Tesseract.js](https://github.com/naptha/tesseract.js) for in-browser OCR. No
server component — everything runs client-side.
