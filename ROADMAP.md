# Roadmap

Open work for Clay and the [example repo](https://github.com/clay-doc/clay-example-repo), roughly in order of
impact.

## Smaller issues

- `npm audit` reports three packages, all used only while building or in `clay dev`, on Clay's own input, and
  without a fixed release Clay could use yet (checked 2026-10-22):
  - braces 3.0.3 (stack exhaustion on nested patterns; via Nitro's globby): no fixed release exists.
  - node-forge 1.4.0 (signature check; via listhen, the dev server's certificates): no fixed release exists.
  - postcss-selector-parser 6.0.10 (slow on long selectors): fixed in 7.1.6, but @tailwindcss/typography pins
    6.0.10; [their PR #429](https://github.com/tailwindlabs/tailwindcss-typography/pull/429) updates it.
