import {expect, test, type Page} from "@playwright/test";
import {hydrated, watchConsole} from "./helpers";

// The playground's Petstore API (playground/openapi/petstore.yaml); its servers
// do not exist, so the tests answer its requests themselves
async function answer(page: Page, body: unknown, status = 200) {
    const requests: { url: string, method: string, headers: Record<string, string>, body: string | null }[] = [];
    await page.route("https://petstore.example.com/**", async route => {
        const request = route.request();
        if (request.method() === "OPTIONS") {
            await route.fulfill({status: 204, headers: {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}});
            return;
        }
        requests.push({url: request.url(), method: request.method(), headers: request.headers(), body: request.postData()});
        await route.fulfill({status, contentType: "application/json", headers: {"access-control-allow-origin": "*"}, body: JSON.stringify(body)});
    });
    return requests;
}

test.describe("API pages", () => {
    test("are pre-rendered, with the document to download", async ({request}) => {
        const html = await (await request.get("api/petstore/pets/get-pet/")).text();
        expect(html).toContain('<h1 id="get-a-pet">Get a pet</h1>');
        // Without JavaScript, the request cell is a curl command and an example response
        expect(html).toContain("<code>curl 'https://petstore.example.com/v1/pets/0'</code>");
        expect(html).toContain('<meta name="description" content="Get a pet">');
        expect(html).toContain("Example response · 200");
        const document = await request.get("_clay/openapi/petstore.json");
        expect(document.headers()["content-type"]).toMatch(/json/);
        expect((await document.json()).components.schemas.Category.properties.parent).toEqual({$ref: "#/components/schemas/Category"});
        expect(await (await request.get("_clay/oauth-callback.html")).text()).toContain("clay-oauth");
        expect(await (await request.get("api/petstore/pets/get-pet.md")).text()).toContain("```sh\ncurl 'https://petstore.example.com/v1/pets/0'\n```");
    });

    test("are below a line under the docs in the sidebar, operations with their method", async ({page}) => {
        const messages = watchConsole(page);
        await page.goto("reference/components/");
        await hydrated(page);
        const sidebar = page.locator("ul.menu.bg-base-200");
        await expect(sidebar.locator("> li.sidebar-separator")).toHaveCount(1);
        await sidebar.getByRole("link", {name: "Petstore API"}).click();
        await expect(page.locator(".prose h1")).toHaveText("Petstore API");
        const getPet = sidebar.getByRole("link", {name: "GET Get a pet"});
        await expect(getPet.locator(".clay-method")).toHaveText("GET");
        await getPet.click();
        await expect(page.locator(".prose h1")).toHaveText("Get a pet");
        await expect(sidebar.getByRole("link", {name: "GET Get a pet"})).toHaveClass(/menu-active/);
        expect(messages).toEqual([]);
    });

    test("can be made wider by dragging the sidebar's edge, which is kept", async ({page}) => {
        await page.goto("api/petstore/");
        await hydrated(page);
        const sidebar = page.locator("ul.menu.bg-base-200");
        const handle = page.getByRole("separator", {name: "Resize the navigation"});
        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, 400);
        await page.mouse.down();
        await page.mouse.move(460, 400, {steps: 5});
        await page.mouse.up();
        await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(460);
        await handle.press("ArrowLeft");
        await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(444);
        // Set before the first paint on the next page
        await page.reload();
        await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(444);
        await handle.dblclick();
        await expect.poll(async () => Math.round((await sidebar.boundingBox())!.width)).toBe(320);
        // Long titles end in "…", without scrolling the sidebar sideways
        await expect.poll(() => sidebar.evaluate(ul => ul.scrollWidth <= ul.clientWidth)).toBe(true);
    });

    test("leave the page that was shown first unmarked in the sidebar, also when opened with a slash", async ({page}) => {
        await page.goto("reference/components/");
        await hydrated(page);
        const sidebar = page.locator("ul.menu.bg-base-200");
        await expect(sidebar.getByRole("link", {name: "Components"})).toHaveAttribute("aria-current", "page");
        await page.locator(".clay-request").first().getByRole("link", {name: "Get a pet"}).click();
        await expect(page.locator(".prose h1")).toHaveText("Get a pet");
        await expect(sidebar.getByRole("link", {name: "Components"})).not.toHaveAttribute("aria-current", /.*/);
        await expect(sidebar.locator("a[aria-current=page]")).toHaveText(["GETGet a pet"]);
    });
});

test.describe("request cells", () => {
    test("run the request and show the response", async ({page}) => {
        const requests = await answer(page, {id: 7, name: "Rex"});
        await page.goto("reference/components/");
        await hydrated(page);
        const cell = page.locator(".clay-request").first();
        await expect(cell.locator("input").first()).toHaveValue("7");
        await cell.getByRole("button", {name: "Run"}).click();
        await expect(cell.locator(".clay-request-status")).toContainText("200");
        await expect(cell.locator(".clay-request-out pre")).toContainText('"name": "Rex"');
        expect(requests[0]!.url).toBe("https://petstore.example.com/v1/pets/7");
        // Its link leads to the operation's page
        await cell.getByRole("link", {name: "Get a pet"}).click();
        await expect(page.locator(".prose h1")).toHaveText("Get a pet");
    });

    test("send what is filled in, with credentials shared by the API's cells", async ({page}) => {
        const requests = await answer(page, [], 201);
        await page.goto("api/petstore/pets/list-pets/");
        await hydrated(page);
        const cell = page.locator(".clay-request");
        await cell.getByLabel("limit").fill("5");
        await cell.locator("select").first().selectOption({label: "Regional · https://{region}.petstore.example.com/v1"});
        await cell.locator(".clay-request-variable select").selectOption("us");
        await page.unroute("https://petstore.example.com/**");
        const regional = await (async () => {
            const sent: string[] = [];
            await page.route("https://us.petstore.example.com/**", route => {
                if (route.request().method() !== "OPTIONS") sent.push(route.request().url());
                return route.fulfill({status: 200, contentType: "application/json", headers: {"access-control-allow-origin": "*", "access-control-allow-headers": "*"}, body: "[]"});
            });
            return sent;
        })();
        // The key is entered in the API's credentials, and kept for its other cells
        await cell.getByRole("button", {name: "Authorize"}).click();
        const dialog = page.getByRole("dialog", {name: "Credentials"});
        await dialog.getByLabel("X-API-Key").fill("secret-key");
        await dialog.getByRole("button", {name: "Close"}).first().click();
        await expect(cell.locator(".clay-request-status-line")).toHaveText("apiKey");
        await cell.getByRole("button", {name: "Run"}).click();
        await expect(cell.locator(".clay-request-status")).toContainText("200");
        expect(regional).toEqual(["https://us.petstore.example.com/v1/pets?limit=5"]);
        expect(requests).toEqual([]);

        // Code shows a placeholder instead of the key, colored like the code blocks
        await cell.getByRole("button", {name: "curl"}).click();
        await expect(cell.locator(".clay-request-code")).toContainText("-H 'X-API-Key: <X-API-Key>'");
        await expect(cell.locator(".clay-request-code .clay-shiki span").first()).toHaveAttribute("style", /--shiki-light/);
        await expect(cell.locator(".clay-request-code")).not.toContainText("secret-key");

        await page.goto("api/petstore/pets/create-pet/");
        await hydrated(page);
        await expect(page.locator(".clay-request .fa-lock.text-success")).toBeVisible();
        // The overview shows the same credentials, for the whole API
        await page.goto("api/petstore/");
        await hydrated(page);
        await expect(page.locator(".clay-credentials").getByLabel("X-API-Key")).toHaveValue("secret-key");
    });

    test("remember credentials on the device when asked, also after the cell that asked first is gone", async ({page, context}) => {
        await page.goto("api/petstore/pets/list-pets/");
        await hydrated(page);
        // The cell is gone once the overview shows; the overview's form changes the same credentials
        await page.locator("ul.menu.bg-base-200").getByRole("link", {name: "Petstore API"}).click();
        const form = page.locator(".clay-credentials");
        await form.getByLabel("X-API-Key").fill("kept-key");
        await form.getByLabel("Remember on this device").check();
        // Another tab has a session of its own, and the device's storage
        const other = await context.newPage();
        await other.goto("api/petstore/");
        await hydrated(other);
        await expect(other.locator(".clay-credentials").getByLabel("X-API-Key")).toHaveValue("kept-key");
        await expect(other.locator(".clay-credentials").getByLabel("Remember on this device")).toBeChecked();
    });

    test("keep a body for each media type, with its own example", async ({page}) => {
        await page.goto("api/petstore/pets/create-pet/");
        await hydrated(page);
        const cell = page.locator(".clay-request");
        const body = cell.locator(".clay-code-input textarea");
        await expect(body).toHaveValue(/^\{\n {2}"name": "Rex"/);
        // Colored as it is written, like the code blocks (Shiki)
        await expect(cell.locator(".clay-code-input .clay-shiki span", {hasText: "name"}).first()).toHaveAttribute("style", /--shiki-light/);
        await body.fill('{"name": "Tom"}');
        await cell.getByLabel("Type").selectOption("application/xml");
        await expect(body).toHaveValue(/^<pet>\n {2}<name>Rex<\/name>/);
        await expect(cell.locator(".clay-code-input .clay-shiki span", {hasText: "pet"}).first()).toHaveAttribute("style", /--shiki-light/);
        await cell.getByLabel("Type").selectOption("application/json");
        await expect(body).toHaveValue('{"name": "Tom"}');
    });

    test("run the selected cell with ⌘/Ctrl + Enter, wherever the focus is", async ({page}) => {
        const requests = await answer(page, {});
        await page.goto("api/petstore/pets/get-pet/");
        await hydrated(page);
        const cell = page.locator(".clay-request");
        // A click on the cell's title selects it, without focusing a field
        await cell.locator(".clay-request-path").click();
        await expect(cell.locator(".clay-request-selected kbd")).not.toHaveClass(/opacity/);
        await page.keyboard.press("ControlOrMeta+Enter");
        await expect(cell.locator(".clay-request-status")).toContainText("200");
        expect(requests).toHaveLength(1);
    });

    test("ask only for the credentials an operation takes, one method per tab", async ({page}) => {
        await page.goto("api/petstore/pets/delete-pet/");
        await hydrated(page);
        await page.locator(".clay-request").getByRole("button", {name: "Authorize"}).click();
        const dialog = page.getByRole("dialog", {name: "Credentials"});
        await expect(dialog.getByRole("tab")).toHaveText(["oauth", "openId"]);
        await expect(dialog.getByRole("tabpanel").getByLabel("Client ID")).toHaveCount(1);
        await dialog.getByRole("tab", {name: "openId"}).click();
        await expect(dialog.getByRole("tabpanel")).toContainText("OpenID Connect");
    });

    test("speak the language of the page, also after switching to another", async ({page}) => {
        await page.goto("api/petstore/pets/get-pet/");
        await hydrated(page);
        const run = page.locator(".clay-request-actions .btn-primary");
        await expect(run).toHaveText("Run");
        await page.locator("summary[aria-label='Language']").click();
        await page.locator(".navbar a", {hasText: "Deutsch"}).click();
        await page.waitForURL(/\/de\//);
        await expect(run).toHaveText("Ausführen");
    });

    test("ask for what is required before sending", async ({page}) => {
        const requests = await answer(page, {});
        await page.goto("api/petstore/pets/get-pet/");
        await hydrated(page);
        const cell = page.locator(".clay-request");
        await cell.getByLabel("petId").fill("");
        await cell.getByRole("button", {name: "Run"}).click();
        await expect(cell.getByRole("alert")).toHaveText("Fill in: petId");
        expect(requests).toEqual([]);
    });

    test("explain requests the API does not allow from the site", async ({page}) => {
        await page.route("https://httpbin.example.com/**", route => route.abort());
        await page.goto("reference/components/");
        await hydrated(page);
        const cell = page.locator(".clay-request").nth(1);
        await expect(cell.locator("textarea")).toHaveValue(/^POST https:\/\/httpbin\.example\.com\/anything/);
        await cell.locator("textarea").press("ControlOrMeta+Enter");
        await expect(cell.locator(".clay-request-status")).toContainText("CORS");
    });

    test("send a request written out, as edited", async ({page}) => {
        const sent: { method: string, body: string | null }[] = [];
        await page.route("https://httpbin.example.com/**", route => {
            if (route.request().method() !== "OPTIONS") sent.push({method: route.request().method(), body: route.request().postData()});
            return route.fulfill({status: 200, contentType: "text/plain", headers: {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}, body: "ok"});
        });
        await page.goto("reference/components/");
        await hydrated(page);
        const cell = page.locator(".clay-request").nth(1);
        await cell.locator("textarea").fill("PUT https://httpbin.example.com/anything\nContent-Type: application/json\n\n{\"name\": \"Tom\"}");
        await cell.getByRole("button", {name: "Run"}).click();
        await expect(cell.locator(".clay-request-out pre")).toHaveText("ok");
        expect(sent).toEqual([{method: "PUT", body: '{"name": "Tom"}'}]);
    });
});
