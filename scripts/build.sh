#!/usr/bin/env bash
# Genera el proyecto y lo compila para iPhone. Ejecutar en una Mac con Xcode 15+.
#
#   scripts/build.sh            → compila (firma automática, sin instalar)
#   scripts/build.sh run        → compila e instala en el iPhone conectado
#
# Variables opcionales:
#   TEAM_ID=ABCDE12345   Team de Apple Developer (si no, el que tenga Xcode por defecto)
#   DEVICE="iPhone de Pablo"   Nombre del iPhone para `run`
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v xcodegen >/dev/null; then
  echo "Falta xcodegen:  brew install xcodegen" >&2
  exit 1
fi

xcodegen generate

TEAM_ARGS=()
if [[ -n "${TEAM_ID:-}" ]]; then
  TEAM_ARGS=(DEVELOPMENT_TEAM="$TEAM_ID")
fi

case "${1:-build}" in
  build)
    xcodebuild \
      -project TiempoP.xcodeproj \
      -scheme TiempoP \
      -destination 'generic/platform=iOS' \
      -allowProvisioningUpdates \
      "${TEAM_ARGS[@]}" \
      build | xcpretty 2>/dev/null || true
    ;;
  run)
    DEST="platform=iOS,name=${DEVICE:-}"
    if [[ -z "${DEVICE:-}" ]]; then
      # Primer iPhone físico conectado.
      DEST=$(xcrun xctrace list devices 2>/dev/null | grep -E "iPhone" | grep -v Simulator | head -1 \
        | sed -E 's/^(.*) \(([0-9A-F-]+)\)$/platform=iOS,id=\2/')
      [[ -n "$DEST" ]] || { echo "No se detectó un iPhone conectado." >&2; exit 1; }
    fi
    xcodebuild \
      -project TiempoP.xcodeproj \
      -scheme TiempoP \
      -destination "$DEST" \
      -allowProvisioningUpdates \
      "${TEAM_ARGS[@]}" \
      build
    echo "Compilado. Para instalar y lanzar, usa ▶︎ en Xcode (open TiempoP.xcodeproj) o:"
    echo "  xcrun devicectl device install app --device <id> <ruta al .app en DerivedData>"
    ;;
  *)
    echo "Uso: scripts/build.sh [build|run]" >&2
    exit 1
    ;;
esac
