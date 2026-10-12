"""POST /api/executer  {"texte": "<carnet>"} → états successifs de S, G et du graphe."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from _carnet import run  # noqa: E402
from _http import make_handler  # noqa: E402

handler = make_handler(post=lambda d: run(str(d["texte"])))
