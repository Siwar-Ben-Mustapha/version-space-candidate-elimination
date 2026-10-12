"""POST /api/classer  {"texte": "<carnet>", "valeurs": [...], "etape": n?} → verdict."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from _carnet import classify  # noqa: E402
from _http import make_handler  # noqa: E402

handler = make_handler(post=lambda d: classify(str(d["texte"]), list(d["valeurs"]), d.get("etape")))
