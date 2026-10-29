import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.main import app

output = ROOT / "docs/openapi.json"
output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n")
print(f"OpenAPI 已导出到 {output}")
