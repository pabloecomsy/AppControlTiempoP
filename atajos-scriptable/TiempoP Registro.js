// TiempoP Registro
// ----------------
// Lo ejecutan las automatizaciones de Atajos cuando se abre o se cierra una app.
// Parámetro de texto que recibe desde Atajos:  "instagram abrir", "chrome cerrar", "facebook open", …
// Si lo abres a mano dentro de Scriptable (sin parámetro) muestra el resumen de hoy
// y deja reiniciar el día.
//
// Guarda todo en un archivo JSON dentro de Scriptable. El widget "TiempoP Widget" lo lee.

const SLOTS = ["instagram", "facebook", "chrome"];
const ALIAS = {
  ig: "instagram", insta: "instagram", instagram: "instagram",
  fb: "facebook", face: "facebook", facebook: "facebook",
  chrome: "chrome", navegador: "chrome", browser: "chrome", web: "chrome",
};
const OPEN_WORDS  = ["abrir", "abre", "abierto", "abierta", "open", "opened", "inicio"];
const CLOSE_WORDS = ["cerrar", "cierra", "cerrado", "cerrada", "close", "closed", "fin"];
// Si una sesión queda "abierta" porque iOS no avisó el cierre, no se cuenta más que esto.
const MAX_SESSION_MIN = 180;
const FILE = "tiempop.json";

// ---------- almacenamiento ----------
const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), FILE);

function pad(n) { return String(n).padStart(2, "0"); }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseDayKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }

function emptyDay(key) {
  return { dayKey: key, seconds: {}, openAt: {}, updatedAt: null, history: [] };
}

function load(now = new Date()) {
  let data = null;
  if (fm.fileExists(path)) {
    try { data = JSON.parse(fm.readString(path)); } catch (e) { data = null; }
  }
  if (!data || !data.dayKey) data = emptyDay(dayKey(now));
  if (!data.seconds) data.seconds = {};
  if (!data.openAt) data.openAt = {};
  if (!data.history) data.history = [];

  // Cambio de día: se cierran las sesiones abiertas al final del día guardado,
  // se archiva ese día y las sesiones siguen abiertas desde las 00:00 de hoy.
  const today = dayKey(now);
  if (data.dayKey !== today) {
    const endOfStored = startOfDay(parseDayKey(data.dayKey)).getTime() + 86400000;
    for (const slot of Object.keys(data.openAt)) {
      const elapsed = Math.max(0, Math.min(endOfStored - data.openAt[slot], MAX_SESSION_MIN * 60000));
      data.seconds[slot] = (data.seconds[slot] || 0) + elapsed / 1000;
      data.openAt[slot] = startOfDay(now).getTime();
    }
    const hasUse = Object.values(data.seconds).some(s => s > 0);
    if (hasUse) {
      data.history = data.history.filter(h => h.dayKey !== data.dayKey);
      data.history.push({ dayKey: data.dayKey, seconds: data.seconds });
      data.history.sort((a, b) => a.dayKey < b.dayKey ? -1 : 1);
      if (data.history.length > 30) data.history = data.history.slice(-30);
    }
    data.dayKey = today;
    data.seconds = {};
    data.updatedAt = null;
  }
  return data;
}

function save(data) {
  fm.writeString(path, JSON.stringify(data));
}

// ---------- lógica ----------
function closeSession(data, slot, now) {
  const openAt = data.openAt[slot];
  if (!openAt) return 0;
  const elapsed = Math.max(0, Math.min(now.getTime() - openAt, MAX_SESSION_MIN * 60000));
  data.seconds[slot] = (data.seconds[slot] || 0) + elapsed / 1000;
  delete data.openAt[slot];
  return elapsed / 1000;
}

function openSession(data, slot, now) {
  // Si ya había una sesión abierta (se perdió el aviso de cierre) la cerramos primero.
  if (data.openAt[slot]) closeSession(data, slot, now);
  data.openAt[slot] = now.getTime();
}

function minutesToday(data, slot, now) {
  let s = data.seconds[slot] || 0;
  if (data.openAt[slot]) {
    s += Math.max(0, Math.min(now.getTime() - data.openAt[slot], MAX_SESSION_MIN * 60000)) / 1000;
  }
  return Math.floor(s / 60);
}

function fmt(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function parseParam(raw) {
  if (raw == null) return { slot: null, event: null };
  if (typeof raw !== "string") raw = JSON.stringify(raw);
  const tokens = raw.toLowerCase().split(/[^a-záéíóúñ]+/).filter(Boolean);
  let slot = null, event = null;
  for (const t of tokens) {
    if (ALIAS[t]) slot = ALIAS[t];
    else if (OPEN_WORDS.includes(t)) event = "open";
    else if (CLOSE_WORDS.includes(t)) event = "close";
    else if (t === "reset" || t === "reiniciar") event = "reset";
  }
  return { slot, event };
}

// ---------- ejecución ----------
const now = new Date();
const data = load(now);
const raw = args.shortcutParameter ?? (args.queryParameters && args.queryParameters.evento) ?? null;
const { slot, event } = parseParam(raw);

if (event === "reset") {
  const fresh = emptyDay(dayKey(now));
  fresh.history = data.history;
  save(fresh);
  Script.setShortcutOutput("TiempoP: día reiniciado");
} else if (slot && event === "open") {
  openSession(data, slot, now);
  data.updatedAt = now.getTime();
  save(data);
  Script.setShortcutOutput(`${slot}: ${fmt(minutesToday(data, slot, now))} hoy`);
} else if (slot && event === "close") {
  closeSession(data, slot, now);
  data.updatedAt = now.getTime();
  save(data);
  Script.setShortcutOutput(`${slot}: ${fmt(minutesToday(data, slot, now))} hoy`);
} else if (config.runsInApp) {
  // Abierto a mano: resumen y opción de reiniciar.
  const lines = SLOTS.map(s => `${s}: ${fmt(minutesToday(data, s, now))}${data.openAt[s] ? " (abierta)" : ""}`);
  const a = new Alert();
  a.title = `Hoy ${data.dayKey}`;
  a.message = lines.join("\n");
  a.addAction("OK");
  a.addDestructiveAction("Reiniciar hoy");
  const idx = await a.presentAlert();
  if (idx === 1) {
    const fresh = emptyDay(dayKey(now));
    fresh.history = data.history;
    save(fresh);
  }
} else {
  save(data); // al menos aplica el cambio de día
  Script.setShortcutOutput("TiempoP: parámetro no reconocido. Usa por ejemplo «instagram abrir».");
}

Script.complete();
