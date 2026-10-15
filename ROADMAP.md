# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Features

- **OpenAPI**: full support for OpenAPI documents. Pages for every operation and schema, generated from the
  spec, in the navigation, search, link checks and the Markdown for agents.
- **Analytics**: `analytics:` in `clay.yaml` for Plausible, Umami, GoatCounter and Google Analytics. Only in
  `clay build`, one page view per navigation (Clay switches pages without reloading), and events for searches
  without results, copied code and the page menu.
- **Redirects**: `redirects:` in front matter for the old addresses of a page; `clay edit move` and `rename`
  add them.
- **Snippets and variables**: include a file or a part of one, and values like `{{version}}` from `clay.yaml`.
- **Generated docs**: `generate:` in `clay.yaml`, commands that write Markdown before `build` and `dev`, e.g.
  TypeDoc, for API docs from code in any language.
- **Head**: `head:` in `clay.yaml` for extra scripts and meta tags, like chat widgets.
- **Social images**: a preview image for each page, for links shared in chats and social networks.

A plugin system is not planned: the features above cover what plugins are used for in other tools. It comes
back if users need something they do not.

## Smaller issues

- The link check reads Markdown links and images only: files in HTML (`<video src>`, `<img src>`) are not
  checked.
- Badges in a heading become part of its `#` link (`#setup-new`); leave them out of the id.

- `npm audit` reports braces and node-forge, both in Nuxt's dev tooling and without a fix yet; they go away
  when Nuxt updates them.
- unstorage stays pinned to 1.17.5: 1.17.6 breaks Nitro's prerendering (`[unstorage] Invalid key: "/"`); unpin
  once a fixed release is out (`.github/dependabot.yml` skips 1.17.6).
