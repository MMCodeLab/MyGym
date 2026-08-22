"""Semplice server statico per sviluppo locale (nessuna dipendenza esterna).

Uso:
    python serve.py [porta]

Di default usa la porta 5500. Serve i file da questa cartella con i
Content-Type corretti per manifest.webmanifest e per i moduli ES (.js),
necessari perché la PWA e il service worker funzionino correttamente.
"""
import http.server
import mimetypes
import sys

mimetypes.add_type("application/manifest+json", ".webmanifest")
mimetypes.add_type("text/javascript", ".js")


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Disabilita la cache in sviluppo, cosi' le modifiche si vedono subito.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5500
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"MyGym in esecuzione su http://127.0.0.1:{port}")
    server.serve_forever()
