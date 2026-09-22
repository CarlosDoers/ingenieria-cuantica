"""Genera un ZIP publicable a partir de dist/.

Ejecutar `npm run build` antes, o directamente `npm run package`, que hace las dos cosas.
El ZIP se deja en la raíz y no dentro de dist/, para no acabar metiéndolo dentro de sí
mismo en la siguiente ejecución.
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
dist = root / 'dist'
output = root / 'milla-cuantica-netlify.zip'

if not (dist / 'index.html').exists():
    raise SystemExit('No hay dist/index.html. Ejecuta primero: npm run build')

with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for file in sorted(dist.rglob('*')):
        rel = file.relative_to(dist)
        if file.is_file() and not any(p.startswith('.') for p in rel.parts):
            archive.write(file, rel)
print(output)
