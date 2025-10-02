const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const SCOPES = "https://www.googleapis.com/auth/spreadsheets";
const LOGIN_HINT =
  import.meta.env.VITE_GOOGLE_LOGIN_HINT ||
  localStorage.getItem("GIS_LOGIN_HINT") ||
  undefined;

let _tokenClient;
let _accessToken;
let _expiresAt = 0;       // epoch ms when token expires
let _refreshTimer;        // timeout id for silent refresh

function ensureGisLoaded(timeoutMs = 8000) {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const iv = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(iv);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        reject(new Error("Google Identity Services SDK failed to load"));
      }
    }, 50);
  });
}

async function getAccessToken() {
  // Reuse token if it's not about to expire
  if (_accessToken && Date.now() < (_expiresAt - 60_000)) return _accessToken;

  await ensureGisLoaded();
  if (!_tokenClient) {
    _tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: () => {}, // set per request below
    });
  }

  return new Promise((resolve, reject) => {
    _tokenClient.callback = (resp) => {
      if (resp?.error) return reject(resp);
      _accessToken = resp.access_token;
      const sec = Number(resp.expires_in || 3600);
      _expiresAt = Date.now() + sec * 1000;
      scheduleTokenRefresh(sec);
      resolve(_accessToken);
    };
    _tokenClient.requestAccessToken({ prompt: "", login_hint: LOGIN_HINT });
  });
}

async function authFetch(url, opts = {}, retry = true) {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });
  // If token expired/invalid, clear and retry once
  if (res.status === 401 && retry) {
    _accessToken = undefined;
    return authFetch(url, opts, false);
  }
  return res;
}

function scheduleTokenRefresh(expiresInSec = 3600) {
  // Refresh ~5 minutes before expiry (min 15s safety)
  if (_refreshTimer) clearTimeout(_refreshTimer);
  const ms = Math.max((expiresInSec - 300) * 1000, 15_000);
  _refreshTimer = setTimeout(() => {
    if (_tokenClient) {
      try {
        _tokenClient.requestAccessToken({ prompt: "", login_hint: LOGIN_HINT });
      } catch (e) {
        console.warn("Silent token refresh failed", e);
      }
    }
  }, ms);
}

// ------------------ CREATE / APPEND ------------------
export async function NewSave(context, content, sheet, tab) {
  const SHEET_ID = sheet;
  const TAB = tab;

  try {
    if (context == null || content == null) throw new Error("context and content are required");

    // Ensure headers exist: TempID | Context | Content
    const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A1:C1`)}`;
    const headerRes = await authFetch(headerUrl);
    const headerJson = headerRes.ok ? await headerRes.json() : {};
    const headers = headerJson.values?.[0] || [];

    if (headers.join("|") !== "TempID|Context|Content") {
      const updateHeaderUrl =
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/` +
        `${encodeURIComponent(`${TAB}!A1:C1`)}?valueInputOption=RAW`;
      await authFetch(updateHeaderUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["TempID", "Context", "Content"]] }),
      });
    }

    // Read existing TempIDs (col A)
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A2:A`)}`;
    const getRes = await authFetch(getUrl);
    if (!getRes.ok) throw new Error("failed_to_read_sheet");
    const getJson = await getRes.json();

    const rows = Array.isArray(getJson.values) ? getJson.values : [];
    const tempIds = rows.map(r => parseInt(r[0], 10)).filter(n => !isNaN(n));

    const maxTempID = tempIds.length ? Math.max(...tempIds) : 0;
    const nextTempID = maxTempID + 1;

    // Append new row (TempID, Context, Content)
    const appendUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/` +
      `${encodeURIComponent(`${TAB}!A:C`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const body = { values: [[nextTempID, context, content]] };

    const postRes = await authFetch(appendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!postRes.ok) throw new Error("failed_to_append");
    return nextTempID; // ← return the new TempID
  } catch (err) {
    console.error(err);
    alert("Failed Input");
    return null; // ← null on failure
  }
}

// ------------------ READ / EXPORT ------------------
export async function exportEntries(sheet, tab) {
  const SHEET_ID = sheet;
  const TAB = tab;

  try {
    // Fetch all rows starting at row 2 (skip headers)
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A2:C`)}`;
    const getRes = await authFetch(getUrl);
    if (!getRes.ok) throw new Error("failed_to_read_sheet");
    const getJson = await getRes.json();

    const rows = Array.isArray(getJson.values) ? getJson.values : [];

    // Normalize: [tempid:int, context:string, content:string]
    const result = rows.map(r => {
      const tempid = parseInt(r[0], 10) || 0;
      const context = r[1] || "";
      const content = r[2] || "";
      return [tempid, context, content];
    });

    return result;
  } catch (err) {
    console.error(err);
    alert("Failed to export entries");
    return [];
  }
}

// ------------------ UPDATE BY TempID ------------------
// Updates Context (col B) and Content (col C) for the row with matching TempID in col A.
// Signature matches your request order: (tempid, content, context, sheet, tab)
export async function updateEntryByTempID(tempid, context, content, sheet, tab) {
  const SHEET_ID = sheet;
  const TAB = tab;

  try {
    if (tempid === undefined || tempid === null) throw new Error("tempid_required");

    // Ensure headers exist (optional but keeps sheet consistent)
    const headerUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A1:C1`)}`;
    const headerRes = await authFetch(headerUrl);
    const headerJson = headerRes.ok ? await headerRes.json() : {};
    const headers = headerJson.values?.[0] || [];
    if (headers.join("|") !== "TempID|Context|Content") {
      const updateHeaderUrl =
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/` +
        `${encodeURIComponent(`${TAB}!A1:C1`)}?valueInputOption=RAW`;
      await authFetch(updateHeaderUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: [["TempID", "Context", "Content"]] }),
      });
    }

    // Read TempID column to find the row number
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A2:A`)}`;
    const getRes = await authFetch(getUrl);
    if (!getRes.ok) throw new Error("failed_to_read_sheet");
    const getJson = await getRes.json();
    const rows = Array.isArray(getJson.values) ? getJson.values : [];

    let rowIndex = -1; // 0-based within A2:A
    const wanted = Number(tempid);
    for (let i = 0; i < rows.length; i++) {
      const v = Number.parseInt(rows[i][0], 10);
      if (!Number.isNaN(v) && v === wanted) {
        rowIndex = i;
        break;
      }
    }

    if (rowIndex === -1) throw new Error("tempid_not_found");

    // Convert to absolute sheet row number (headers on row 1)
    const rowNumber = rowIndex + 2;

    // Update Context (col B) and Content (col C). Note: function takes (content, context),
    // but sheet is (Context, Content) in B,C respectively.
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!B${rowNumber}:C${rowNumber}`)}?valueInputOption=RAW`;
    const body = { values: [[context ?? "", content ?? ""]] };

    const putRes = await authFetch(updateUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!putRes.ok) throw new Error("failed_to_update");
    return true;
  } catch (err) {
  console.error(err);
  return false;
}

}

// ------------------ DELETE BY TempID ------------------
// Deletes the entire row whose column A matches the given TempID (no blank left behind).
// Signature: (tempid, sheet, tab)
export async function deleteEntryByTempID(tempid, sheet, tab) {
  const SHEET_ID = sheet;
  const TAB = tab;
  try {
    if (tempid === undefined || tempid === null) throw new Error("tempid_required");

    // 1) Find the row index (within A2:A) that matches TempID
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A2:A`)}`;
    const getRes = await authFetch(getUrl);
    if (!getRes.ok) throw new Error("failed_to_read_sheet");
    const getJson = await getRes.json();
    const rows = Array.isArray(getJson.values) ? getJson.values : [];

    let rowIndex = -1; // 0-based within A2:A
    const wanted = Number(tempid);
    for (let i = 0; i < rows.length; i++) {
      const v = Number.parseInt(rows[i][0], 10);
      if (!Number.isNaN(v) && v === wanted) { rowIndex = i; break; }
    }
    if (rowIndex === -1) throw new Error("tempid_not_found");

    // 2) Resolve the numeric sheetId (gid) for the named tab
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`;
    const metaRes = await authFetch(metaUrl);
    if (!metaRes.ok) throw new Error("failed_to_get_sheet_meta");
    const metaJson = await metaRes.json();
    const propsList = (metaJson.sheets || []).map(s => s.properties || {});
    const target = propsList.find(p => p.title === TAB);
    if (!target || typeof target.sheetId !== "number") throw new Error("tab_not_found");

    // 3) Delete the row entirely using batchUpdate -> deleteDimension
    // Grid indices are 0-based. Header is row 0, data starts at row 1.
    const gridRowStart = rowIndex + 1;      // convert A2:A index (0...) to grid row
    const gridRowEnd = gridRowStart + 1;    // endIndex is exclusive

    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
    const body = {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId: target.sheetId,
              dimension: "ROWS",
              startIndex: gridRowStart,
              endIndex: gridRowEnd,
            },
          },
        },
      ],
    };

    const delRes = await authFetch(batchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!delRes.ok) throw new Error("failed_to_delete");

    return true;
  } catch (err) {
    console.error(err);
    if (err.message === "tempid_required") alert("TempID is required");
    else if (err.message === "tempid_not_found") alert("TempID not found");
    else if (err.message === "tab_not_found") alert("Tab not found");
    else alert("Failed to delete row");
    return false;
  }
}

// ------------------ BULK DELETE: Empty Context + Content ------------------
// Deletes ALL rows where both Context (col B) and Content (col C) are empty.
// Returns the number of rows deleted. Signature: (sheet, tab)
export async function deleteEmpty(sheet, tab) {
  const SHEET_ID = sheet;
  const TAB = tab;

  try {
    // 1) Read A2:C to align row indices with real sheet rows
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A2:C`)}`;
    const getRes = await authFetch(getUrl);
    if (!getRes.ok) throw new Error("failed_to_read_sheet");
    const getJson = await getRes.json();

    const rows = Array.isArray(getJson.values) ? getJson.values : [];

    // Identify rows where B and C are empty (treat whitespace as empty)
    const emptyIdxs = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] || [];
      const context = (r[1] ?? "").toString().trim();
      const content = (r[2] ?? "").toString().trim();
      if (context === "" && content === "") emptyIdxs.push(i); // i is 0-based within A2:C
    }

    if (emptyIdxs.length === 0) return 0;

    // 2) Resolve the numeric sheetId (gid) for the named tab
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}?fields=sheets(properties(sheetId,title))`;
    const metaRes = await authFetch(metaUrl);
    if (!metaRes.ok) throw new Error("failed_to_get_sheet_meta");
    const metaJson = await metaRes.json();
    const propsList = (metaJson.sheets || []).map(s => s.properties || {});
    const target = propsList.find(p => p.title === TAB);
    if (!target || typeof target.sheetId !== "number") throw new Error("tab_not_found");

    // 3) Build delete requests, merging contiguous ranges
    // Convert A2:C index -> grid row (header = row 0, first data row = 1)
    // i=0 => grid row 1, i=1 => grid row 2, etc.
    emptyIdxs.sort((a, b) => a - b);
    const ranges = [];
    let start = emptyIdxs[0];
    let prev = emptyIdxs[0];
    for (let k = 1; k < emptyIdxs.length; k++) {
      const idx = emptyIdxs[k];
      if (idx === prev + 1) {
        prev = idx; // extend current contiguous block
      } else {
        ranges.push([start, prev]);
        start = prev = idx;
      }
    }
    ranges.push([start, prev]);

    // Delete from bottom to top so indices don't shift
    ranges.reverse();

    const requests = ranges.map(([lo, hi]) => ({
      deleteDimension: {
        range: {
          sheetId: target.sheetId,
          dimension: "ROWS",
          startIndex: lo + 1,     // +1 to convert A2 index to grid row
          endIndex: hi + 2,       // exclusive
        },
      },
    }));

    const batchUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
    const delRes = await authFetch(batchUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requests }),
    });
    if (!delRes.ok) throw new Error("failed_to_delete");

    return emptyIdxs.length;
  } catch (err) {
    console.error(err);
    alert("Failed to clean empty rows");
    return 0;
  }
}

// ------------------ AUTH HELPERS ------------------
export async function primeAuth() {
  try { await getAccessToken(); } catch (e) { console.warn(e); }
}

export function setLoginHint(email) {
  if (email) localStorage.setItem("GIS_LOGIN_HINT", email);
}