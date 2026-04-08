# Technical Design: Greeting API

## Architecture

Minimal Flask REST API with one endpoint.

## Endpoint

### POST /api/greet

- **Request body:** `{"name": "string"}`
- **Response 200:** `{"message": "Hello, {name}!"}`
- **Response 400:** `{"error": "name is required"}` (if name missing)

## Implementation

Add the route to `app.py`. No database, no auth, no middleware.

```python
@app.route("/api/greet", methods=["POST"])
def greet():
    data = request.get_json()
    name = data.get("name") if data else None
    if not name:
        return jsonify({"error": "name is required"}), 400
    return jsonify({"message": f"Hello, {name}!"})
```
