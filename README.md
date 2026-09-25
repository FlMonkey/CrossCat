# CrossCat prototype

CrossCat catalogs clothing from a product photo and seller description, then searches that inventory from a customer's natural-language request. It uses the labels in `clothing_search_attributes.json`, the OpenAI Responses API for classification, and a local SQLite database. Unrelated attributes are omitted, so their effective score is zero.

## Run

Requires Python 3.14 (as specified in `pyproject.toml`) and an OpenAI API key. No Python packages need to be installed. Put `OPENAI_API_KEY=your-api-key` in a local `.env` file, or export it in the terminal where you start the server. The `.env` file is ignored by Git; an exported key takes precedence.

```bash
python3 main.py
```

Open <http://127.0.0.1:8000>. You can change the model with `OPENAI_MODEL` (default: `gpt-4o-mini`) and the port with `CROSSCAT_PORT`. Uploaded images and `inventory.sqlite3` are stored in `data/`, which is ignored by Git. Set `CROSSCAT_DATA_DIR` to change that location.

Run the local checks with `python3 -m unittest discover -s tests -v`.

## How matching works

The model selects one garment path for each product and assigns 0–1 scores only to attributes supported by the image or description. Search uses the same attribute list. A requested attribute has a positive score; an exclusion, such as “not blue,” has a negative score down to -1. Explicit garment types act as a hierarchy gate: a search for pants includes jeans and trousers, while excluding shirts. Results are ranked by weighted agreement with positive attributes and absence of excluded attributes. The match percentage is a relative heuristic, not a calibrated probability.

This is a single-store, local prototype. It has no authentication, stock quantity, size, price, SKU, or checkout integration. Keep the server bound to `127.0.0.1` unless you add those protections. Each upload and each search calls the OpenAI API and may incur usage charges.
