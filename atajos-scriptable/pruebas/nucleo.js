// ===== NÚCLEO COMPARTIDO: inicio =====
// Este bloque es idéntico en "TiempoP Registro" y "TiempoP Widget". Así el resumen
// y el widget calculan lo mismo con los mismos datos. Se edita en
// pruebas/nucleo.js y se copia a los dos scripts con: node pruebas/probar.js --sync
const VERSION = "2026-11-22.3";
const SLOTS = ["instagram", "facebook", "chrome"];
const ALIAS = {
  ig: "instagram", insta: "instagram", instagram: "instagram",
  fb: "facebook", face: "facebook", facebook: "facebook",
  chrome: "chrome", chr: "chrome", navegador: "chrome", browser: "chrome", web: "chrome",
};
// Tope de una sesión. Si iOS no avisa el cierre de una app, la sesión no cuenta más
// que esto, y el número de esa app se marca como estimado ("≈").
const MAX_SESSION_MIN = 90;
const MAX_MS = MAX_SESSION_MIN * 60000;
const FILE = "tiempop.json";
const BACKUP_FILE = "tiempop.respaldo.json";

const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), FILE);
const backupPath = fm.joinPath(fm.documentsDirectory(), BACKUP_FILE);

function pad(n) { return String(n).padStart(2, "0"); }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseDayKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
// Inicio del día siguiente por calendario (no "+24 h": hay días de 23 y 25 horas).
function nextDayStart(d) { const x = startOfDay(d); x.setDate(x.getDate() + 1); return x; }
function words(text) { return String(text == null ? "" : text).toLowerCase().split(/[^a-záéíóúñ]+/).filter(Boolean); }

function emptyDay(key) {
  return { dayKey: key, seconds: {}, openAt: {}, sessions: [], estimated: {}, updatedAt: null, history: [], log: [] };
}

function readFile(p) {
  try {
    if (!fm.fileExists(p)) return null;
    const d = JSON.parse(fm.readString(p));
    return d && d.dayKey ? d : null;
  } catch (e) { return null; }
}

// Cierra la sesión de `slot` en el instante `at` (ms), sin pasar del tope.
function closeSession(data, slot, at) {
  const openAt = data.openAt[slot];
  if (!openAt) return 0;
  const elapsed = Math.max(0, Math.min(at - openAt, MAX_MS));
  data.seconds[slot] = (data.seconds[slot] || 0) + elapsed / 1000;
  data.sessions.push([slot, openAt, openAt + elapsed]);
  data.lastCloseAt = Math.max(data.lastCloseAt || 0, openAt + elapsed);
  delete data.openAt[slot];
  return elapsed / 1000;
}

// Mayor hueco entre sesiones (ms). Cuenta desde el fin de la primera sesión; si no
// hay ninguna app abierta, el hueco actual hasta `until` también cuenta.
function longestGap(sessions, until, openNow = false) {
  const list = sessions.slice().sort((a, b) => a[1] - b[1]);
  if (!list.length) return 0;
  let best = 0, end = list[0][2];
  for (const [, start, stop] of list.slice(1)) {
    if (start > end) best = Math.max(best, start - end);
    end = Math.max(end, stop);
  }
  if (!openNow && until > end) best = Math.max(best, until - end);
  return best;
}

// Cambio de día. Una sesión abierta solo pasa al día nuevo si todavía puede estar
// en curso (lleva menos del tope). Si no, su cierre se perdió: se cierra en el día
// guardado y NO se reabre a medianoche (antes sumaba hasta 90 min al día nuevo).
function rollDay(data, now) {
  const today = dayKey(now);
  if (data.dayKey === today) return;
  const endOfStored = nextDayStart(parseDayKey(data.dayKey)).getTime();
  const todayStart = startOfDay(now).getTime();
  const carry = [];
  for (const slot of Object.keys(data.openAt)) {
    const openAt = data.openAt[slot];
    if (openAt < todayStart && now.getTime() - openAt < MAX_MS) carry.push(slot);
    closeSession(data, slot, Math.min(endOfStored, openAt + MAX_MS));
  }
  if (Object.values(data.seconds).some(s => s > 0)) {
    data.history = (data.history || []).filter(h => h.dayKey !== data.dayKey);
    data.history.push({ dayKey: data.dayKey, seconds: data.seconds,
                        recordOfflineMin: Math.floor(longestGap(data.sessions, endOfStored, carry.length > 0) / 60000) });
    data.history.sort((a, b) => a.dayKey < b.dayKey ? -1 : 1);
    if (data.history.length > 30) data.history = data.history.slice(-30);
  }
  data.dayKey = today;
  data.seconds = {};
  data.sessions = [];
  data.estimated = {};
  data.updatedAt = null;
  for (const slot of carry) data.openAt[slot] = todayStart;
}

// Una sesión que lleva más del tope abierta es un cierre perdido: se cierra en
// inicio + tope y la app queda marcada como estimada por hoy.
function sweepStale(data, now) {
  for (const slot of Object.keys(data.openAt)) {
    const openAt = data.openAt[slot];
    if (now.getTime() - openAt >= MAX_MS) {
      closeSession(data, slot, openAt + MAX_MS);
      data.estimated[slot] = (data.estimated[slot] || 0) + 1;
    }
  }
}

// Respaldo para datos antiguos: última salida según la bitácora.
function lastExitFromLog(data) {
  let t = 0;
  for (const e of data.log || []) {
    if (e.r === "ok" && /cerr|clos|fin/i.test(e.p || "")) t = Math.max(t, e.t);
  }
  return t;
}

// Lee los datos y los deja al día en memoria. Dos intentos al archivo principal
// (puede estar a medio escribir) y después la copia de respaldo.
function load(now) {
  const data = readFile(path) || readFile(path) || readFile(backupPath) || emptyDay(dayKey(now));
  if (!data.seconds) data.seconds = {};
  if (!data.openAt) data.openAt = {};
  if (!data.history) data.history = [];
  if (!data.log) data.log = [];
  if (!data.sessions) data.sessions = [];
  if (!data.estimated) data.estimated = {};
  rollDay(data, now);
  sweepStale(data, now);
  if (!data.lastCloseAt) data.lastCloseAt = lastExitFromLog(data) || null;
  return data;
}

function minutesToday(data, slot, now) {
  let s = data.seconds[slot] || 0;
  if (data.openAt[slot]) s += Math.max(0, Math.min(now.getTime() - data.openAt[slot], MAX_MS)) / 1000;
  return Math.floor(s / 60);
}

// Todo lo que muestran el resumen y el widget sale de aquí.
function status(data, now) {
  const t = now.getTime();
  const minutes = {};
  for (const s of SLOTS) minutes[s] = minutesToday(data, s, now);
  const openSlots = SLOTS.filter(s => data.openAt[s]);
  const openNow = openSlots.length > 0;
  const sessions = data.sessions.concat(openSlots.map(s => [s, data.openAt[s], t]));
  const lastExit = data.lastCloseAt || 0;
  return {
    minutes,
    total: SLOTS.reduce((a, s) => a + minutes[s], 0),
    openSlots,
    openNow,
    estimated: SLOTS.filter(s => data.estimated[s]),
    hasRecord: sessions.length > 0,
    recordMin: Math.floor(longestGap(sessions, t, openNow) / 60000),
    streakStart: !openNow && lastExit ? lastExit : null,
    streakMin: !openNow && lastExit ? Math.max(0, Math.floor((t - lastExit) / 60000)) : 0,
  };
}
// ===== NÚCLEO COMPARTIDO: fin =====
