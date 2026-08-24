import { useEffect, useMemo, useRef, useState } from "react";
import { autocompleteCardNames } from "../api/scryfall";
import { debounce } from "../utils/debounce";

interface SearchBarProps {
  onSelectCard: (name: string) => void;
  externalQuery?: string;
}

export function SearchBar({ onSelectCard, externalQuery }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const requestId = useRef(0);

  const runAutocomplete = useMemo(
    () =>
      debounce(async (value: string) => {
        const thisRequest = ++requestId.current;
        try {
          const names = await autocompleteCardNames(value);
          if (thisRequest === requestId.current) {
            setSuggestions(names);
            setIsOpen(names.length > 0);
          }
        } catch {
          if (thisRequest === requestId.current) {
            setSuggestions([]);
          }
        }
      }, 250),
    [],
  );

  useEffect(() => {
    if (externalQuery === undefined) return;
    setQuery(externalQuery);
    if (externalQuery.trim()) {
      onSelectCard(externalQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalQuery]);

  function handleChange(value: string) {
    setQuery(value);
    setHighlightIndex(-1);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    runAutocomplete(value);
  }

  function selectSuggestion(name: string) {
    setQuery(name);
    setIsOpen(false);
    setSuggestions([]);
    onSelectCard(name);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        selectSuggestion(query.trim());
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const chosen = highlightIndex >= 0 ? suggestions[highlightIndex] : query.trim();
      if (chosen) selectSuggestion(chosen);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="search-bar">
      <input
        type="text"
        value={query}
        placeholder="Type a card name…"
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onBlur={() => setTimeout(() => setIsOpen(false), 150)}
        aria-label="Card name search"
        autoComplete="off"
      />
      {isOpen && (
        <ul className="suggestions" role="listbox">
          {suggestions.map((name, i) => (
            <li
              key={name}
              role="option"
              aria-selected={i === highlightIndex}
              className={i === highlightIndex ? "active" : ""}
              onMouseDown={() => selectSuggestion(name)}
            >
              {name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
