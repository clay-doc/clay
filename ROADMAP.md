# Roadmap

Open work for Clay (frontend), [Clay Oven](https://github.com/clay-doc/clay-oven) and the
[example repo](https://github.com/clay-doc/clay-example-repo). Roughly in order of impact.

## Rendering and performance

- **Pre-rendered pages.** Pages are rendered in the browser after loading `clay.yaml`, then
  `clay-structure.yaml`, then the Markdown, one after another. Clay Oven already writes a static entry point per
  page with metadata and the content in `<noscript>`; render the real page there instead, so content shows
  without waiting for JavaScript and every crawler sees it.
- **Fewer startup requests.** Bundle config and structure into the page (or one request) instead of two
  sequential fetches before anything renders.

## Process

- **Checks on pull requests.** Tests only run on pushes to `main`. Run them on pull requests too, without
  releasing.
- **Browser tests in CI.** Only unit tests run in CI. Add end-to-end tests (Playwright) that bake the example
  repo with Clay Oven and exercise navigation, search, links and themes against a static server, as done by
  hand so far. Also load doc routes through the dev server: it renders them on the server, which the baked
  site never does (a browser-only import once broke every doc page there with a 500).
- **Release notes and versioning.** Every push to `main` releases a new patch version without notes. Adopt
  semantic versioning and a changelog (e.g. generated from Conventional Commits).
- **Supply chain.** Pin GitHub Actions to commit SHAs and publish signed build provenance (GitHub artifact
  attestations) in addition to the SHA-256 checksums.

## Features

- Versioned docs (docs per release, version switcher).
- Translations (i18n) with a language switcher.
- Custom components in Markdown (e.g. tabs, cards), diagrams (Mermaid) and math (KaTeX).
- A plugin system and analytics integration.
- "On this page" on small screens (it is shown on wide screens only).

## Smaller issues

- Clay Oven's base URL replacement removes every `//` in files that contain the placeholder, including the
  JavaScript bundles. Replace only the placeholder.
- The link check verifies pages and files but not `#section` anchors (needs GitHub's heading slug rules in Go).
- Titles containing `#` break `clay-structure.yaml`, which uses `#` as its separator.
- Images inside the `<noscript>` content use paths relative to the page URL, so crawlers resolve them wrongly.
- `robots.txt` only takes effect at the domain root; project sites under a base path need the sitemap submitted
  in the search engines' webmaster tools.
- Accessibility pass: skip link, focus styles and contrast of the light theme.
