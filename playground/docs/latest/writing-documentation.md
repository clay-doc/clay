---
title: Writing Documentation
icon: fa-solid fa-pen-to-square
---

# Writing Documentation

Clay uses **Markdown** as its content format. If you're familiar with Markdown, you already know how to write Clay documentation. This page covers Clay-specific features and best practices.

## Frontmatter

Every Markdown file can include a YAML frontmatter block at the top. This metadata controls how the page appears in the navigation:

```yaml
---
title: My Page Title
icon: fa-solid fa-file
description: What this page covers, in one or two sentences.
order: 1
---
```

| Property | Description | Required |
|----------|-------------|----------|
| `title` | The display name shown in the sidebar navigation. If omitted, the page's first `# heading` is used, then the file name (`getting-started.md` becomes "Getting started"). | No |
| `icon` | A [FontAwesome](https://fontawesome.com/icons) icon class displayed next to the title. | No |
| `description` | A short summary of the page (about 150 characters) used by search engines and link previews. If omitted, the first paragraph is used. | No |
| `order` | Position in the navigation, see below. | No |

## Page Order

Pages and folders are listed alphabetically by file name. To change the order, give pages an `order` in their frontmatter and folders an `order` in `dir-meta.yaml`. Entries with an order come first, lowest number first; the rest follow alphabetically.

At the bottom of every page, Clay links to the previous and next page in this order.

## Headings

Use standard Markdown headings to structure your content:

```markdown
# Heading 1
## Heading 2
### Heading 3
#### Heading 4
```

Clay uses headings to build an on-page table of contents, so make sure to structure your documents with clear heading hierarchy.

## Code Blocks

Clay supports syntax-highlighted code blocks via [Shiki](https://shiki.matsu.io/). Specify the language after the opening triple backticks:

~~~markdown
```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```
~~~

This renders as:

```python
def greet(name: str) -> str:
    return f"Hello, {name}!"
```

Languages are detected automatically: Clay Oven scans every code block in `docs/` and enables highlighting for each language it finds. Use [Shiki language identifiers](https://shiki.matsu.io/languages) — blocks with an unknown language are rendered as plain text.

## Links

You can link to other documentation pages using relative paths:

```markdown
[Getting Started](getting-started.md)
[Nested Page](guides/organizing-pages.md)
```

External links work as usual:

```markdown
[Clay on GitHub](https://github.com/clay-doc/clay)
```

## Tables

Standard Markdown tables are fully supported:

```markdown
| Feature        | Supported |
|----------------|-----------|
| Tables         | ✅         |
| Code blocks    | ✅         |
| Nested folders | ✅         |
```

| Feature        | Supported |
|----------------|-----------|
| Tables         | ✅         |
| Code blocks    | ✅         |
| Nested folders | ✅         |

## Blockquotes and Alerts

Use blockquotes for callouts:

```markdown
> This is a standard blockquote.

> [!TIP]
> This is a tip callout.

> [!IMPORTANT]
> This is an important callout.

> [!WARNING]
> This is a warning callout.
```

> [!TIP]
> Use callouts sparingly to highlight genuinely important information.

## Images

You can include images using standard Markdown syntax:

```markdown
![Alt text](path/to/image.png)
```

Place image files alongside your Markdown files in the `docs/` directory or in a dedicated subdirectory.

## Best Practices

1. **Use descriptive filenames** — `getting-started.md` is better than `doc1.md`.
2. **Keep pages focused** — Each page should cover a single topic.
3. **Use frontmatter consistently** — Always set a `title` and `icon` for a polished navigation.
4. **Structure with headings** — Use `##` for main sections and `###` for subsections.
5. **Link between pages** — Cross-reference related documentation to help readers navigate.
