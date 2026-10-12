"""Petit utilitaire commun aux fonctions serverless (format Vercel Python : classe `handler`)."""
import json
from http.server import BaseHTTPRequestHandler

from _ce import LanguageError
from _carnet import CarnetError

MAX_BODY = 512 * 1024


def make_handler(get=None, post=None):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code, payload):
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def _call(self, fn, data):
            try:
                self._send(200, fn(data))
            except CarnetError as e:
                self._send(422, {"erreur": str(e), "ligne": e.line})
            except (LanguageError, ValueError, KeyError, TypeError) as e:
                self._send(422, {"erreur": str(e)})

        def do_GET(self):
            if not get:
                return self._send(405, {"erreur": "Method not allowed."})
            self._call(get, None)

        def do_POST(self):
            if not post:
                return self._send(405, {"erreur": "Method not allowed."})
            length = int(self.headers.get("Content-Length") or 0)
            if length > MAX_BODY:
                return self._send(413, {"erreur": "Request too large."})
            try:
                data = json.loads(self.rfile.read(length) or b"{}")
            except json.JSONDecodeError:
                return self._send(400, {"erreur": "The request body must be JSON."})
            self._call(post, data)

        def log_message(self, *args):  # silencieux
            pass

    return Handler
