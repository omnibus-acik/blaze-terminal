import { useEffect, useRef } from "react";

interface SearchBarProps {
  value: string;
  matchCount: { resultIndex: number; resultCount: number } | null;
  onChange: (v: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export function SearchBar({
  value,
  matchCount,
  onChange,
  onNext,
  onPrev,
  onClose,
}: SearchBarProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="search-bar" role="search">
      <input
        ref={inputRef}
        className="search-input"
        type="text"
        placeholder="Search scrollback…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          }
        }}
      />
      <span className="search-count">
        {matchCount && matchCount.resultCount > 0
          ? `${matchCount.resultIndex + 1} / ${matchCount.resultCount}`
          : value
            ? "0 / 0"
            : ""}
      </span>
      <button className="search-btn" aria-label="previous match" onClick={onPrev}>
        ↑
      </button>
      <button className="search-btn" aria-label="next match" onClick={onNext}>
        ↓
      </button>
      <button className="search-btn" aria-label="close search" onClick={onClose}>
        ×
      </button>
    </div>
  );
}
