from pathlib import Path

from libretto.server import create_app

app = create_app(asset_root=Path(__file__).resolve().parent)
