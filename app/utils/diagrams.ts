// Draws the Mermaid diagrams that the build could not (server/utils/components.ts),
// like pie charts, in the colors of the site's theme. Mermaid is large, so it is
// only loaded on pages that have such diagrams.

type Mermaid = typeof import("mermaid").default;
let mermaid: Promise<Mermaid> | undefined;
let drawn = 0;

// Mermaid reads hex colors, the theme is in oklch: a 1×1 canvas converts the
// theme's colors, mixed into another one by amount (0–1)
function palette() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", {willReadFrequently: true})!;
    const style = getComputedStyle(document.documentElement);
    const color = (name: string) => style.getPropertyValue(`--color-${name}`).trim();

    const mix = (name: string, amount = 1, base = "base-100") => {
        context.globalAlpha = 1;
        context.fillStyle = color(base);
        context.fillRect(0, 0, 1, 1);
        context.globalAlpha = amount;
        context.fillStyle = color(name);
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return "#" + [r, g, b].map(c => c!.toString(16).padStart(2, "0")).join("");
    };
    return {mix, font: getComputedStyle(document.body).fontFamily};
}

function themeVariables(dark: boolean) {
    const {mix, font} = palette();
    const background = mix("base-100"), surface = mix("base-200"), border = mix("base-300");
    const text = mix("base-content"), line = mix("base-content", 0.55), primary = mix("primary");
    const node = mix("primary", dark ? 0.18 : 0.1);
    const onPrimary = mix("primary-content", 1, "primary");
    const series = ["primary", "secondary", "accent", "info", "success", "warning", "error", "neutral"].map(name => mix(name));
    return {
        darkMode: dark, background, fontFamily: font, fontSize: "14px",
        primaryColor: node, primaryBorderColor: primary, primaryTextColor: text,
        secondaryColor: mix("secondary", dark ? 0.18 : 0.1), secondaryBorderColor: mix("secondary"), secondaryTextColor: text,
        tertiaryColor: surface, tertiaryBorderColor: border, tertiaryTextColor: text,
        mainBkg: node, nodeBorder: primary, nodeTextColor: text, textColor: text, titleColor: text, lineColor: line,
        clusterBkg: surface, clusterBorder: border, edgeLabelBackground: background,
        noteBkgColor: surface, noteBorderColor: border, noteTextColor: text,
        actorBkg: node, actorBorder: primary, actorTextColor: text, actorLineColor: line,
        signalColor: text, signalTextColor: text, labelBoxBkgColor: surface, labelBoxBorderColor: border, labelTextColor: text,
        loopTextColor: text, activationBkgColor: surface, activationBorderColor: primary, sequenceNumberColor: onPrimary,
        ...Object.fromEntries(series.map((color, i) => [`pie${i + 1}`, color])),
        pieStrokeColor: background, pieOuterStrokeColor: border, pieTitleTextColor: text, pieLegendTextColor: text, pieSectionTextColor: onPrimary,
        ...Object.fromEntries(series.map((color, i) => [`git${i}`, color])),
    };
}

export async function drawDiagrams(root: ParentNode, dark: boolean, errorMessage: string) {
    // Each diagram once per theme: the theme is only known once the page is shown
    const theme = dark ? "dark" : "light";
    const diagrams = [...root.querySelectorAll<HTMLElement>(".mermaid-diagram[data-client]")].filter(diagram => diagram.dataset.theme !== theme);
    if (!diagrams.length) return;
    mermaid ??= import("mermaid").then(module => module.default);
    const library = await mermaid;
    // "strict": labels are text, no scripts or links that run code. "base" is
    // the theme Mermaid builds from the colors it is given.
    library.initialize({startOnLoad: false, securityLevel: "strict", theme: "base", themeVariables: themeVariables(dark)});

    for (const diagram of diagrams) {
        // The source stays with the diagram, so it can be drawn again in the other theme
        diagram.dataset.source ??= diagram.querySelector(".mermaid-source")?.textContent ?? "";
        const id = `clay-diagram-${++drawn}`;
        try {
            const {svg} = await library.render(id, diagram.dataset.source);
            diagram.innerHTML = svg;
            diagram.dataset.theme = theme;
            diagram.classList.remove("mermaid-error");
        } catch {
            // Mermaid may leave its drawing area behind
            document.getElementById(`d${id}`)?.remove();
            diagram.classList.add("mermaid-error");
            diagram.replaceChildren(Object.assign(document.createElement("pre"), {className: "mermaid-source", textContent: diagram.dataset.source}));
            diagram.prepend(Object.assign(document.createElement("p"), {className: "mermaid-error-message", textContent: errorMessage}));
        }
    }
}
