import html, sys, pathlib
here = pathlib.Path(__file__).parent
src = (here / "fuente.html").read_text()
updater = pathlib.Path(sys.argv[1]).read_text()
src = src.replace("{{UPDATER}}", html.escape(updater.rstrip("\n"), quote=False))
assert "{{" not in src
pass
head, body = src.split("<!--BODY-->", 1)
standalone = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
{head.strip()}
</head>
<body>
{body.strip()}
</body>
</html>
"""
out = pathlib.Path(sys.argv[2]); out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(standalone)
print("ok", len(src), len(standalone))
