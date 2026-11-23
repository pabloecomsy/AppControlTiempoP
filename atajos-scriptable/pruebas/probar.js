// Pruebas de TiempoP sin iPhone: ejecuta "TiempoP Registro" y "TiempoP Widget" en
// Node con un Scriptable simulado y un reloj falso.
//   node pruebas/probar.js          corre las pruebas
//   node pruebas/probar.js --sync   copia pruebas/nucleo.js a los dos scripts
const fs = require("fs");
const pathLib = require("path");
const dir = pathLib.join(__dirname, "..");
const REG = pathLib.join(dir, "TiempoP Registro.js");
const WID = pathLib.join(dir, "TiempoP Widget.js");
const core = fs.readFileSync(pathLib.join(__dirname, "nucleo.js"), "utf8").trimEnd();
const RE = /\/\/ ===== NÚCLEO COMPARTIDO: inicio =====[\s\S]*?\/\/ ===== NÚCLEO COMPARTIDO: fin =====/;

if (process.argv.includes("--sync")) {
  for (const f of [REG, WID]) {
    const src = fs.readFileSync(f, "utf8");
    if (!RE.test(src)) throw new Error("sin marcadores: " + f);
    fs.writeFileSync(f, src.replace(RE, () => core));
  }
  console.log("núcleo copiado a los dos scripts");
  process.exit(0);
}

// ---------- Scriptable simulado ----------
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
let NOW = 0;
let files = {};
let notif = { scheduled: [], removed: 0, failSchedule: false };
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(NOW); }
  static now() { return NOW; }
}
function blob(texts) {
  // Objeto que acepta cualquier llamada o propiedad; guarda los textos de addText.
  const f = function () {};
  return new Proxy(f, {
    get(_, k) {
      if (k === "addText") return t => { texts.push(String(t)); return blob(texts); };
      if (k === "then") return undefined;
      if (k === Symbol.toPrimitive) return () => "";
      return blob(texts);
    },
    set() { return true; },
    apply() { return blob(texts); },
    construct() { return blob(texts); },
  });
}
async function run(file, { param = null, widgetParam = null, family = "medium", inApp = false, inWidget = false, alertChoice = 0 } = {}) {
  const texts = [];
  const out = { texts, alert: null, output: null };
  const fm = {
    documentsDirectory: () => "/docs",
    joinPath: (a, b) => a + "/" + b,
    fileExists: p => p in files,
    readString: p => files[p],
    writeString: (p, s) => { files[p] = s; },
  };
  class Alert {
    constructor() { out.alert = this; }
    addAction() {} addDestructiveAction() {} addCancelAction() {} addTextField() {}
    async presentAlert() { return alertChoice; }
    textFieldValue() { return ""; }
  }
  class Notification {
    setTriggerDate(d) { this.at = d.getTime(); }
    async schedule() { if (notif.failSchedule) throw new Error("corte"); notif.scheduled.push(this); }
    static async removePending() { notif.removed++; notif.scheduled = []; }
  }
  const g = {
    FileManager: { local: () => fm, iCloud: () => fm },
    config: { runsInWidget: inWidget, runsInApp: inApp, widgetFamily: inWidget ? family : undefined },
    args: { shortcutParameter: param, widgetParameter: widgetParam, queryParameters: {} },
    Script: { setShortcutOutput: s => { out.output = s; }, setWidget() {}, complete() {} },
    Alert, Notification, Date: FakeDate,
    ListWidget: function () { return blob(texts); },
  };
  for (const k of ["Color", "Font", "Size", "Rect", "Point", "Path", "DrawContext", "SFSymbol", "LinearGradient"]) g[k] = blob([]);
  const src = fs.readFileSync(file, "utf8");
  await new AsyncFunction(...Object.keys(g), src)(...Object.values(g));
  return out;
}
const at = (d, hm) => new Date(`${d}T${hm}:00`).getTime();
const reset = () => { files = {}; notif = { scheduled: [], removed: 0, failSchedule: false }; };
const ev = async (d, hm, param) => { NOW = at(d, hm); return run(REG, { param }); };
const widget = async (d, hm, o = {}) => { NOW = at(d, hm); return (await run(WID, { inWidget: true, ...o })).texts; };
const summary = async (d, hm) => { NOW = at(d, hm); return (await run(REG, { inApp: true })).alert.message; };
const stored = () => JSON.parse(files["/docs/tiempop.json"]);

let failed = 0;
function check(name, cond, extra = "") {
  console.log(`${cond ? "✅" : "❌"} ${name}${cond ? "" : "  → " + extra}`);
  if (!cond) failed++;
}
const D1 = "2026-11-22", D2 = "2026-11-23";

(async () => {
  // 0. El núcleo es idéntico en los dos scripts.
  for (const f of [REG, WID]) {
    const m = fs.readFileSync(f, "utf8").match(RE);
    check(`núcleo sincronizado en ${pathLib.basename(f)}`, m && m[0] === core);
  }

  // 1. Sesión normal: abrir 10:00, cerrar 10:12. Widget y resumen dicen lo mismo.
  reset();
  await ev(D1, "10:00", "instagram abrir");
  let w = await widget(D1, "10:05");
  check("en curso: el widget cuenta la sesión abierta (5m)", w.includes("5m"), w.join("|"));
  check("en curso: indica app en uso y hora de dibujo", w.includes("IG en uso") && w.includes("act. 10:05"), w.join("|"));
  await ev(D1, "10:12", "instagram cerrar");
  w = await widget(D1, "10:40");
  let s = await summary(D1, "10:40");
  check("cerrada: widget 12m y ya no dice en uso", w.includes("12m") && w.includes("act. 10:40"), w.join("|"));
  check("cerrada: resumen 12 min sin (abierta)", /instagram: 12 min\n/.test(s), s);
  check("en segundo plano no suma: 28 min después sigue en 12", w.includes("12m") && !w.includes("40m"));
  check("llevas sin redes 28 min en el resumen", s.includes("Llevas sin redes: 28 min"), s);
  w = await widget(D1, "10:40", { widgetParam: "sin redes" });
  check("widget sin redes: mismo dato (28m)", w.some(t => t.includes("Llevas 28m sin redes")), w.join("|"));
  w = await widget(D1, "10:40", { family: "small" });
  check("pequeño: muestra hora de dibujo", w.includes("act. 10:40"), w.join("|"));

  // 2. Cierre perdido: abrir 10:00 y nada más. A las 14:00 cuenta el tope y marca ≈.
  reset();
  await ev(D1, "10:00", "facebook abrir");
  w = await widget(D1, "14:00");
  s = await summary(D1, "14:00");
  check("cierre perdido: widget ≈1h 30m y no 'en uso'", w.includes("≈1h 30m") && !w.some(t => t.includes("en uso")), w.join("|"));
  check("cierre perdido: resumen ≈ y sin (abierta)", s.includes("facebook: ≈ 1 h 30 min\n") && s.includes("1 cierre perdido"), s);
  check("cierre perdido: sin redes cuenta desde 11:30", s.includes("Llevas sin redes: 2 h 30 min"), s);

  // 3. Medianoche con cierre perdido: abrir 23:50, dormir. A las 08:00 hoy = 0.
  reset();
  await ev(D1, "23:50", "instagram abrir");
  w = await widget(D2, "08:00");
  check("medianoche: sesión muerta no suma al día nuevo (widget)", w.includes("0m") && !w.some(t => /1h 30m|en uso/.test(t)), w.join("|"));
  s = await summary(D2, "08:00");
  check("medianoche: resumen instagram 0 min", s.includes("instagram: 0 min\n"), s);
  await ev(D2, "08:01", "chrome abrir");
  const h = stored().history.find(x => x.dayKey === D1);
  check("medianoche: ayer se archivó con 10 min", h && Math.round(h.seconds.instagram) === 600, JSON.stringify(h));

  // 4. Sesión viva que cruza la medianoche: abrir 23:50, mirar 00:20.
  reset();
  await ev(D1, "23:50", "instagram abrir");
  w = await widget(D2, "00:20");
  check("cruce vivo: hoy lleva 20m y sigue en uso", w.includes("20m") && w.some(t => t.includes("IG en uso")), w.join("|"));

  // 5. Archivo principal a medio escribir: se usa el respaldo, no un día en cero.
  reset();
  await ev(D1, "10:00", "chrome abrir");
  await ev(D1, "10:30", "chrome cerrar");
  files["/docs/tiempop.json"] = '{"dayKey":"2026-11-22","seco';
  w = await widget(D1, "11:00");
  check("archivo dañado: el widget usa el respaldo (30m)", w.includes("30m"), w.join("|"));
  await ev(D1, "11:05", "instagram abrir");
  check("archivo dañado: el registro no borra el día", Math.round(stored().seconds.chrome) === 1800, files["/docs/tiempop.json"]);

  // 6. Cambio IG→FB con los avisos en desorden: FB abrir llega antes que IG cerrar.
  reset();
  await ev(D1, "12:00", "instagram abrir");
  await ev(D1, "12:10", "facebook abrir");
  const before = notif.removed;
  await ev(D1, "12:10", "instagram cerrar");
  check("cambio de app: IG queda en 10 min y FB abierta", Math.round(stored().seconds.instagram) === 600 && !!stored().openAt.facebook);
  check("cambio de app: el cierre tardío no cancela la alerta de FB", notif.removed === before && notif.scheduled.length === 1);

  // 7. Si iOS corta el script al programar la alerta, el evento ya está guardado.
  reset();
  notif.failSchedule = true;
  await ev(D1, "09:00", "instagram abrir");
  check("guardar antes de notificar: la apertura quedó registrada", !!stored().openAt.instagram);

  // 8. "todo cerrar" corta lo que siga abierto.
  reset();
  await ev(D1, "15:00", "instagram abrir");
  await ev(D1, "15:07", "todo cerrar");
  check("todo cerrar: IG 7 min y nada abierto", Math.round(stored().seconds.instagram) === 420 && !Object.keys(stored().openAt).length);
  await ev(D1, "15:08", "instagram abrir");
  check("'instagram abrir' sigue siendo de Instagram", !!stored().openAt.instagram);

  // 9. Todos los tamaños del widget se dibujan sin error.
  for (const family of ["small", "medium", "accessoryRectangular", "accessoryCircular", "accessoryInline"]) {
    for (const widgetParam of [null, "ig", "ig fb", "sin redes"]) {
      try { await widget(D1, "16:00", { family, widgetParam }); }
      catch (e) { check(`dibujo ${family} «${widgetParam}»`, false, e.message); }
    }
  }
  check("todos los tamaños se dibujan", true);

  console.log(failed ? `\n${failed} prueba(s) fallaron` : "\nTodo pasó");
  process.exit(failed ? 1 : 0);
})();
