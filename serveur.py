"""
Serveur de développement local (bibliothèque standard uniquement) :
sert public/ et route /api/<nom> vers api/<nom>.py, comme sur Vercel.

    python serveur.py        → http://localhost:8000
"""
import importlib.util
import os
import sys
import types
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))
API = os.path.join(ROOT, "api")
sys.path.insert(0, API)

_handlers = {}


def load(name):
    if name not in _handlers:
        path = os.path.join(API, f"{name}.py")
        if name.startswith("_") or not os.path.isfile(path):
            return None
        spec = importlib.util.spec_from_file_location(f"api_{name}", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _handlers[name] = mod.handler
    return _handlers[name]


class Dev(SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=os.path.join(ROOT, "public"), **k)

    def _api(self):
        name = self.path.split("?")[0][len("/api/"):].strip("/")
        h = load(name)
        if h is None:
            self.send_error(404)
            return True
        # réutilise la logique du handler Vercel sur cette connexion
        for m in ("_send", "_call"):
            setattr(self, m, types.MethodType(getattr(h, m), self))
        getattr(h, f"do_{self.command}")(self)
        return True

    def do_GET(self):
        if self.path.startswith("/api/"):
            return self._api()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self._api()
        self.send_error(405)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s\n" % (fmt % args))


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    print(f"Espace des versions → http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Dev).serve_forever()
