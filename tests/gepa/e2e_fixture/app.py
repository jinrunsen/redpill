"""
Minimal Flask API for BDD end-to-end smoke test.

Two endpoints:
  GET  /health       → {"status": "ok"}
  POST /api/greet    → {"message": "Hello, {name}!"}

This is the "backend" that gsd-executor will implement.
Initially only /health exists. The BDD scenario tests /api/greet,
which should fail until the executor implements it.
"""

from flask import Flask, request, jsonify

app = Flask(__name__)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# NOTE: /api/greet is intentionally NOT implemented.
# The gsd-executor should implement it to make the BDD scenario pass.
# When implemented, it should:
#   POST /api/greet  body: {"name": "World"}  → {"message": "Hello, World!"}


if __name__ == "__main__":
    app.run(port=5555, debug=False)
