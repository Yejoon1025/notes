import { useEffect, useRef, useState } from "react";
import { TextInput } from "./TextInput";
import { Send, Undo2, Redo2 } from "lucide-react";
import * as Links from "../data/Links";
import { DefaultSubmitID,DefaultSubmitTAB } from "../data/Login";

const SHEET_ID = DefaultSubmitID;
const TAB = DefaultSubmitTAB;

export default function Form({
  className,
  style,
  initialContext = "",
  initialContent = "",
  onCtxContentChange,  
}) {
  const divider = "---";
  const initialText = `${initialContext || ""}\n${divider}\n${initialContent || ""}`;

  const [text, setText] = useState(initialText);
  const linkSets = Object.values(Links).filter(
    (arr) => Array.isArray(arr) && arr.length >= 3 && typeof arr[0] === "string"
  );
  const [selectedIdx, setSelectedIdx] = useState(-1);

  const [history, setHistory] = useState([initialText]);
  const [cursor, setCursor] = useState(0);
  const textareaRef = useRef(null);

  const parseCtxContent = (val) => {
    if (val.includes(divider)) {
      const [context, ...rest] = val.split(divider);
      return { ctx: context.trim(), content: rest.join(divider).trim() };
    }
    return { ctx: "", content: val.trim() };
  };


  const pushHistory = (val) => {
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

    // ← NEW: notify parent with latest context/content
    const { ctx, content } = parseCtxContent(val);
    onCtxContentChange?.(ctx, content);
  };

  const handleUndo = () => {
    if (cursor === 0) return;
    const nextCursor = cursor - 1;
    setCursor(nextCursor);
    setText(history[nextCursor]);
    const { ctx, content } = parseCtxContent(history[nextCursor]);
    onCtxContentChange?.(ctx, content);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleRedo = () => {
    if (cursor >= history.length - 1) return;
    const nextCursor = cursor + 1;
    setCursor(nextCursor);
    setText(history[nextCursor]);
    const { ctx, content } = parseCtxContent(history[nextCursor]);
    onCtxContentChange?.(ctx, content);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

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
      ctx = "";
      content = text.trim();
    }

    if (!content) return;

    const chosen = linkSets[selectedIdx];
    const sheetId = chosen?.[1] || SHEET_ID;
    const tab = chosen?.[2] || TAB;
    await TextInput(ctx || "", content, sheetId, tab);

    const cleared = `\n${divider}\n`;
    setText(cleared);
    onCtxContentChange?.("", ""); // notify parent that ctx/content are now empty
    const next = history.slice(0, cursor + 1);
    next.push(cleared);
    setHistory(next);
    setCursor(next.length - 1);
  };

  return (
    <div
      className={className}
      style={{
        fontFamily: "Helvetica, Arial, sans-serif",
        height: "100%",
        ...style,
      }}
    >
      <form onSubmit={handleSubmit} style={{ height: "100%" }}>
        <div style={{ position: "relative", width: "100%", height: "100%" }}>
          {/* Top-left controls */}
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

          {/* Top-center dropdown */}
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
              minHeight: "100%",
              boxSizing: "border-box",
              padding: "16px",
              fontSize: "25px",
              lineHeight: "1.5",
              resize: "none",
              paddingRight: "56px",
              paddingTop: "56px",
              paddingLeft: "56px",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "#eaeef3",
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
              color: "#eaeef3",
            }}
          >
            <Send size={28} />
          </button>
        </div>
      </form>
    </div>
  );
}