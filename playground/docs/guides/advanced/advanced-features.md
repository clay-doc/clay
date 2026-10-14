---
title: Advanced Features
icon: fa-solid fa-wand-magic-sparkles
---

# Advanced Features

This page covers advanced Clay topics for users who want to get the most out of their documentation site.

## Deep Nesting

This page itself is an example of deep nesting — it lives at `docs/guides/advanced/advanced-features.md`, which is two levels deep inside the `docs/` directory. Clay handles any reasonable nesting depth automatically.

The corresponding `dir-meta.yaml` for this structure looks like:

```yaml
- path: "guides"
  name: "Guides"
  icon: "fa-solid fa-book-open"
  children:
    - path: "advanced"
      name: "Advanced"
      icon: "fa-solid fa-wand-magic-sparkles"
      children:
```

## Multi-Language Code Examples

Since Clay supports multiple syntax highlighting languages via Shiki, you can showcase the same concept in different languages. Clay Oven detects each language automatically, so no extra configuration is needed.

### Python

```python
class DocumentationPage:
    def __init__(self, title: str, icon: str = None):
        self.title = title
        self.icon = icon

    def render(self) -> str:
        prefix = f"{self.icon} " if self.icon else ""
        return f"{prefix}{self.title}"

page = DocumentationPage("Getting Started", "🚀")
print(page.render())  # 🚀 Getting Started
```

### JavaScript

```js
class DocumentationPage {
  constructor(title, icon = null) {
    this.title = title;
    this.icon = icon;
  }

  render() {
    const prefix = this.icon ? `${this.icon} ` : '';
    return `${prefix}${this.title}`;
  }
}

const page = new DocumentationPage('Getting Started', '🚀');
console.log(page.render()); // 🚀 Getting Started
```

### C#

```cs
public class DocumentationPage
{
    public string Title { get; set; }
    public string? Icon { get; set; }

    public DocumentationPage(string title, string? icon = null)
    {
        Title = title;
        Icon = icon;
    }

    public string Render()
    {
        var prefix = Icon != null ? $"{Icon} " : "";
        return $"{prefix}{Title}";
    }
}

var page = new DocumentationPage("Getting Started", "🚀");
Console.WriteLine(page.Render()); // 🚀 Getting Started
```

## Custom Base URLs

When deploying your documentation to a subpath (e.g., `https://example.com/docs/`), set the `baseURL` in your `clay.yaml`:

```yaml
baseURL: "/docs/"
```

You can also override this at build time using the `CLAY_BASE_URL` environment variable, without modifying your config file:

```bash
CLAY_BASE_URL="/my-custom-path/" ./clay-oven
```

This is particularly useful in CI/CD pipelines where the deployment path may vary between environments (e.g., staging vs. production).

## Clay Oven CLI Options

When building your site, Clay Oven supports several CLI flags to customise its behaviour:

| Flag   | Description                                              | Default          |
|--------|----------------------------------------------------------|------------------|
| `-c`   | Path to config file                                      | `clay.yaml`      |
| `-d`   | Path to documents directory                              | `./docs`         |
| `-o`   | Output directory                                         | `./output`       |
| `-fm`  | Path to folder meta file                                 | `dir-meta.yaml`  |
| `-nc`  | Skip confirmation prompts                                | —                |
| `-ci`  | Run in CI mode (plain output, no TUI, auto-confirm)      | —                |
| `-v`   | Enable verbose (debug) output                            | —                |

For example, to build with a custom docs directory and output path:

```bash
./clay-oven -d ./documentation -o ./dist
```

## Integration with CI/CD

Clay is designed to fit into automated workflows. Here's an example GitHub Actions workflow that builds and deploys your documentation on every push to `main`:

```yaml
name: Build Documentation

on:
  push:
    branches: [main]
    paths:
      - 'docs/**'
      - 'clay.yaml'
      - 'dir-meta.yaml'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build docs
        run: curl -fsSL https://raw.githubusercontent.com/clay-doc/clay-oven/refs/heads/main/run-oven.sh | sh
        env:
          CLAY_BASE_URL: "/my-project/"

      - name: Deploy
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./output
```

> [!TIP]
> Use the `-ci` flag or the `run-oven.sh` script in CI pipelines to avoid interactive prompts. Only trigger builds when files in `docs/`, `clay.yaml`, or `dir-meta.yaml` change to save CI minutes.

## Tips for Large Documentation Sites

| Challenge | Solution |
|-----------|----------|
| Too many pages in one directory | Split into subdirectories by topic |
| Inconsistent navigation labels | Always use frontmatter `title` fields |
| Missing icons in the sidebar | Set icons in both frontmatter and `dir-meta.yaml` |
| Broken cross-links | Use relative paths and test links after restructuring |
