// TiempoP Actualizar
// ------------------
// Instalador y actualizador. En un iPhone nuevo basta con pegar este script y
// ejecutarlo: descarga "TiempoP Registro" y "TiempoP Widget".
// Después, cada vez que lo ejecutes, trae la última versión desde GitHub y
// reemplaza los scripts conservando sus nombres. Tus datos no se tocan.

const BASE = "https://raw.githubusercontent.com/pabloecomsy/AppControlTiempoP/claude/vibrant-newton-uj9hl3/atajos-scriptable/";
const TARGETS = [
  { remote: "TiempoP%20Registro.js", match: /^tiempo\s*p\s*registro\.js$/i, fallback: "TiempoP Registro.js" },
  { remote: "TiempoP%20Widget.js",   match: /^tiempo\s*p\s*widget\.js$/i,   fallback: "TiempoP Widget.js" },
  { remote: "TiempoP%20Actualizar.js", match: /^tiempo\s*p\s*actualizar\.js$/i, fallback: "TiempoP Actualizar.js" },
];

// Los scripts se guardan junto a este mismo script, esté en iCloud Drive o en el
// iPhone. Así funciona igual en una instalación nueva (solo con este script pegado)
// que al actualizar.
function scriptsLocation() {
  const self = (typeof module !== "undefined" && module.filename) || "";
  if (self) {
    const fm = self.includes("Mobile Documents") ? FileManager.iCloud() : FileManager.local();
    return { fm, dir: self.slice(0, self.lastIndexOf("/")) };
  }
  try {
    const icloud = FileManager.iCloud();
    const d = icloud.documentsDirectory();
    if (icloud.listContents(d).some(n => /^tiempo\s*p/i.test(n))) return { fm: icloud, dir: d };
  } catch (e) {}
  const local = FileManager.local();
  return { fm: local, dir: local.documentsDirectory() };
}

const { fm, dir } = scriptsLocation();
const existing = fm.listContents(dir);
const existingCount = existing.filter(n => /^tiempo\s*p\s*(registro|widget)\.js$/i.test(n)).length;
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
a.title = existingCount ? "TiempoP actualizado" : "TiempoP instalado";
a.message = report.join("\n") + "\n\nSi el widget no cambia de inmediato, espera unos minutos o quítalo y vuelve a ponerlo.";
a.addAction("OK");
await a.presentAlert();
Script.complete();
