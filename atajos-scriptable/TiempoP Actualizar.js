// TiempoP Actualizar
// ------------------
// Descarga la última versión de "TiempoP Registro" y "TiempoP Widget" desde GitHub
// y reemplaza los scripts que ya tienes en Scriptable, conservando sus nombres.
// Tus datos (tiempos de hoy e historial) no se tocan.

const BASE = "https://raw.githubusercontent.com/pabloecomsy/AppControlTiempoP/claude/vibrant-newton-uj9hl3/atajos-scriptable/";
const TARGETS = [
  { remote: "TiempoP%20Registro.js", match: /^tiempo\s*p\s*registro\.js$/i, fallback: "TiempoP Registro.js" },
  { remote: "TiempoP%20Widget.js",   match: /^tiempo\s*p\s*widget\.js$/i,   fallback: "TiempoP Widget.js" },
  { remote: "TiempoP%20Actualizar.js", match: /^tiempo\s*p\s*actualizar\.js$/i, fallback: "TiempoP Actualizar.js" },
];

// Los scripts viven en iCloud Drive/Scriptable si iCloud está activado; si no, en local.
function scriptsManager() {
  try {
    const icloud = FileManager.iCloud();
    const dir = icloud.documentsDirectory();
    if (icloud.listContents(dir).some(n => /^tiempo\s*p/i.test(n))) return icloud;
  } catch (e) {}
  return FileManager.local();
}

const fm = scriptsManager();
const dir = fm.documentsDirectory();
const existing = fm.listContents(dir);
const report = [];

for (const t of TARGETS) {
  const req = new Request(BASE + t.remote + "?t=" + Date.now());
  let code;
  try {
    code = await req.loadString();
  } catch (e) {
    report.push(`❌ ${t.fallback}: sin conexión`);
    continue;
  }
  if (!req.response || req.response.statusCode !== 200 || !code.includes("TiempoP")) {
    report.push(`❌ ${t.fallback}: descarga inválida`);
    continue;
  }
  const name = existing.find(n => t.match.test(n)) || t.fallback;
  fm.writeString(fm.joinPath(dir, name), code);
  const ver = (code.match(/const VERSION = "([^"]+)"/) || [])[1];
  report.push(`✅ ${name.replace(/\.js$/, "")}${ver ? "  v" + ver : ""}`);
}

const a = new Alert();
a.title = "TiempoP actualizado";
a.message = report.join("\n") + "\n\nSi el widget no cambia de inmediato, espera unos minutos o quítalo y vuelve a ponerlo.";
a.addAction("OK");
await a.presentAlert();
Script.complete();
