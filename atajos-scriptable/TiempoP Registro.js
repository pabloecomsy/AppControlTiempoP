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

const VERSION = "2026-10-26.10";
const SLOTS = ["instagram", "facebook", "chrome"];
const ALIAS = {
  ig: "instagram", insta: "instagram", instagram: "instagram",
  fb: "facebook", face: "facebook", facebook: "facebook",
  chrome: "chrome", navegador: "chrome", browser: "chrome", web: "chrome",
};
const OPEN_WORDS  = ["abrir", "abre", "abierto", "abierta", "open", "opened", "inicio"];
const CLOSE_WORDS = ["cerrar", "cierra", "cerrado", "cerrada", "close", "closed", "fin"];
// Si una sesión queda "abierta" porque iOS no avisó el cierre, no se cuenta más que esto.
const MAX_SESSION_MIN = 90;
const LOG_LIMIT = 40;
// Límite diario para la alerta (minutos, suma de las tres apps). Se cambia desde el
// resumen del registro y se guarda con tus datos; 0 la desactiva.
const DEFAULT_ALERT_MIN = 60;
// Después del límite, recordatorio cada tantos minutos más (0 = solo una vez).
const ALERT_REPEAT_MIN = 30;
const ALERT_ID = "tiempop-limite";
const FILE = "tiempop.json";

// ---------- almacenamiento ----------
const fm = FileManager.local();
const path = fm.joinPath(fm.documentsDirectory(), FILE);

function pad(n) { return String(n).padStart(2, "0"); }
function dayKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function parseDayKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function hhmm(ts) { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function emptyDay(key) {
  return { dayKey: key, seconds: {}, openAt: {}, sessions: [], updatedAt: null, history: [], log: [] };
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
  if (!data.log) data.log = [];
  if (!data.sessions) data.sessions = [];

  // Cambio de día: se cierran las sesiones abiertas al final del día guardado,
  // se archiva ese día y las sesiones siguen abiertas desde las 00:00 de hoy.
  const today = dayKey(now);
  if (data.dayKey !== today) {
    const endOfStored = startOfDay(parseDayKey(data.dayKey)).getTime() + 86400000;
    for (const slot of Object.keys(data.openAt)) {
      const elapsed = Math.max(0, Math.min(endOfStored - data.openAt[slot], MAX_SESSION_MIN * 60000));
      data.seconds[slot] = (data.seconds[slot] || 0) + elapsed / 1000;
      data.sessions.push([slot, data.openAt[slot], data.openAt[slot] + elapsed]);
      data.openAt[slot] = startOfDay(now).getTime();
    }
    const hasUse = Object.values(data.seconds).some(s => s > 0);
    if (hasUse) {
      data.history = data.history.filter(h => h.dayKey !== data.dayKey);
      data.history.push({ dayKey: data.dayKey, seconds: data.seconds,
                          recordOfflineMin: Math.floor(longestGap(data.sessions, endOfStored, true) / 60000) });
      data.history.sort((a, b) => a.dayKey < b.dayKey ? -1 : 1);
      if (data.history.length > 30) data.history = data.history.slice(-30);
    }
    data.dayKey = today;
    data.seconds = {};
    data.sessions = [];
    data.updatedAt = null;
  }
  sweepStale(data, now);
  if (!data.lastCloseAt) data.lastCloseAt = lastExitFromLog(data) || null;
  return data;
}

function save(data) {
  fm.writeString(path, JSON.stringify(data));
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
function closeSession(data, slot, now) {
  const openAt = data.openAt[slot];
  if (!openAt) return 0;
  const elapsed = Math.max(0, Math.min(now.getTime() - openAt, MAX_SESSION_MIN * 60000));
  data.seconds[slot] = (data.seconds[slot] || 0) + elapsed / 1000;
  data.sessions.push([slot, openAt, openAt + elapsed]);
  data.lastCloseAt = Math.max(data.lastCloseAt || 0, openAt + elapsed);
  delete data.openAt[slot];
  return elapsed / 1000;
}

// Una sesión que lleva más del tope abierta es un cierre perdido: se cierra en
// inicio + tope, para que no bloquee el contador "sin redes" ni sume de más.
function sweepStale(data, now) {
  for (const slot of Object.keys(data.openAt)) {
    const openAt = data.openAt[slot];
    if (now.getTime() - openAt >= MAX_SESSION_MIN * 60000) {
      closeSession(data, slot, new Date(openAt + MAX_SESSION_MIN * 60000));
    }
  }
}

// Respaldo para datos anteriores a esta versión: última salida según la bitácora.
function lastExitFromLog(data) {
  let t = 0;
  for (const e of data.log || []) {
    if (e.r === "ok" && /cerr|clos|fin/i.test(e.p || "")) t = Math.max(t, e.t);
  }
  return t;
}

function openSession(data, slot, now) {
  // Solo una app puede estar en pantalla a la vez: abrir una cierra las demás.
  // También cierra una sesión previa de la misma app si se perdió su aviso de cierre.
  for (const s of Object.keys(data.openAt)) closeSession(data, s, now);
  data.openAt[slot] = now.getTime();
}

// Mayor hueco entre sesiones de hoy (ms). Cuenta desde el fin de la primera sesión;
// si no hay ninguna app abierta, el hueco actual hasta `until` también cuenta.
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
  const midnight = startOfDay(now).getTime() + 86400000;
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

function rawText(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) return raw.map(String).join(" ");
  try { return JSON.stringify(raw); } catch (e) { return String(raw); }
}

function parseParam(text) {
  if (text == null) return { slot: null, event: null };
  const tokens = text.toLowerCase().split(/[^a-záéíóúñ]+/).filter(Boolean);
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

if (event === "reset") {
  const fresh = emptyDay(dayKey(now));
  fresh.history = data.history;
  fresh.log = data.log;
  fresh.lastCloseAt = data.lastCloseAt;
  fresh.settings = data.settings;
  fresh.seen = data.seen;
  log(fresh, now, raw, "reinicio");
  save(fresh);
  Script.setShortcutOutput("TiempoP: día reiniciado");
} else if (slot && event === "open") {
  openSession(data, slot, now);
  markSeen(data, slot, "open", now);
  data.updatedAt = now.getTime();
  log(data, now, raw, "ok");
  await scheduleAlert(data, slot, now);
  save(data);
  Script.setShortcutOutput(`${slot}: ${fmt(minutesToday(data, slot, now))} hoy`);
} else if (slot && event === "close") {
  const wasOpen = !!data.openAt[slot];
  closeSession(data, slot, now);
  markSeen(data, slot, "close", now);
  data.updatedAt = now.getTime();
  log(data, now, raw, wasOpen ? "ok" : "ya estaba cerrada");
  await cancelAlert();
  save(data);
  Script.setShortcutOutput(`${slot}: ${fmt(minutesToday(data, slot, now))} hoy`);
} else if (raw == null && config.runsInApp) {
  // Abierto a mano: resumen, últimos eventos y opción de reiniciar.
  const lines = SLOTS.map(s => `${s}: ${fmt(minutesToday(data, s, now))}${data.openAt[s] ? " (abierta)" : ""}`);
  const openNow = Object.keys(data.openAt).length > 0;
  const withOpen = data.sessions.concat(Object.keys(data.openAt).map(s => [s, data.openAt[s], now.getTime()]));
  const rec = Math.floor(longestGap(withOpen, now.getTime(), openNow) / 60000);
  lines.push("", `Récord sin redes hoy: ${withOpen.length ? fmt(rec) : "—"}`);
  if (!openNow && data.lastCloseAt) lines.push(`Llevas sin redes: ${fmt(Math.floor((now.getTime() - data.lastCloseAt) / 60000))}`);
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
        data.settings = Object.assign({}, data.settings, { alertMin: v });
        if (!v) await cancelAlert();
        save(data);
      }
    }
  } else if (idx === 3) {
    const fresh = emptyDay(dayKey(now));
    fresh.history = data.history;
    fresh.log = data.log;
    fresh.lastCloseAt = data.lastCloseAt;
    fresh.settings = data.settings;
  fresh.seen = data.seen;
    log(fresh, now, "(manual)", "reinicio");
    save(fresh);
  }
} else {
  log(data, now, raw, "no reconocido");
  save(data);
  Script.setShortcutOutput("TiempoP: parámetro no reconocido. Usa por ejemplo «instagram abrir».");
}

}

Script.complete();
