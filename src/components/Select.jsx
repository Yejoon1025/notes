import React, { useMemo, useState, useEffect } from "react";

// Accept any row structure. By default we assume [tempid, context, content]
export default function Select({
  items = [],                         // <-- dynamic rows come in here
  onSelect,                           // function (index, row)
  getLabel = (row) => String(row?.[1] ?? ""), // default label = context
  getKey   = (row, i) => String(row?.[0] ?? i),
  emptyText = "No items",
  autoFocus = true,                   // UX nicety
}) {
  const [q, setQ] = useState("");

  // Filter by label (optional but handy)
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((row) => getLabel(row).toLowerCase().includes(needle));
  }, [items, q, getLabel]);

  // Autofocus search input when Select opens
  const inputRef = React.useRef(null);
  useEffect(() => { if (autoFocus && inputRef.current) inputRef.current.focus(); }, [autoFocus]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Search bar (optional) */}
      <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          style={{
            width: "80%",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            padding: "8px 10px",
            color: "#e8edf3",
            outline: "none"
          }}
        />
      </div>

      {/* List */}
      <div style={{ overflowY: "auto", padding: 8, flex: 1, scrollbarWidth: "none"}}>
        {filtered.length === 0 ? (
          <div style={{ opacity: 0.7, padding: 12 }}>{emptyText}</div>
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {filtered.map((row, i) => (
              <li key={getKey(row, i)} style={{ marginBottom: 6 }}>
                <button
                  onClick={() => onSelect?.(i, row)}
                  style={{
                    width: "80%",
                    textAlign: "left",
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "transparent",
                    background: "transparent",
                    color: "#e8edf3",
                    cursor: "pointer"
                  }}
                >
                  {getLabel(row, i)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
