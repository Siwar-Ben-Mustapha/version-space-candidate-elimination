"""GET /api/exemples → jeux de données du cours."""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from _exemples import TOUS  # noqa: E402
from _http import make_handler  # noqa: E402

handler = make_handler(get=lambda _: TOUS)
