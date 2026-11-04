import sys
from pathlib import Path

# This is the source-checkout entrypoint. Vercel's optimized runtime installs
# external dependencies separately, so load our bundled src package explicitly.
root = Path(__file__).resolve().parent
sys.path.insert(0, str(root / "src"))

from libretto.server import create_app  # noqa: E402

app = create_app(asset_root=root)
