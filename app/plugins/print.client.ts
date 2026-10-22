// Printing a page, or saving it as a PDF, shows it in the light theme with its
// folded details open (assets/css/print.css); both are put back afterwards
export default defineNuxtPlugin(() => {
    let theme: string | undefined;
    let opened: HTMLDetailsElement[] = [];

    window.addEventListener("beforeprint", () => {
        const root = document.documentElement;
        theme = root.dataset.theme;
        root.dataset.theme = "clay-light";
        opened = [...document.querySelectorAll<HTMLDetailsElement>("#content .clay-details:not([open])")];
        for (const details of opened) details.open = true;
    });

    window.addEventListener("afterprint", () => {
        const root = document.documentElement;
        if (theme) root.dataset.theme = theme;
        else delete root.dataset.theme;
        for (const details of opened) details.open = false;
        opened = [];
    });
});
