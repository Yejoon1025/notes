import { useEffect, useMemo, useState } from "react";
// If your Interface lives in ./Components, keep this import.
// If it lives beside this file, change to: import Interface from "./Interface";
import Interface from "../components/Interface.jsx";
import { Plus, X, FileDown, Save, FolderSearch, Check, Menu } from "lucide-react"; // +Menu for mobile open
import { exportEntries, primeAuth, NewSave, updateEntryByTempID, deleteEmpty } from "../components/Saving.jsx";
import Select from "../components/Select.jsx";
import { TempSaveID,TempSaveTAB,PermSaveID,PermSaveTAB } from "../data/Login.js";

const Load_ID = TempSaveID;
const Load_TAB = TempSaveTAB;

const FILE_ID = PermSaveID;
const FILE_TAB = PermSaveTAB;

// Choose target sheet/tab based on section
const getTargetSheetTab = (section) =>
  section === "perm"
    ? { sheet: FILE_ID, tab: FILE_TAB }
    : { sheet: Load_ID, tab: Load_TAB };

function uid() {
  return (crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2));
}

// Editor matches original size (desktop). Mobile overrides to full width.
const CARD_W = "min(calc(100vw - 8px), calc((100vh - 8px) * 0.707))";
const CARD_H = "calc(100vh - 8px)";

const LEFT_RAIL_W = 156; // desktop tabs column width (kept for aesthetics)
const RIGHT_RAIL_W = 0;  // + / load column
const GAP = 8;
const MOBILE_BP = 900;    // px breakpoint
const DRAWER_W = 264;     // mobile drawer width (roomier for touch)
const EDGE_GRAB_W = 28;   // px edge zone to start swipe-open

function attachSaveHotkey(saveFn) {
  if (typeof window === "undefined" || typeof saveFn !== "function") {
    return () => {};
  }

  const handler = (e) => {
    // Ctrl+S (Win/Linux) or Cmd+S (Mac)
    const isS = String(e.key || "").toLowerCase() === "s";
    if (!isS) return;
    if (!(e.ctrlKey || e.metaKey)) return;

    e.preventDefault();
    e.stopPropagation();
    saveFn();
  };

  window.addEventListener("keydown", handler, { capture: true });
  return () => window.removeEventListener("keydown", handler, { capture: true });
}

function useIsMobile(bp = MOBILE_BP) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= bp : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= bp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return isMobile;
}

export default function NotebookTabsPage() {
  // ⚠️ No initial auto-load. Start with a single empty tab IN THE STORE/NEW SECTION.
  const fallback = useMemo(
    () => [{ id: uid(), title: "Tab 1", context: "", content: "", tempid: null, savedAck: false }],
    []
  );

  // Two sections
  const [permTabs, setPermTabs] = useState([]);     // from loadFromPermanent (FILE_ID / FILE_TAB)
  const [storeTabs, setStoreTabs] = useState(fallback); // from loadFromStore (+ new tabs)
  const [activeId, setActiveId] = useState(fallback[0].id);

  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // --- Select overlay state (unchanged) ---
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const openSelect  = () => setIsSelectOpen(true);
  const closeSelect = () => setIsSelectOpen(false);
  const [selectRows,setSelectRows] = useState([[1,'a','b']]);

  // Replace your current handleSelectPick with this (unchanged logic):
  const handleSelectPick = (_idx, row) => {
    const [tempid, context, content] = Array.isArray(row) ? row : [];
    const idNum = Number(tempid);

    // Ignore bad rows
    if (idNum === -10){}
    else if(!Number.isFinite(idNum) || idNum <= 0) {
    closeSelect();
    return;
    }

    // If that tempid already exists in permanent, just focus it
    const existingIdx = permTabs.findIndex(t => Number(t.tempid) === idNum);
    if (existingIdx !== -1) {
      const existingId = permTabs[existingIdx].id;
      setActiveId(existingId);
      closeSelect();
      return;
    }

    // Add exactly one new tab to the permanent section
    const newTab = {
      id: uid(),
      title: String(context || `Entry ${idNum}`),
      tempid: idNum,
      context: String(context || ""),
      content: String(content || ""),
      sheet: FILE_ID,
      tab: FILE_TAB,
      savedAck: false,
    };

    setPermTabs(prev => [newTab, ...prev]);
    setActiveId(newTab.id);
    closeSelect();
  };

  // Active tab resolver (from either section)
  const getTabById = (id) => {
    let idx = permTabs.findIndex(t => t.id === id);
    if (idx !== -1) return { tab: permTabs[idx], section: "perm", index: idx };
    idx = storeTabs.findIndex(t => t.id === id);
    if (idx !== -1) return { tab: storeTabs[idx], section: "store", index: idx };
    return null;
  };
  const activeRef = getTabById(activeId);
  const activeTab = activeRef?.tab ?? null;

  // Utility: move within array
  const moveItem = (arr, from, to) => {
    const copy = [...arr];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  };

  // Drag state (scoped by section)
  const [dragId, setDragId] = useState(null);
  const [dragSection, setDragSection] = useState(null); // "perm" | "store"
  const [dragOver, setDragOver] = useState({ id: null, section: null, pos: null }); // pos: "before" | "after"

  const addTab = () => {
    const n = storeTabs.length + 1;
    const t = { id: uid(), title: `Tab ${n}`, context: "", content: "", tempid: null, savedAck: false };
    setStoreTabs(prev => [...prev, t]);
    setActiveId(t.id);
  };

  // ---------- Loaders ----------
  // STORE loader: de-dupe within storeTabs ONLY
  const loadFromStore = async () => {
    try { await primeAuth(); } catch (e) { console.warn(e); }
    let sheet = Load_ID, tabName = Load_TAB;
    if (!sheet || !tabName) {
      sheet = window.prompt("Google Sheet ID to import from:");
      tabName = window.prompt("Tab name (worksheet) to import from:");
      if (!sheet || !tabName) return;
    }

    const rows = await exportEntries(sheet, tabName);
    if (!Array.isArray(rows) || rows.length === 0) return;

    const existingTempIds = new Set(
      storeTabs.map(t => Number(t.tempid)).filter(n => Number.isFinite(n) && n > 0)
    );

    const additions = [];
    for (const [tempid, context, content] of rows) {
      const idNum = Number(tempid);
      if (!Number.isFinite(idNum) || idNum <= 0) continue;
      if (existingTempIds.has(idNum)) continue;
      existingTempIds.add(idNum);

      additions.push({
        id: uid(),
        title: String(context || `Entry ${idNum}`),
        tempid: idNum,
        context: context || "",
        content: content || "",
        sheet,
        tab: tabName,
        savedAck: false,
      });
    }
    if (additions.length) setStoreTabs(prev => [...prev, ...additions]);
  };

  // PERMANENT loader -> open Select overlay with the fetched rows
  const loadFromPermanent = async () => {
    try { await primeAuth(); } catch (e) { console.warn(e); }
    let sheet = FILE_ID, tabName = FILE_TAB;
    if (!sheet || !tabName) {
      sheet = window.prompt("Google Sheet ID to import from:");
      tabName = window.prompt("Tab name (worksheet) to import from:");
      if (!sheet || !tabName) return;
    }

    const rows = await exportEntries(sheet, tabName);

    const additionalRows = [[-10,"Add New Tab", ""]];

      const combinedRows = Array.isArray(rows) ? [...rows, ...additionalRows] : [...additionalRows];

    // Set the state
    setSelectRows(combinedRows);
    openSelect();
  };

  // ---------- Save / Close ----------
  const markSavedAck = (id, val) => {
    const loc = getTabById(id);
    if (!loc) return;
    if (loc.section === "perm") {
      setPermTabs(prev => prev.map(tt => (tt.id === id ? { ...tt, savedAck: val } : tt)));
    } else {
      setStoreTabs(prev => prev.map(tt => (tt.id === id ? { ...tt, savedAck: val } : tt)));
    }
  };

  const closeStore = async (id) => {
    try { await primeAuth(); } catch (e) { console.warn(e); }
    const loc = getTabById(id);
    if (!loc) return;
    const t = loc.tab;

    const { sheet: targetSheet, tab: targetTab } = getTargetSheetTab(loc.section);

    if (t.tempid != null) {
      const tryUpdate = await updateEntryByTempID(
        t.tempid,
        t.context ?? "",
        t.content ?? "",
        targetSheet,
        targetTab
      );
      if (tryUpdate) {
        markSavedAck(id, true);
        return;
      }
    }

    const newId = await NewSave(t.context ?? "", t.content ?? "", targetSheet, targetTab);
    if (Number.isFinite(newId)) {
      if (loc.section === "perm") {
        setPermTabs(prev =>
          prev.map(tt =>
            tt.id === id ? { ...tt, tempid: newId, sheet: targetSheet, tab: targetTab, savedAck: true } : tt
          )
        );
      } else {
        setStoreTabs(prev =>
          prev.map(tt =>
            tt.id === id ? { ...tt, tempid: newId, sheet: targetSheet, tab: targetTab, savedAck: true } : tt
          )
        );
      }
    }
  };

  const saveActiveToStore = async () => {
    if (!activeTab) return;
    try { await primeAuth(); } catch (e) { console.warn(e); }

    const { sheet: targetSheet, tab: targetTab } = getTargetSheetTab(activeRef.section);

    if (activeTab.tempid != null) {
      const ok = await updateEntryByTempID(
        activeTab.tempid,
        activeTab.context ?? "",
        activeTab.content ?? "",
        targetSheet,
        targetTab
      );
      if (ok) {
        markSavedAck(activeId, true);
        return;
      }
    }

    const newId = await NewSave(activeTab.context ?? "", activeTab.content ?? "", targetSheet, targetTab);
    if (Number.isFinite(newId)) {
      if (activeRef.section === "perm") {
        setPermTabs(prev =>
          prev.map(tt =>
            tt.id === activeId ? { ...tt, tempid: newId, sheet: targetSheet, tab: targetTab, savedAck: true } : tt
          )
        );
      } else {
        setStoreTabs(prev =>
          prev.map(tt =>
            tt.id === activeId ? { ...tt, tempid: newId, sheet: targetSheet, tab: targetTab, savedAck: true } : tt
          )
        );
      }
    }
  };

  useEffect(() => attachSaveHotkey(saveActiveToStore), [saveActiveToStore]);

  const closeTab = async (id) => {
    const total = permTabs.length + storeTabs.length;
    if (total === 1) return;

    // autosave to store before closing
    await closeStore(id);

    // compute neighbor from current overall order (perm first, then store)
    const allTabs = [...permTabs, ...storeTabs];
    const idx = allTabs.findIndex(t => t.id === id);
    const neighborId = (idx > 0 ? allTabs[idx - 1]?.id : allTabs[1]?.id) ?? allTabs[0]?.id;

    // remove from its section
    const loc = getTabById(id);
    if (loc?.section === "perm") {
      setPermTabs(prev => prev.filter(t => t.id !== id));
    } else if (loc?.section === "store") {
      setStoreTabs(prev => prev.filter(t => t.id !== id));
    }

    if (id === activeId && neighborId) setActiveId(neighborId);
    const section = loc?.section ?? "store";
    const { sheet: targetSheet, tab: targetTab } = getTargetSheetTab(section);
    deleteEmpty(targetSheet, targetTab);
  };

  // ---------- Drag within section only ----------
  const handleDragStart = (e, id, section) => {
    setDragId(id);
    setDragSection(section);
    setDragOver({ id: null, section: null, pos: null });
    try {
      e.dataTransfer.setData("text/plain", id); // needed for Firefox
      e.dataTransfer.effectAllowed = "move";
    } catch {}
  };

  const handleDragOver = (e, overId, section) => {
    e.preventDefault();
    if (!dragId || dragSection !== section) {
      // Different section → show no indicator
      setDragOver({ id: null, section: null, pos: null });
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const pos = y < rect.height / 2 ? "before" : "after";
    setDragOver({ id: overId, section, pos });
  };

  const handleDrop = (e, overId, section) => {
    e.preventDefault();
    if (!dragId || dragSection !== section) {
      setDragId(null);
      setDragOver({ id: null, section: null, pos: null });
      return;
    }
    const arr = section === "perm" ? permTabs : storeTabs;
    const fromIdx = arr.findIndex(t => t.id === dragId);
    let toIdx = arr.findIndex(t => t.id === overId);
    if (dragOver.pos === "after") toIdx += 1;
    const adjToIdx = fromIdx < toIdx ? toIdx - 1 : toIdx;
    if (fromIdx !== adjToIdx) {
      if (section === "perm") setPermTabs(prev => moveItem(prev, fromIdx, adjToIdx));
      else setStoreTabs(prev => moveItem(prev, fromIdx, adjToIdx));
    }
    setDragId(null);
    setDragOver({ id: null, section: null, pos: null });
  };

  const handleDragEnd = () => {
    setDragId(null);
    setDragOver({ id: null, section: null, pos: null });
  };

  // ---------- Tabs rail (shared) ----------
  const TabsColumn = () => (
    <div
      style={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 8,
        overflow: "auto",
        background: "transparent",
        border: "none",
      }}
    >
      {/* SECTION A: Permanent (on top) */}
      {permTabs.map(t => renderTabChip(t, "perm"))}

      {/* Divider */}
      <div
        aria-hidden="true"
        style={{
          margin: "4px 0 8px",
          height: 1,
          background: "rgba(255,255,255,0.18)",
          borderRadius: 1,
        }}
      />

      {/* SECTION B: Store/New (below) */}
      {storeTabs.map(t => renderTabChip(t, "store"))}
    </div>
  );

  // ---------- Rendering ----------
  const renderTabChip = (t, section) => {
    const isActive = t.id === activeId;
    const isDragging = dragId === t.id;
    const showBefore = dragOver.id === t.id && dragOver.section === section && dragOver.pos === "before";
    const showAfter  = dragOver.id === t.id && dragOver.section === section && dragOver.pos === "after";
    const raw = (t.context ?? "").trim();
    const firstLine = raw.split(/\r?\n/).find(line => line.trim().length) ?? "";
    const label = firstLine || "New Tab";

    // Close drawer on mobile when selecting a tab
    const onClickTab = () => {
      setActiveId(t.id);
      if (isMobile) setDrawerOpen(false);
    };

    return (
      <div
        key={t.id}
        draggable
        onDragStart={(e) => handleDragStart(e, t.id, section)}
        onDragOver={(e) => handleDragOver(e, t.id, section)}
        onDrop={(e) => handleDrop(e, t.id, section)}
        onDragEnd={handleDragEnd}
        onClick={onClickTab}
        title={label}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: 6,
          padding: "6px 8px",
          borderRadius: 10,
          cursor: "grab",
          userSelect: "none",
          background: isActive ? "rgba(255,255,255,0.14)" : "transparent",
          border: "1px solid rgba(255,255,255,0.12)",
          width: "fit-content",
          maxWidth: "90%",
          alignSelf: "flex-end",
          textAlign: "right",
          opacity: isDragging ? 0.6 : 1,
        }}
      >
        {/* Drop indicators */}
        {showBefore && (
          <div
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              top: -4,
              height: 2,
              background: "rgba(234,238,243,0.9)",
              borderRadius: 2,
            }}
          />
        )}
        {showAfter && (
          <div
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              bottom: -4,
              height: 2,
              background: "rgba(234,238,243,0.9)",
              borderRadius: 2,
            }}
          />
        )}

        <span
          style={{
            fontSize: 13,
            lineHeight: "18px",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "100%",
          }}
        >
          {label}
        </span>

        {(permTabs.length + storeTabs.length) > 1 && (
          <button
            onMouseDown={(e) => e.stopPropagation()} // don't start drag from X
            onClick={(e) => {
              e.stopPropagation();
              closeTab(t.id);
            }}
            aria-label={`Close ${label}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 16,
              height: 16,
              padding: 0,
              borderRadius: 4,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "#eaeef3",
              lineHeight: 0,
              transform: "translateY(-1px)",
              flex: "0 0 auto",
            }}
          >
            <X size={12} />
          </button>
        )}
      </div>
    );
  };

  // Wheel open/close for touchpads (right scroll opens)
  const onWheelMaybeToggleDrawer = (e) => {
    if (!isMobile) return;
    const dx = e.deltaX || 0;
    if (!drawerOpen && dx < -24) setDrawerOpen(true);       // scroll right
    if (drawerOpen && dx > 24) setDrawerOpen(false);        // scroll left
  };

  // Simple edge-swipe open & swipe-left-to-close on drawer
  // We intentionally keep it light-weight (threshold based) to avoid interfering with vertical scrolling.
  const [touchState, setTouchState] = useState(null);
  const onTouchStartEdge = (e) => {
    if (!isMobile || drawerOpen) return;
    const t = e.touches?.[0];
    if (!t) return;
    setTouchState({ sx: t.clientX, sy: t.clientY, opened: false });
  };
  const onTouchMoveEdge = (e) => {
    if (!touchState || drawerOpen) return;
    const t = e.touches?.[0];
    if (!t) return;
    const dx = t.clientX - touchState.sx;
    const dy = Math.abs(t.clientY - touchState.sy);
    if (dx > 36 && dx > dy + 10) {
      setDrawerOpen(true);
      setTouchState(null);
    }
  };
  const onTouchEndEdge = () => setTouchState(null);

  const onTouchStartDrawer = (e) => {
    if (!isMobile || !drawerOpen) return;
    const t = e.touches?.[0];
    if (!t) return;
    setTouchState({ sx: t.clientX, sy: t.clientY, opened: true });
  };
  const onTouchMoveDrawer = (e) => {
    if (!touchState || !touchState.opened) return;
    const t = e.touches?.[0];
    if (!t) return;
    const dx = t.clientX - touchState.sx;
    const dy = Math.abs(t.clientY - touchState.sy);
    if (dx < -36 && Math.abs(dx) > dy + 10) {
      setDrawerOpen(false);
      setTouchState(null);
    }
  };
  const onTouchEndDrawer = () => setTouchState(null);

  // Layout frame
  const isDesktop = !isMobile;
  const frameStyle = isDesktop
    ? {
        position: "fixed",
        top: 4,
        bottom: 4,
        left: "50%",
        transform: "translateX(-50%)",
        height: CARD_H,
        width: `calc(${CARD_W} + ${LEFT_RAIL_W + RIGHT_RAIL_W + GAP * 2}px)`,
        display: "grid",
        gridTemplateColumns: `${LEFT_RAIL_W}px ${CARD_W} ${RIGHT_RAIL_W}px`,
        columnGap: `${GAP}px`,
        alignItems: "stretch",
      }
    : {
        position: "fixed",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        height: "100vh",
        width: "100vw",
        padding: 0,
        display: "grid",
        gridTemplateColumns: `0px 1fr ${RIGHT_RAIL_W}px`, // hide left col; drawer overlays instead
        columnGap: `${GAP}px`,
        alignItems: "stretch",
      };

  return (
    <div
      style={{
        height: "100%",
        background:
          "radial-gradient(1200px 700px at 50% -100px, rgba(255,255,255,0.08), transparent 60%), linear-gradient(180deg, #0f1115, #141821)",
        color: "#eaeef3",
      }}
      onWheel={onWheelMaybeToggleDrawer}
    >
      {/* Centered frame: left tabs rail (desktop) / editor card / right (+/load) rail */}
      <div style={frameStyle}>
        {/* LEFT (desktop only): Tabs rail */}
        {isDesktop ? (
          <TabsColumn />
        ) : (
          <div aria-hidden style={{ width: 0 }} />
        )}

        {/* CENTER: Editor card */}
        <div
          style={{
            position: "relative",
            height: "100%",
            borderRadius: 16,
            overflow: "hidden",
            background: "rgba(255,255,255,0.04)",
            boxShadow: "0 10px 40px rgba(0,0,0,0.35)",
            border: "none",
            zIndex: 1,
          }}
        >
          {/* Mobile menu button (open drawer) */}
          {isMobile && (
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open tabs"
              title="Open tabs"
              style={{
                position: "absolute",
                bottom: 23,
                left: 12,
                zIndex: 3,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 36,
                height: 36,
                padding: 0,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(15,17,21,0.2)",
                backdropFilter: "blur(4px)",
                cursor: "pointer",
                color: "#eaeef3",
              }}
            >
              <Menu size={18} />
            </button>
          )}

          {[...permTabs, ...storeTabs].map((t) => (
            <div
              key={t.id}
              style={{
                position: "absolute",
                inset: 0,
                display: t.id === activeId ? "block" : "none",
              }}
            >
              <Interface
                initialContext={t.context || ""}
                initialContent={t.content || ""}
                onCtxContentChange={(ctx, content) => {
                  const loc = getTabById(t.id);
                  if (!loc) return;
                  if (loc.section === "perm") {
                    setPermTabs(prev =>
                      prev.map(tt => (tt.id === t.id ? { ...tt, context: ctx, content, savedAck: false } : tt))
                    );
                  } else {
                    setStoreTabs(prev =>
                      prev.map(tt => (tt.id === t.id ? { ...tt, context: ctx, content, savedAck: false } : tt))
                    );
                  }
                }}
              />
            </div>
          ))}

          {/* Select overlay (unchanged) */}
          {isSelectOpen && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 5,
                background: "rgba(255,255,255,0.04)",
                backdropFilter: "blur(2px)",
                display: "flex",
                flexDirection: "column",
              }}
              tabIndex={-1}
            >
              <div style={{
                position: "absolute",
                inset: 0,
                background: "rgba(255,255,255,0.04)",
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                overflow: "hidden",
              }}>
                <Select
                  items={selectRows}
                  onSelect={handleSelectPick}
                  getLabel={(row) => String(row?.[1] ?? "")}
                  getKey={(row, i) => String(row?.[0] ?? i)}
                />
              </div>
              <div style={{ position: "absolute", top: 8, right: 12 }}>
                <button
                  onClick={closeSelect}
                  aria-label="Close picker"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: "0px solid rgba(255,255,255,0.25)",
                    background: "transparent",
                    color: "#eaeef3",
                    cursor: "pointer",
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: Plus and Load buttons rail — pinned to TOP-RIGHT (outside editor) */}

      {/* Bottom action bar */}
      <div
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 10,
          zIndex: 25,
          display: "flex",
          gap: 8,
          padding: 8,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.25)",
          background: "rgba(15,17,21,0.35)",
          backdropFilter: "blur(6px)",
        }}
      >
        <button
          onClick={loadFromPermanent}
          aria-label="Open Files"
          title="Open Files"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "transparent",
            cursor: "pointer",
            color: "#eaeef3",
          }}
        >
          <FolderSearch size={18} />
        </button>

        <button
          onClick={loadFromStore}
          aria-label="Load entries"
          title="Load entries"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "transparent",
            cursor: "pointer",
            color: "#eaeef3",
          }}
        >
          <FileDown size={18} />
        </button>

        <button
          onClick={addTab}
          aria-label="Add tab"
          title="New tab"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "transparent",
            cursor: "pointer",
            color: "#eaeef3",
          }}
        >
          <Plus size={18} />
        </button>

        <button
          onClick={saveActiveToStore}
          aria-label="Save entry"
          title="Save entry"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 36,
            height: 36,
            padding: 0,
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.25)",
            background: "transparent",
            cursor: "pointer",
            color: "#eaeef3",
          }}
        >
          <Save size={18} />
        </button>

        {activeTab?.savedAck && (
          <div
            aria-hidden="true"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "transparent",
              color: "#eaeef3",
              pointerEvents: "none",
            }}
          >
            <Check size={18} />
          </div>
        )}
      </div>

      {/* MOBILE: Slide-in tabs drawer */}
      {isMobile && (
        <>
          {/* Scrim */}
          {drawerOpen && (
            <div
              onClick={() => setDrawerOpen(false)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.35)",
                backdropFilter: "blur(2px)",
                zIndex: 20,
              }}
            />
          )}

          {/* Drawer panel */}
          <div
            onTouchStart={onTouchStartDrawer}
            onTouchMove={onTouchMoveDrawer}
            onTouchEnd={onTouchEndDrawer}
            style={{
              position: "fixed",
              top: 0,
              bottom: 0,
              left: 0,
              width: DRAWER_W,
              transform: `translateX(${drawerOpen ? 0 : -DRAWER_W}px)`,
              transition: "transform 220ms cubic-bezier(0.2,0.9,0.2,1)",
              background:
                "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
              borderRight: "1px solid rgba(255,255,255,0.14)",
              boxShadow: drawerOpen ? "0 20px 50px rgba(0,0,0,0.45)" : "none",
              zIndex: 21,
            }}
          >
            <div style={{ height: 12 }} />
            <TabsColumn />
          </div>

          {/* Edge grab area to open with right-swipe */}
          {!drawerOpen && (
            <div
              onTouchStart={onTouchStartEdge}
              onTouchMove={onTouchMoveEdge}
              onTouchEnd={onTouchEndEdge}
              style={{
                position: "fixed",
                top: 0,
                bottom: 0,
                left: 0,
                width: EDGE_GRAB_W,
                zIndex: 19,
                // invisible but capture gestures
              }}
            />
          )}
        </>
      )}
    </div>
      </div>
  )
}