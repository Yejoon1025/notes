import { useEffect, useRef, useState } from "react";
import { TextInput } from "./Components/TextInput";
import { Send, Undo2, Redo2 } from "lucide-react";
import * as Links from "./Links"

const SHEET_ID = "1-YqJWBVk2aV88ZYN-WVge9d-jLrCmZEg8rc5eDNYdQg"; // e.g. 1abcDEF... from the sheet URL
const TAB = "Sheet1"; // change if your tab name differs

export default function Form() {
  const divider = "---";
  const initialText = `\n${divider}\n`;

  const [text, setText] = useState(initialText);

  // --- Link sets & selection ---
  const linkSets = Object.values(Links).filter(
    (arr) => Array.isArray(arr) && arr.length >= 3 && typeof arr[0] === "string"
  );
  const [selectedIdx, setSelectedIdx] = useState(-1); // -1 = default (use SHEET_ID/TAB)

  // --- Undo / Redo history ---
  const [history, setHistory] = useState([initialText]);
  const [cursor, setCursor] = useState(0); // index into history

  const textareaRef = useRef(null);

  const pushHistory = (val) => {
    // Avoid duplicating when no change
    if (history[cursor] === val) return;
    const next = history.slice(0, cursor + 1);
    next.push(val);
    setHistory(next);
    setCursor(next.length - 1);
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    pushHistory(val);
  };

  const handleUndo = () => {
    if (cursor === 0) return;
    const nextCursor = cursor - 1;
    setCursor(nextCursor);
    setText(history[nextCursor]);
    // restore focus for nicer UX
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleRedo = () => {
    if (cursor >= history.length - 1) return;
    const nextCursor = cursor + 1;
    setCursor(nextCursor);
    setText(history[nextCursor]);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // Keyboard shortcuts: Ctrl/Cmd+Z (undo) and Ctrl+Y / Cmd+Shift+Z (redo)
  const handleKeyDown = (e) => {
    const isMod = e.ctrlKey || e.metaKey;
    if (!isMod) return;

    if (e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey)) {
      e.preventDefault();
      handleRedo();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let ctx = "";
    let content = "";

    if (text.includes(divider)) {
      const [context, ...rest] = text.split(divider);
      ctx = context.trim();
      content = rest.join(divider).trim();
    } else {
      // No divider provided: treat entire input as content and context as empty
      ctx = "";
      content = text.trim();
    }

    if (!content) return; // require some content to submit

    // Use selected link's sheetId/tab if chosen, else fall back to constants
    const chosen = linkSets[selectedIdx];
    const sheetId = chosen?.[1] || SHEET_ID;
    const tab = chosen?.[2] || TAB;
    await TextInput(ctx || "", content, sheetId, tab);

    const cleared = `\n${divider}\n`;
    setText(cleared);
    // keep previous history so user can undo to retrieve what they sent if desired
    const next = history.slice(0, cursor + 1);
    next.push(cleared);
    setHistory(next);
    setCursor(next.length - 1);
  };

  return (
    <div style={{ fontFamily: "Helvetica, Arial, sans-serif" }}>
      <form onSubmit={handleSubmit}>
        {/* Fixed wrapper: sized to the viewport with 4px margins, centered */}
        <div
          style={{
            position: "fixed",
            top: 4,
            bottom: 4,
            left: "50%",
            transform: "translateX(-50%)",
            height: "calc(100vh - 8px)",
            width: "min(calc(100vw - 8px), calc((100vh - 8px) * 0.707))", // A4 width if wide
          }}
        >
          {/* Top-left controls (Undo / Redo) */}
          <div
            style={{
              position: "absolute",
              left: 16,
              top: 16,
              display: "flex",
              gap: 8,
              zIndex: 2,
            }}
          >
            <button
              type="button"
              onClick={handleUndo}
              aria-label="Undo"
              disabled={cursor === 0}
              title="Undo (Ctrl/Cmd+Z)"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: "transparent",
                border: "none",
                cursor: cursor === 0 ? "not-allowed" : "pointer",
                opacity: cursor === 0 ? 0.4 : 1,
              }}
            >
              <Undo2 size={22} />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              aria-label="Redo"
              disabled={cursor >= history.length - 1}
              title="Redo (Ctrl+Y / Cmd+Shift+Z)"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                background: "transparent",
                border: "none",
                cursor: cursor >= history.length - 1 ? "not-allowed" : "pointer",
                opacity: cursor >= history.length - 1 ? 0.4 : 1,
              }}
            >
              <Redo2 size={22} />
            </button>
          </div>

          {/* Top-center dropdown between icons */}
          <div
            style={{
              position: "absolute",
              top: 20,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 2,
            }}
          >
            <select
              value={selectedIdx}
              onChange={(e) => setSelectedIdx(Number(e.target.value))}
              title="Select Notebook"
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                fontSize: 14,
                maxWidth: "60vw",
                border: "none",
                outline: "none",
                boxShadow: "none",
                textAlignLast: "center",
              }}
            >
              <option value={-1} style={{ textAlign: "left" }}></option>
              {linkSets.map((arr, i) => (
                <option key={i} value={i} style={{ textAlign: "left" }}>
                  {arr[0]}
                </option>
              ))}
            </select>
          </div>

          <textarea
            ref={textareaRef}
            name="text"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            required
            style={{
              display: "block",
              width: "100%",
              height: "100%",
              boxSizing: "border-box",
              padding: "16px",
              fontSize: "25px",
              lineHeight: "1.5",
              resize: "none",
              paddingRight: "56px", // space for Send button
              paddingTop: "56px", // space for Send button
              paddingLeft: "56px", // space for Undo/Redo icons
            }}
          />

          <button
            type="submit"
            aria-label="Submit"
            style={{
              position: "absolute",
              right: "16px",
              top: "16px",
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <Send size={28} />
          </button>
        </div>
      </form>
    </div>
  );
}


-- last stable