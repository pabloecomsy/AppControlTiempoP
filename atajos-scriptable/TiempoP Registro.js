// TiempoP Registro
// ----------------
// Lo ejecutan las automatizaciones de Atajos cuando se abre o se cierra una app.
// Parámetro de texto que recibe desde Atajos:  "instagram abrir", "chrome cerrar", "facebook open", …
// Si lo abres a mano dentro de Scriptable (sin parámetro) muestra el resumen de hoy,
// los últimos eventos recibidos y deja reiniciar el día.
//
// Guarda todo en un archivo JSON dentro de Scriptable. El widget "TiempoP Widget" lo lee.
//
// Alertas: al abrir una de las apps programa una notificación para el momento en que
// el total del día en las tres llegue al límite (1 h por defecto), luego cada 30 min.
// Al doble del límite (2 h por defecto) la alerta pasa a tono de alarma.
// Al salir de la app la cancela, así que solo suena si llegas al límite estando dentro.

const OPEN_WORDS  = ["abrir", "abre", "abierto", "abierta", "open", "opened", "inicio"];
const CLOSE_WORDS = ["cerrar", "cierra", "cerrado", "cerrada", "close", "closed", "fin"];
// "todo cerrar" u "otra abrir" cierran lo que siga abierto. Sirve para una
// automatización extra ("cuando se abra WhatsApp, Mensajes, …") que corta las
// sesiones cuyo aviso de cierre se perdió.
const ALL_WORDS = ["todo", "todas", "todos", "otra", "otras", "ninguna"];
const LOG_LIMIT = 40;
// Límite diario para la alerta (minutos, suma de las tres apps). Se cambia desde el
// resumen del registro y se guarda con tus datos; 0 la desactiva.
const DEFAULT_ALERT_MIN = 60;
// Después del límite, recordatorio cada tantos minutos más (0 = solo una vez).
const ALERT_REPEAT_MIN = 30;
const ALERT_ID = "tiempop-limite";

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
const MAX_SESSION_MIN = 2;
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

function hhmm(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

// Guarda los datos y una copia. Si una lectura cae a media escritura del archivo
// principal, se usa la copia en vez de empezar el día en cero.
function save(data) {
  const json = JSON.stringify(data);
  fm.writeString(path, json);
  try { fm.writeString(backupPath, json); } catch (e) {}
}

// De dónde se ejecutó el script; ayuda a encontrar ejecuciones que no son de Atajos.
function source() {
  if (config.runsInWidget) return "widget";
  if (config.runsInApp) return "app";
  // Scriptable marca como "Siri" lo que se ejecuta desde Atajos.
  return "atajos";
}

// Última vez que llegó cada aviso ("facebook abrir" → fecha). Sobrevive a reinicios
// y a la bitácora corta; sirve para ver qué automatización no está funcionando.
function markSeen(data, slot, event, now) {
  data.seen = data.seen || {};
  data.seen[`${slot} ${event}`] = now.getTime();
}

const SHORT_NAME = { instagram: "IG", facebook: "FB", chrome: "Chrome" };

function seenReport(data, now) {
  const seen = data.seen || {};
  const today = dayKey(now);
  const lines = [];
  for (const slot of SLOTS) {
    for (const [event, word] of [["open", "abrir"], ["close", "cerrar"]]) {
      const t = seen[`${slot} ${event}`];
      let when = "nunca";
      if (t) {
        const d = new Date(t);
        when = dayKey(d) === today ? `hoy ${hhmm(t)}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hhmm(t)}`;
      }
      lines.push(`${t ? "✅" : "⚠️"} ${SHORT_NAME[slot]} ${word}: ${when}`);
    }
  }
  return lines;
}

function log(data, now, raw, result) {
  data.log.push({ t: now.getTime(), p: String(raw).slice(0, 40), r: result, s: source() });
  if (data.log.length > LOG_LIMIT) data.log = data.log.slice(-LOG_LIMIT);
}

// ---------- lógica ----------
function closeAll(data, now) {
  const open = Object.keys(data.openAt);
  for (const s of open) closeSession(data, s, now.getTime());
  return open.length > 0;
}

function openSession(data, slot, now) {
  // Solo una app puede estar en pantalla a la vez: abrir una cierra las demás.
  // También cierra una sesión previa de la misma app si se perdió su aviso de cierre.
  closeAll(data, now);
  data.openAt[slot] = now.getTime();
}

// ---------- alertas ----------
function alertLimit(data) {
  const v = data.settings && data.settings.alertMin;
  return Number.isFinite(v) && v >= 0 ? v : DEFAULT_ALERT_MIN;
}

function closedMinutes(data) {
  return SLOTS.reduce((a, s) => a + (data.seconds[s] || 0), 0) / 60;
}

// Siguiente umbral por encima de lo ya usado: 60, 90, 120…
function nextThreshold(limit, usedMin) {
  if (usedMin < limit) return limit;
  if (!ALERT_REPEAT_MIN) return null;
  return limit + (Math.floor((usedMin - limit) / ALERT_REPEAT_MIN) + 1) * ALERT_REPEAT_MIN;
}

async function cancelAlert() {
  try { await Notification.removePending([ALERT_ID]); } catch (e) {}
}

// "2 HORAS", "1 HORA", "2 H 30 MIN": para el tono de alarma.
function loud(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (m === 0) return h === 1 ? "1 HORA" : `${h} HORAS`;
  return fmt(min).toUpperCase();
}

// Texto y sonido según el umbral: aviso al límite, recordatorio suave después,
// y alarma a partir del doble del límite.
function alertMessage(target, limit, split) {
  const parts = `Instagram ${fmt(Math.round(split.instagram))} · Facebook ${fmt(Math.round(split.facebook))} · Chrome ${fmt(Math.round(split.chrome))}`;
  if (target >= limit * 2) {
    return {
      title: `🚨 YA SON ${loud(target)} EN REDES`,
      body: `${parts}. Cierra la app y suelta el teléfono.`,
      sound: "failure",
    };
  }
  if (target === limit) {
    return { title: `⏰ Llevas ${fmt(target)} en redes hoy`, body: parts, sound: "default" };
  }
  return { title: `Sigues en redes: ${fmt(target)} hoy`, body: parts, sound: "default" };
}

// Programa la alerta para la sesión que acaba de empezar en `slot`.
async function scheduleAlert(data, slot, now) {
  await cancelAlert();
  const limit = alertLimit(data);
  if (!limit) return null;
  const used = closedMinutes(data);
  let target = nextThreshold(limit, used);
  if (target == null) return null;
  let fireAt = now.getTime() + (target - used) * 60000;
  const split = {};
  for (const s of SLOTS) split[s] = (data.seconds[s] || 0) / 60;
  const midnight = nextDayStart(now).getTime();
  if (fireAt > midnight) {
    // A medianoche el día vuelve a cero; si sigues en la app, cuenta desde ahí.
    target = limit;
    fireAt = midnight + limit * 60000;
    for (const s of SLOTS) split[s] = 0;
    split[slot] = limit;
  } else {
    split[slot] += target - used;
  }
  const n = new Notification();
  n.identifier = ALERT_ID;
  n.threadIdentifier = "tiempop";
  Object.assign(n, alertMessage(target, limit, split));
  n.setTriggerDate(new Date(fireAt));
  try {
    await n.schedule();
    data.alertError = null;
  } catch (e) {
    data.alertError = String(e && e.message || e).slice(0, 80);
  }
  return fireAt;
}

function fmt(min) {
  const h = Math.floor(min / 60), m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

function rawText(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  try { return JSON.stringify(raw); } catch (e) { return String(raw); }
}

function parseParam(text) {
  if (text == null) return { slot: null, event: null };
  let slot = null, event = null;
  for (const t of words(text)) {
    if (ALIAS[t]) slot = ALIAS[t];
    else if (ALL_WORDS.includes(t)) slot = slot || "*";
    else if (OPEN_WORDS.includes(t)) event = "open";
    else if (CLOSE_WORDS.includes(t)) event = "close";
    else if (t === "reset" || t === "reiniciar") event = "reset";
  }
  return { slot, event };
}

// Reinicia el día conservando historial, bitácora, ajustes y avisos vistos.
function resetDay(data, now, raw) {
  const fresh = emptyDay(dayKey(now));
  fresh.history = data.history;
  fresh.log = data.log;
  fresh.lastCloseAt = data.lastCloseAt;
  fresh.settings = data.settings;
  fresh.seen = data.seen;
  log(fresh, now, raw, "reinicio");
  save(fresh);
  return fresh;
}

// ---------- ejecución ----------
if (config.runsInWidget) {
  const w = new ListWidget();
  const t = w.addText("Este widget usa «TiempoP Registro». Mantén presionado › Editar y elige «TiempoP Widget» en Script.");
  t.font = Font.systemFont(11);
  t.minimumScaleFactor = 0.6;
  Script.setWidget(w);
} else {

const now = new Date();
const data = load(now);
const raw = rawText(args.shortcutParameter ?? (args.queryParameters && args.queryParameters.evento) ?? null);
const { slot, event } = parseParam(raw);

// Importante: primero se guarda y después se tocan las notificaciones. Si iOS corta
// el script mientras programa la alerta, el evento ya quedó registrado.
if (event === "reset") {
  resetDay(data, now, raw);
  await cancelAlert();
  Script.setShortcutOutput("TiempoP: día reiniciado");
} else if (slot === "*" && event) {
  // "todo cerrar" / "otra abrir": se abrió otra app o se dejó el teléfono.
  const had = closeAll(data, now);
  data.updatedAt = now.getTime();
  log(data, now, raw, had ? "ok" : "nada abierto");
  save(data);
  await cancelAlert();
  Script.setShortcutOutput("TiempoP: sesiones cerradas");
} else if (slot && event === "open") {
  openSession(data, slot, now);
  markSeen(data, slot, "open", now);
  data.updatedAt = now.getTime();
  log(data, now, raw, "ok");
  save(data);
  const before = data.alertError || null;
  await scheduleAlert(data, slot, now);
  if ((data.alertError || null) !== before) save(data);
  Script.setShortcutOutput(`${slot}: ${fmt(minutesToday(data, slot, now))} hoy`);
} else if (slot && event === "close") {
  const wasOpen = !!data.openAt[slot];
  closeSession(data, slot, now.getTime());
  markSeen(data, slot, "close", now);
  data.updatedAt = now.getTime();
  log(data, now, raw, wasOpen ? "ok" : "ya estaba cerrada");
  save(data);
  // Al pasar de una app a otra, el cierre de la primera puede llegar después de
  // la apertura de la segunda: la alerta solo se cancela si ya no queda ninguna abierta.
  if (!Object.keys(data.openAt).length) await cancelAlert();
  Script.setShortcutOutput(`${slot}: ${fmt(minutesToday(data, slot, now))} hoy`);
} else if (raw == null && config.runsInApp) {
  // Abierto a mano: resumen, últimos eventos y opción de reiniciar.
  const st = status(data, now);
  const lines = SLOTS.map(s =>
    `${s}: ${st.estimated.includes(s) ? "≈ " : ""}${fmt(st.minutes[s])}${data.openAt[s] ? " (abierta)" : ""}`);
  if (st.estimated.length) {
    const n = st.estimated.reduce((a, s) => a + data.estimated[s], 0);
    lines.push(`≈ ${n === 1 ? "1 cierre perdido" : n + " cierres perdidos"} hoy: se contó el tope de ${fmt(MAX_SESSION_MIN)}`);
  }
  lines.push("", `Récord sin redes hoy: ${st.hasRecord ? fmt(st.recordMin) : "—"}`);
  if (st.streakStart) lines.push(`Llevas sin redes: ${fmt(st.streakMin)}`);
  const events = data.log.slice(-10).reverse().map(e => {
    const note = e.r === "ok" ? "" : e.r === "reinicio" ? "  ↺ reinicio" : `  ⚠️ ${e.r}${e.s && e.s !== "atajos" ? " (" + e.s + ")" : ""}`;
    return `${hhmm(e.t)}  ${e.r === "reinicio" && e.p === "(manual)" ? "" : e.p}${note}`.replace(/  +/g, "  ");
  });
  const limit = alertLimit(data);
  lines.push("", limit
    ? `Alerta: al llegar a ${fmt(limit)} en redes${ALERT_REPEAT_MIN ? `, luego cada ${ALERT_REPEAT_MIN} min` : ""}`
    : "Alerta: desactivada");
  if (data.alertError) lines.push(`⚠️ No se pudo programar: ${data.alertError}`);
  lines.push("", "Último aviso de cada automatización:", ...seenReport(data, now));
  const a = new Alert();
  a.title = `Hoy ${data.dayKey}  ·  v${VERSION}`;
  a.message = lines.join("\n") + "\n\nÚltimos eventos:\n" + (events.length ? events.join("\n") : "ninguno todavía");
  a.addAction("OK");
  a.addAction("Probar alerta");
  a.addAction("Cambiar límite de alerta");
  a.addDestructiveAction("Reiniciar hoy");
  const idx = await a.presentAlert();
  if (idx === 1) {
    // También sirve para que iOS pida el permiso de notificaciones la primera vez.
    const n = new Notification();
    n.identifier = "tiempop-prueba";
    n.threadIdentifier = "tiempop";
    n.title = "Así se verá tu alerta";
    n.body = limit ? `Te avisaré al llegar a ${fmt(limit)} en Instagram, Facebook y Chrome.` : "La alerta está desactivada.";
    n.sound = "default";
    n.setTriggerDate(new Date(Date.now() + 10000));
    let msg = "Sal de Scriptable: en 10 segundos debe llegar la notificación.";
    try { await n.schedule(); } catch (e) { msg = "No se pudo: activa las notificaciones de Scriptable en Ajustes › Notificaciones."; }
    const ok = new Alert(); ok.title = "Alerta de prueba"; ok.message = msg; ok.addAction("OK");
    await ok.presentAlert();
  } else if (idx === 2) {
    const q = new Alert();
    q.title = "Límite de alerta";
    q.message = "Minutos en total entre Instagram, Facebook y Chrome antes de avisarte. 0 la desactiva.";
    q.addTextField("minutos", String(limit));
    q.addAction("Guardar");
    q.addCancelAction("Cancelar");
    if ((await q.presentAlert()) === 0) {
      const v = parseInt(q.textFieldValue(0), 10);
      if (Number.isFinite(v) && v >= 0) {
        // Se vuelve a leer: mientras el aviso estaba en pantalla pudo llegar un evento.
        const latest = load(new Date());
        latest.settings = Object.assign({}, latest.settings, { alertMin: v });
        save(latest);
        if (!v) await cancelAlert();
      }
    }
  } else if (idx === 3) {
    resetDay(load(new Date()), new Date(), "(manual)");
    await cancelAlert();
  }
} else {
  log(data, now, raw, "no reconocido");
  save(data);
  Script.setShortcutOutput("TiempoP: parámetro no reconocido. Usa por ejemplo «instagram abrir».");
}

}

Script.complete();
