# Wikipedia Gadgets

Personal gadgets for Polish Wikipedia (`pl.wikipedia.org`) and Wikimedia Polska (`pl.wikimedia.org`), written in vanilla JavaScript and tested with Vitest.

## Files

| File | Description |
|------|-------------|
| `citation.js` | **Citation Helper** — main gadget. Two toolbar buttons in WikiEditor (2010) and the 2017 source editor: **Bibliografia** (manage `{{Cytuj …}}` entries from a configurable source page, with sort, cleanup of unused references, and one-shot normalization against the source) and **Odn** (insert `{{odn}}` references at the cursor). Supports both legacy `{{odn}}` mode and native MediaWiki sub-references (`<ref name="X" details="…" />`) via a "Podprzypisy" toggle that migrates the article between formats. |
| `mass-message.js` | **Mass message** — adds a "Wyślij do wszystkich" link in the page toolbox. Lets you select usernames in the page text, pick a target wiki (`pl.wikipedia.org`, `pl.wikimedia.org`, `meta.wikimedia.org`), and post the same message to every selected user's talk page via `mw.ForeignApi`. Detects gender from the link namespace (`Wikipedysta:` / `Wikipedystka:`). |
| `auto-fill.js` | **Auto-fill edit summary** — pre-fills the edit summary in your own user-namespace edits ("Nowa strona" / "Edycja strony"). Configurable per-user. |

## Tests

```bash
npm install
npm test
```

## Local MediaWiki

A Docker-based MediaWiki 1.45 instance (in the `mediawiki/` subdirectory, not committed to this repo) is used for end-to-end testing. See `mediawiki/setup.sh` for the full setup if you want to recreate it.

```bash
make setup    # first-time install
make start    # start containers
make deploy   # push citation.js to the wiki
make stop     # stop containers
```

## License

Copyright (c) 2026 [Jakub T. Jankiewicz](https://jakub.jankiewicz.org/)

Released under the MIT License. See [LICENSE](https://github.com/WikiZEIT/gadgets/blob/master/LICENSE) for details.
