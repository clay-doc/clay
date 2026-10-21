# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Smaller issues

- `npm audit` reports braces and node-forge, both in Nuxt's dev tooling and without a fix yet; they go away
  when Nuxt updates them. It also reports postcss-selector-parser in @tailwindcss/typography.
- jsdom stays on 29: jsdom 30 needs Node.js 22.22, and Clay supports Node.js 20.19 and newer. Node.js 20 is out of
  support since April 2026; requiring Node.js 22 is a change for the next major version.
- unstorage stays pinned to 1.17.5: 1.17.6 breaks Nitro's prerendering (`[unstorage] Invalid key: "/"`); unpin
  once a fixed release is out (`.github/dependabot.yml` skips 1.17.6).
- the cli is currently a big switch case statement, no real parser is present; this needs to be refactored to be expandable
