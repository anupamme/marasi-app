# The benchmark's upstream: answers every GET with the content type in ?ct=
# and a JSON body of ?size= bytes. Listens on 127.0.0.1:18999.
import http.server
import urllib.parse


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        content_type = query.get("ct", ["application/json"])[0]
        size = int(query.get("size", ["0"])[0])
        body = b'{"data":"' + b"x" * size + b'"}'
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", 18999), Handler).serve_forever()
