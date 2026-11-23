// TiempoP Widget
// --------------
// Widget de Scriptable. Lee el archivo que escribe "TiempoP Registro" y muestra el
// tiempo de hoy en Instagram, Facebook y Chrome.
//
// Con el parámetro "sin redes" (o "racha", "offline") muestra cuánto llevas sin
// abrir esas apps, con contador en vivo, y el récord del día.
//
// Tamaños: pantalla de bloqueo (rectangular, circular, en línea) y pantalla de
// inicio (pequeño, mediano). Si una app está abierta ahora mismo, el tiempo
// mostrado incluye la sesión en curso.

// Metas diarias en minutos (solo colorean las barras: verde / naranja / rojo).
const GOALS = { instagram: 30, facebook: 30, chrome: 60 };
const TITLES = { instagram: "Instagram", facebook: "Facebook", chrome: "Chrome" };
const SHORT = { instagram: "IG", facebook: "FB", chrome: "Chrome" };
const SYMBOLS = { instagram: "camera.fill", facebook: "person.2.fill", chrome: "globe" };
const COLORS = { instagram: "#DB408C", facebook: "#296BDB", chrome: "#1A9ECC" };
// Pedimos a iOS redibujar cada minuto. Es solo una sugerencia: iOS decide cuándo
// lo hace (normalmente cada 5 a 20 min).
const REFRESH_MINUTES = 1;

// ===== NÚCLEO COMPARTIDO: inicio =====
// Este bloque es idéntico en "TiempoP Registro" y "TiempoP Widget". Así el resumen
// y el widget calculan lo mismo con los mismos datos. Se edita en
// pruebas/nucleo.js y se copia a los dos scripts con: node pruebas/probar.js --sync
const VERSION = "2026-11-22.2";
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

// ---------- formato ----------
// "3:42 h" o "42 min", como en la pantalla de referencia.
function hm(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m} min` : `${h}:${pad(m)} h`;
}
function short(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
function compact(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h${pad(m)}`;
}
function ratio(min, goal) { return goal > 0 ? Math.min(1, min / goal) : 0; }
function toneColor(min, goal) {
  const r = goal > 0 ? min / goal : 0;
  if (r >= 1) return new Color("#E64040");
  if (r >= 0.6) return new Color("#F2992A");
  return new Color("#33B373");
}

// ---------- dibujo ----------
function barImage(width, height, r, color) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const bg = new Path();
  bg.addRoundedRect(new Rect(0, 0, width, height), height / 2, height / 2);
  ctx.addPath(bg);
  ctx.setFillColor(new Color(color.hex, 0.18));
  ctx.fillPath();
  const w = Math.max(height, width * r);
  const fg = new Path();
  fg.addRoundedRect(new Rect(0, 0, w, height), height / 2, height / 2);
  ctx.addPath(fg);
  ctx.setFillColor(color);
  ctx.fillPath();
  return ctx.getImage();
}

function ringImage(size, r, color, lineWidth) {
  const ctx = new DrawContext();
  ctx.size = new Size(size, size);
  ctx.opaque = false;
  ctx.respectScreenScale = true;
  const c = size / 2, rad = size / 2 - lineWidth;
  function arc(from, to) {
    const pts = [];
    const steps = 72;
    for (let i = 0; i <= steps; i++) {
      const a = from + (to - from) * (i / steps);
      pts.push(new Point(c + rad * Math.cos(a), c + rad * Math.sin(a)));
    }
    const p = new Path();
    p.addLines(pts);
    return p;
  }
  const start = -Math.PI / 2;
  ctx.setLineWidth(lineWidth);
  ctx.setStrokeColor(new Color(color.hex, 0.25));
  ctx.addPath(arc(start, start + Math.PI * 2));
  ctx.strokePath();
  if (r > 0) {
    ctx.setStrokeColor(color);
    ctx.addPath(arc(start, start + Math.PI * 2 * r));
    ctx.strokePath();
  }
  return ctx.getImage();
}

function symbolImage(name, size) {
  const s = SFSymbol.named(name);
  s.applyFont(Font.semiboldSystemFont(size));
  return s.image;
}

// ---------- widgets ----------
const now = new Date();
const data = load(now);
const st = status(data, now);
const { minutes, total, openNow, hasRecord, recordMin, streakStart, streakMin } = st;
// "≈" delante del número de una app cuyo cierre se perdió hoy (se contó el tope).
function approx(slot, text) { return st.estimated.includes(slot) ? `≈${text}` : text; }

// Parámetro del widget (opcional): qué apps mostrar. Ejemplos: "instagram",
// "facebook chrome", "ig fb". Vacío = las tres. Menos apps = números más grandes.
function chosenSlots(raw) {
  const picked = [];
  for (const t of words(raw)) {
    const s = ALIAS[t];
    if (s && !picked.includes(s)) picked.push(s);
  }
  return picked.length ? picked : SLOTS;
}
const chosen = chosenSlots(args.widgetParameter);
const offlineMode = /sin\s*redes|racha|offline|desconex|pausa/i.test(String(args.widgetParameter || ""));

// Hora del último dibujo del widget ("5:07"). No se usa un cronómetro en vivo:
// seguiría corriendo aunque abrieras Instagram, porque iOS no redibuja el widget
// en el momento. Con la hora a la vista se sabe qué tan fresco es el dato.
function clock(d) {
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())}`;
}
const fresh = `act. ${clock(now)}`;

function renderOffline() {
  const white = Color.white();
  const soft = new Color("#FFFFFF", 0.75);
  if (family === "accessoryInline") {
    const now_ = openNow ? "en redes" : streakStart ? `sin redes ${compact(streakMin)}` : "usa una app";
    w.addText(`${now_} · récord ${hasRecord ? compact(recordMin) : "—"}`);
    return;
  }
  if (family === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    const st = w.addStack();
    st.layoutVertically();
    st.centerAlignContent();
    const top = st.addStack(); top.addSpacer();
    const i = top.addImage(symbolImage(openNow ? "iphone.radiowaves.left.and.right" : "leaf.fill", 12));
    i.imageSize = new Size(14, 14); i.tintColor = white;
    top.addSpacer();
    const mid = st.addStack(); mid.addSpacer();
    const v = mid.addText(openNow ? "uso" : streakStart ? compact(streakMin) : "—");
    v.font = Font.boldRoundedSystemFont(14); v.textColor = white; v.minimumScaleFactor = 0.5; v.lineLimit = 1;
    mid.addSpacer();
    return;
  }
  if (family === "accessoryRectangular") {
    w.setPadding(0, 0, 0, 0);
    const head = w.addText(openNow ? "En redes ahora" : "Llevas sin redes");
    head.font = Font.semiboldSystemFont(12); head.textColor = soft; head.lineLimit = 1;
    const v = w.addText(openNow ? "—" : streakStart ? short(streakMin) : "usa una app");
    v.font = Font.boldRoundedSystemFont(streakStart || openNow ? 30 : 22);
    v.textColor = white; v.lineLimit = 1; v.minimumScaleFactor = 0.5;
    const rec = w.addText(`Récord ${hasRecord ? hm(recordMin) : "—"} · ${fresh}`);
    rec.font = Font.mediumSystemFont(12); rec.textColor = soft; rec.lineLimit = 1; rec.minimumScaleFactor = 0.7;
    return;
  }
  // Pantalla de inicio: estilo de la imagen de referencia.
  const g = new LinearGradient();
  g.colors = [new Color("#1F3B2D"), new Color("#0E1A14")];
  g.locations = [0, 1];
  w.backgroundGradient = g;
  const big = family === "small" ? 30 : 40;
  w.setPadding(14, 16, 14, 16);
  const t1 = w.addText("Mayor tiempo sin redes hoy");
  t1.font = Font.mediumSystemFont(family === "small" ? 12 : 14); t1.textColor = white; t1.centerAlignText();
  w.addSpacer(2);
  const v = w.addText(hasRecord ? hm(recordMin) : "—");
  v.font = Font.boldRoundedSystemFont(big); v.textColor = new Color("#A8DCFF");
  v.centerAlignText(); v.lineLimit = 1; v.minimumScaleFactor = 0.6;
  w.addSpacer(4);
  const row = w.addStack();
  row.layoutHorizontally(); row.centerAlignContent(); row.spacing = 4;
  row.addSpacer();
  const lbl = row.addText(openNow ? "Ahora estás en redes" : streakStart ? `Llevas ${short(streakMin)} sin redes` : "Usa una app para empezar");
  lbl.font = Font.systemFont(12); lbl.textColor = soft; lbl.lineLimit = 1; lbl.minimumScaleFactor = 0.7;
  row.addSpacer();
  const f = w.addText(fresh);
  f.font = Font.systemFont(10); f.textColor = new Color("#FFFFFF", 0.5); f.centerAlignText();
}

const family = config.widgetFamily || "medium";
const w = new ListWidget();
w.refreshAfterDate = new Date(now.getTime() + REFRESH_MINUTES * 60000);
const isAccessory = family.startsWith("accessory");

if (offlineMode) {
  renderOffline();
} else if (family === "accessoryRectangular") {
  // Columnas: etiqueta arriba, tiempo grande en medio, barra contra la meta abajo.
  // El rectangular es el tamaño más grande que iOS permite en la pantalla de
  // bloqueo; con 1 o 2 apps por widget los números crecen.
  const n = chosen.length;
  const colW = n === 1 ? 150 : n === 2 ? 74 : 50;
  const valueSize = n === 1 ? 36 : n === 2 ? 30 : 22;
  w.setPadding(0, 0, 0, 0);
  const cols = w.addStack();
  cols.layoutHorizontally();
  cols.centerAlignContent();
  cols.spacing = n === 1 ? 0 : 6;
  for (const s of chosen) {
    const col = cols.addStack();
    col.layoutVertically();
    col.spacing = n === 1 ? 1 : 2;
    col.size = new Size(colW, 0);

    const head = col.addStack();
    head.layoutHorizontally();
    head.centerAlignContent();
    const t = head.addText(n === 1 ? TITLES[s] : SHORT[s]);
    t.font = Font.semiboldSystemFont(12);
    t.textColor = Color.white();
    t.lineLimit = 1;
    t.minimumScaleFactor = 0.6;
    head.addSpacer();

    // Con una sola app sobra espacio a la derecha del número: ahí van la meta y
    // la hora de actualización, en dos líneas, sin cortarse.
    const valueRow = n === 1 ? col.addStack() : col;
    if (n === 1) {
      valueRow.layoutHorizontally();
      valueRow.centerAlignContent();
    }
    const v = valueRow.addText(compact(minutes[s]));
    v.font = Font.boldRoundedSystemFont(valueSize);
    v.textColor = Color.white();
    v.lineLimit = 1;
    v.minimumScaleFactor = 0.5;
    if (n === 1) {
      valueRow.addSpacer();
      const info = valueRow.addStack();
      info.layoutVertically();
      info.spacing = 1;
      for (const line of [`meta ${short(GOALS[s])}`, fresh]) {
        const r = info.addStack();
        r.addSpacer();
        const x = r.addText(line);
        x.font = Font.mediumSystemFont(11);
        x.textColor = new Color("#FFFFFF", 0.75);
        x.lineLimit = 1;
        x.minimumScaleFactor = 0.8;
      }
    }

    const b = col.addImage(barImage(colW, n === 1 ? 5 : 4, ratio(minutes[s], GOALS[s]), Color.white()));
    b.imageSize = new Size(colW, n === 1 ? 5 : 4);
  }

} else if (family === "accessoryCircular") {
  w.addAccessoryWidgetBackground = true;
  w.setPadding(0, 0, 0, 0);
  // Anillo de una app (la primera del parámetro; Instagram por defecto) contra su meta.
  const cs = chosen.length === SLOTS.length ? "instagram" : chosen[0];
  const ring = w.addStack();
  ring.size = new Size(58, 58);
  ring.backgroundImage = ringImage(58, ratio(minutes[cs], GOALS[cs]), Color.white(), 5);
  ring.layoutVertically();
  ring.centerAlignContent();
  ring.spacing = 0;
  // Etiqueta pequeña para saber de qué app es el anillo.
  const labelRow = ring.addStack();
  labelRow.layoutHorizontally();
  labelRow.addSpacer();
  const lbl = labelRow.addText(SHORT[cs]);
  lbl.font = Font.semiboldSystemFont(9);
  lbl.textColor = new Color("#FFFFFF", 0.8);
  lbl.lineLimit = 1;
  lbl.minimumScaleFactor = 0.7;
  labelRow.addSpacer();
  const inner = ring.addStack();
  inner.layoutHorizontally();
  inner.addSpacer();
  const v = inner.addText(compact(minutes[cs]));
  v.font = Font.boldRoundedSystemFont(13);
  v.textColor = Color.white();
  v.minimumScaleFactor = 0.6;
  v.lineLimit = 1;
  inner.addSpacer();

} else if (family === "accessoryInline") {
  w.addText(`IG ${compact(minutes.instagram)} · FB ${compact(minutes.facebook)} · Chrome ${compact(minutes.chrome)}`);

} else if (family === "small") {
  w.backgroundColor = Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E"));
  w.setPadding(12, 12, 12, 12);
  const head = w.addStack();
  head.layoutHorizontally();
  head.centerAlignContent();
  head.spacing = 4;
  const hi = head.addImage(symbolImage("hourglass", 11));
  hi.imageSize = new Size(12, 12);
  hi.tintColor = Color.gray();
  const ht = head.addText("Hoy en redes");
  ht.font = Font.mediumSystemFont(11);
  ht.textColor = Color.gray();
  const tv = w.addText(short(total));
  tv.font = Font.boldRoundedSystemFont(26);
  tv.textColor = toneColor(total, SLOTS.reduce((a, s) => a + GOALS[s], 0));
  tv.minimumScaleFactor = 0.6;
  w.addSpacer(4);
  for (const s of SLOTS) {
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.spacing = 6;
    const img = row.addImage(symbolImage(SYMBOLS[s], 10));
    img.imageSize = new Size(12, 12);
    img.tintColor = new Color(COLORS[s]);
    const b = row.addImage(barImage(60, 4, ratio(minutes[s], GOALS[s]), toneColor(minutes[s], GOALS[s])));
    b.imageSize = new Size(60, 4);
    row.addSpacer();
    const v = row.addText(approx(s, compact(minutes[s])));
    v.font = Font.boldMonospacedSystemFont(11);
    v.lineLimit = 1;
    w.addSpacer(3);
  }
  const foot = w.addText(st.openNow ? `en uso · ${fresh}` : fresh);
  foot.font = Font.systemFont(9);
  foot.textColor = Color.gray();
  foot.lineLimit = 1;
  foot.minimumScaleFactor = 0.7;

} else {
  // medium: el boceto. Izquierda filas con icono, nombre, barra y tiempo;
  // derecha el total de hoy en grande.
  w.backgroundColor = Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E"));
  w.setPadding(14, 16, 14, 16);
  const main = w.addStack();
  main.layoutHorizontally();
  main.centerAlignContent();
  main.spacing = 14;

  const left = main.addStack();
  left.layoutVertically();
  left.spacing = 9;
  for (const s of SLOTS) {
    const color = new Color(COLORS[s]);
    const tone = toneColor(minutes[s], GOALS[s]);
    const row = left.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.spacing = 8;
    const circle = row.addStack();
    circle.size = new Size(30, 30);
    circle.cornerRadius = 15;
    circle.backgroundColor = new Color(COLORS[s], 0.16);
    circle.centerAlignContent();
    const img = circle.addImage(symbolImage(SYMBOLS[s], 13));
    img.imageSize = new Size(14, 14);
    img.tintColor = color;
    const col = row.addStack();
    col.layoutVertically();
    col.spacing = 3;
    const line = col.addStack();
    line.layoutHorizontally();
    line.centerAlignContent();
    const t = line.addText(TITLES[s]);
    t.font = Font.semiboldSystemFont(12);
    t.lineLimit = 1;
    line.addSpacer();
    const v = line.addText(approx(s, short(minutes[s])));
    v.font = Font.boldRoundedSystemFont(12);
    v.textColor = tone;
    v.lineLimit = 1;
    const b = col.addImage(barImage(150, 5, ratio(minutes[s], GOALS[s]), tone));
    b.imageSize = new Size(150, 5);
  }

  const right = main.addStack();
  right.layoutVertically();
  right.centerAlignContent();
  right.size = new Size(92, 0);
  right.spacing = 3;
  const ri = right.addImage(symbolImage("hourglass", 16));
  ri.imageSize = new Size(18, 18);
  ri.tintColor = Color.gray();
  ri.centerAlignImage();
  const rl = right.addText("Hoy");
  rl.font = Font.systemFont(10);
  rl.textColor = Color.gray();
  rl.centerAlignText();
  const rv = right.addText(short(total));
  rv.font = Font.boldRoundedSystemFont(22);
  rv.textColor = toneColor(total, SLOTS.reduce((a, s) => a + GOALS[s], 0));
  rv.minimumScaleFactor = 0.7;
  rv.lineLimit = 1;
  rv.centerAlignText();
  // Si una app estaba en uso al dibujar el widget, se dice cuál; debajo, la hora en
  // que se dibujó. La hora no envejece: "hace X min" dejaba de ser cierto al rato.
  if (st.openNow) {
    const ru = right.addText(`${st.openSlots.map(s => SHORT[s]).join("+")} en uso`);
    ru.font = Font.semiboldSystemFont(10);
    ru.textColor = new Color("#F2992A");
    ru.lineLimit = 1;
    ru.minimumScaleFactor = 0.8;
    ru.centerAlignText();
  }
  const rs = right.addText(fresh);
  rs.font = Font.systemFont(10);
  rs.textColor = Color.gray();
  rs.lineLimit = 1;
  rs.centerAlignText();
}

if (config.runsInWidget) {
  Script.setWidget(w);
} else {
  // Vista previa dentro de Scriptable: cambia el tamaño en el parámetro del widget
  // o aquí para probar.
  if (isAccessory) await w.presentAccessoryRectangular();
  else if (family === "small") await w.presentSmall();
  else await w.presentMedium();
}
Script.complete();
