"""Run after adding images: python scripts/update-image-dimensions.py (requires Pillow)."""
import json
import re
from pathlib import Path

from PIL import Image, UnidentifiedImageError

root = Path(__file__).resolve().parents[1]
sizes = {}
for path in sorted((root / 'assets').rglob('*')):
    if not path.is_file():
        continue
    key = '/' + path.relative_to(root).as_posix()
    try:
        with Image.open(path) as image:
            sizes[key] = list(image.size)
    except (UnidentifiedImageError, OSError):
        if path.suffix == '.svg':
            match = re.search(r'viewBox="[\d.]+ [\d.]+ ([\d.]+) ([\d.]+)"', path.read_text(encoding='utf-8'))
            if match:
                sizes[key] = [float(match[1]), float(match[2])]

(root / 'assets/image-dimensions.json').write_text(
    json.dumps(sizes, separators=(',', ':')), encoding='utf-8'
)
print(f'Updated dimensions for {len(sizes)} images.')
