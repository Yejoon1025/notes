import React, { useState, useMemo, useCallback } from "react";

/**
 * ScrollableClickableList
 *
 * Props:
 * - items: Array<Array<any>>  // the component will display items[i][1]
 * - onSelect?: (item: any[], index: number) => void  // called when an item is clicked or activated via keyboard
 * - className?: string  // extra classes for the outer container
 * - itemClassName?: string // extra classes for each row
 * - selectedIndex?: number // (optional) make selection controlled from parent
 * - onSelectedIndexChange?: (index: number) => void // fires when selection changes (controlled usage)
 * - height?: number | string // max height for the scroll area (default 240px)
 * - ariaLabel?: string // accessible label for the list
 *
 * Behavior:
 * - Vertically scrollable container
 * - Clickable rows showing items[i][1]
 * - Keyboard accessible: Up/Down to move, Enter/Space to select
 */
export default function SaveFiles({
  items = [],
  onSelect,
  className = "",
  itemClassName = "",
  selectedIndex: controlledSelectedIndex,
  onSelectedIndexChange,
  height = 240,
  ariaLabel = "Items",
}) {
  const isControlled = typeof controlledSelectedIndex === "number";
  const [uncontrolledIndex, setUncontrolledIndex] = useState(-1);
  const selectedIndex = isControlled ? controlledSelectedIndex : uncontrolledIndex;

  const maxHeightStyle = useMemo(() => ({
    maxHeight: typeof height === "number" ? `${height}px` : height,
  }), [height]);

  const handleSelect = useCallback(
    (idx) => {
      if (!isControlled) setUncontrolledIndex(idx);
      onSelectedIndexChange?.(idx);
      onSelect?.(items[idx], idx);
    },
    [isControlled, onSelectedIndexChange, onSelect, items]
  );

  const handleKeyDown = (e) => {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min((selectedIndex ?? -1) + 1, items.length - 1);
      if (!isControlled) setUncontrolledIndex(next);
      onSelectedIndexChange?.(next);
      const el = document.getElementById(`scl-row-${next}`);
      el?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const prev = Math.max((selectedIndex ?? items.length) - 1, 0);
      if (!isControlled) setUncontrolledIndex(prev);
      onSelectedIndexChange?.(prev);
      const el = document.getElementById(`scl-row-${prev}`);
      el?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (selectedIndex != null && selectedIndex >= 0) {
        handleSelect(selectedIndex);
      }
    }
  };

  return (
    <div
      className={`w-full rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm ${className}`}
      style={maxHeightStyle}
      role="listbox"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <ul className="overflow-y-auto max-h-full divide-y divide-gray-100 dark:divide-gray-800">
        {items.length === 0 && (
          <li className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 select-none">
            No items
          </li>
        )}
        {items.map((row, idx) => {
          const label = row?.[1] != null ? String(row[1]) : "";
          const isSelected = idx === selectedIndex;
          // Prefer a stable key if row[0] looks like a primitive id
          const key = typeof row?.[0] === "string" || typeof row?.[0] === "number" ? row[0] : idx;
          return (
            <li
              id={`scl-row-${idx}`}
              key={key}
              role="option"
              aria-selected={isSelected}
              className={`px-3 py-2 cursor-pointer select-none focus:outline-none transition
                ${isSelected ? "bg-gray-100 dark:bg-gray-800" : "hover:bg-gray-50 dark:hover:bg-gray-900"}
                ${itemClassName}`}
              onClick={() => handleSelect(idx)}
            >
              <span className="block text-sm leading-6 truncate">{label}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}