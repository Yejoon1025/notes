// TextInput.jsx — Google Identity Services (Option 2) version
// Drop-in replacement for axios/SheetBest approach.
// Prereqs:
// 1) Add to index.html: <script src="https://accounts.google.com/gsi/client" async defer></script>
// 2) In .env: VITE_GOOGLE_CLIENT_ID=your_oauth_client_id
// 3) Fill SHEET_ID and TAB below. Ensure your OAuth app has Sheets API enabled and your site is
//    listed in Authorized JavaScript Origins.

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


function chicagoCompactStamp() {
  // "HHMM.DD.MM.YY" in America/Chicago to preserve your prior display
  return new Date()
    .toLocaleString("en-GB", {
      timeZone: "America/Chicago",
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "")
    .replace(/^([0-9]{2})\/([0-9]{2})\/([0-9]{2})\s+([0-9]{2}):([0-9]{2})$/, "$4$5.$2.$1.$3");
}

export async function TextInput(context, content, sheet, tab) {

  const SHEET_ID = sheet
  const TAB = tab
  try {
    if (!context || !content) throw new Error("context and content are required");

    // 1) Read IDs from column A (starting at row 2) to compute nextId
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`${TAB}!A2:A`)}`;
    const getRes = await authFetch(getUrl);
    if (!getRes.ok) throw new Error("failed_to_read_sheet");
    const getJson = await getRes.json();

    // rows like: [["1"], ["2"], ["3"], ...]
    const rows = Array.isArray(getJson.values) ? getJson.values : [];
    const lastIdStr = rows.length ? rows[rows.length - 1][0] : undefined;
    const lastId = lastIdStr ? parseInt(lastIdStr, 10) || 0 : 0;
    const nextId = lastId + 1;

    // 2) Build date string in your existing compact format
    const now = chicagoCompactStamp();

    // 3) Append the new row
    const appendUrl =
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/` +
      `${encodeURIComponent(`${TAB}!A:D`)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const body = { values: [[nextId, now, context, content]] };

    const postRes = await authFetch(appendUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!postRes.ok) throw new Error("failed_to_append");
    return true; // optional: return the API response if you need it
  } catch (err) {
    console.error(err);
    alert("Failed Input");
    return false;
  }
}

export async function primeAuth() {
  // Call once on app load to get the first token and start auto-refresh
  try { await getAccessToken(); } catch (e) { console.warn(e); }
}

export function setLoginHint(email) {
  if (email) localStorage.setItem("GIS_LOGIN_HINT", email);
}