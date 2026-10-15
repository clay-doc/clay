# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Features

- Agent-ready `clay edit`: every action of the editor as a non-interactive subcommand with flags and `--json`
  output (e.g. moving a page, setting a title), so AI agents and scripts can change the docs.
- Agent-ready sites: `/llms.txt` (an index) and `/llms-full.txt` (all docs) at build time, the Markdown of
  every page next to it, and "Copy as Markdown" / "Open in ChatGPT or Claude" on each page.
- A plugin system and analytics integration.

## Smaller issues

- `npm audit` reports braces and node-forge, both in Nuxt's dev tooling and without a fix yet; they go away
  when Nuxt updates them.
- unstorage stays pinned to 1.17.5: 1.17.6 breaks Nitro's prerendering (`[unstorage] Invalid key: "/"`); unpin
  once a fixed release is out (`.github/dependabot.yml` skips 1.17.6).
