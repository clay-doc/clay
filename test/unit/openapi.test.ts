import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {validate} from "@scalar/openapi-validator";
import {bundledDocument, findOperation, loadApis, operationCell, typeLabel} from "../../lib/openapi";
import {apiPages} from "../../lib/openapi-pages";
import {loadSite} from "../../lib/site";
import {brokenLinks} from "../../lib/checks";
import {getCurrentDocItemFromRoute, getLinkPartsFromCurrentRoute} from "../../common/nav";
import {buildRequest, curlCommand, exampleOf, fetchCode, parseRawRequest, pythonCode, rawCell, startingInputs, xmlText, type CellData} from "../../common/openapi";
import {renderDoc} from "../../server/utils/render-doc";
import {cellResolver} from "../../server/utils/request-cell";
import {pageMarkdown, llmsTxt, urlMaker} from "../../server/utils/agent-docs";
import {messagesFor} from "../../common/i18n";
import {serverDocument} from "../../server/utils/sanitize";

const site = loadSite("playground", {gitDates: false, env: {}});
const api = site.apis[0]!;
const op = (id: string) => findOperation(site.apis, `petstore ${id}`) as { op: Parameters<typeof operationCell>[1] };
const cellOf = (id: string, values: Record<string, string> = {}) => operationCell(api, op(id).op, values);

function project(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "clay-openapi-"));
    for (const [path, content] of Object.entries(files)) {
        mkdirSync(dirname(join(root, path)), {recursive: true});
        writeFileSync(join(root, path), content);
    }
    return root;
}

describe("OpenAPI documents", () => {
    it("are read with their references, also to other files and in cycles", () => {
        expect(site.warnings).toEqual([]);
        expect(api.name).toBe("petstore");
        expect(api.route).toBe("/api/petstore");
        expect(api.tags.map(tag => [tag.slug, tag.operations.map(o => o.slug)])).toEqual([
            ["pets", ["list-pets", "create-pet", "get-pet", "delete-pet", "upload-photo"]],
            ["store", ["place-order"]],
        ]);
        expect(api.untagged.map(o => o.slug)).toEqual(["health"]);
        expect(api.webhooks.map(o => o.slug)).toEqual(["pet-sold"]);
        const category = api.document.components.schemas.Category;
        expect(category.properties.parent).toBe(category);
        const error = api.document.paths["/pets"].get.responses.default.content["application/json"].schema;
        expect(Object.keys(error.properties)).toEqual(["code", "message"]);
        expect(site.included).toEqual(expect.arrayContaining(["openapi/petstore.yaml", "openapi/schemas/error.yaml"]));
    });

    it("give operations the parameters of their path, and the document's servers and security", () => {
        const get = op("getPet").op;
        expect(get.parameters.map(p => p.name)).toEqual(["petId"]);
        expect(get.security).toEqual([]);
        expect(op("listPets").op.security).toEqual([{apiKey: []}, {bearer: []}]);
        expect(op("listPets").op.servers).toHaveLength(2);
    });

    it("of Swagger 2.0 are upgraded, and problems are reported", () => {
        const root = project({
            "swagger.yaml": "swagger: '2.0'\ninfo: {title: Old, version: '1'}\npaths:\n  /a:\n    get:\n      operationId: getA\n      responses:\n        '200': {description: ok, schema: {$ref: '#/definitions/A'}}\ndefinitions:\n  A: {type: object, properties: {x: {type: string}}}\n",
            "broken.yaml": "openapi: 3.1.0\ninfo: {title: Broken}\npaths: {}\n",
            "refs.yaml": "openapi: 3.1.0\ninfo: {title: Refs, version: '1'}\npaths:\n  /b:\n    get:\n      responses:\n        '200': {$ref: './missing.yaml'}\n",
            "notes.yaml": "just: text\n",
        });
        const {apis, warnings} = loadApis(root, [
            {spec: "swagger.yaml"}, {spec: "broken.yaml", route: "api/broken"}, {spec: "refs.yaml"}, {spec: "notes.yaml"},
            {spec: "missing.yaml"}, {spec: "https://example.com/openapi.json"}, {spec: "../outside.yaml"}, {spec: "swagger.yaml", route: "other/swagger"},
        ]);
        expect(apis.map(a => a.name)).toEqual(["swagger", "broken", "refs"]);
        const old = apis[0]!;
        expect(old.document.openapi).toMatch(/^3\.1/);
        expect(old.schemaNames.get(old.document.paths["/a"].get.responses["200"].content["application/json"].schema)).toBe("A");
        expect(warnings).toEqual(expect.arrayContaining([
            "broken.yaml: /info must have required property 'version'",
            `refs.yaml: "$ref: ./missing.yaml" points to a file that does not exist`,
            `notes.yaml: is not an OpenAPI document (it needs "openapi: 3.x" or "swagger: 2.0")`,
            "clay.yaml: openapi[4]: missing.yaml does not exist",
            `clay.yaml: openapi[5]: "https://example.com/openapi.json" is an address; download the document with "generate" and name the file`,
            "clay.yaml: openapi[6]: ../outside.yaml is outside the project",
            `clay.yaml: openapi[7]: another API already ends its route with "swagger"; give it a route of its own`,
        ]));
    });

    it("are read again only when one of their files changes", () => {
        const spec = (summary: string) => `openapi: 3.1.0\ninfo: {title: A, version: '1'}\npaths:\n  /a:\n    get:\n      operationId: actions/get-policy\n      summary: ${summary}\n      responses:\n        '200': {$ref: './ok.yaml'}\n`;
        const root = project({"api.yaml": spec("First"), "ok.yaml": "description: ok\n"});
        const first = loadApis(root, [{spec: "api.yaml"}]).apis[0]!;
        expect(loadApis(root, [{spec: "api.yaml"}]).apis[0]).toBe(first);
        // An operationId with a slash gets a slug with a dash
        expect(first.untagged[0]!.slug).toBe("actions-get-policy");
        writeFileSync(join(root, "ok.yaml"), "description: fine\n");
        const second = loadApis(root, [{spec: "api.yaml"}]).apis[0]!;
        expect(second).not.toBe(first);
        expect(second.untagged[0]!.operation.responses["200"].description).toBe("fine");
    });

    it("are downloadable as one file, with schemas referenced by name", () => {
        const bundled = bundledDocument(api);
        const text = JSON.stringify(bundled);
        expect(bundled.components.schemas.Category.properties.parent).toEqual({$ref: "#/components/schemas/Category"});
        expect(bundled.paths["/pets/{petId}"].get.responses["200"].content["application/json"].schema).toEqual({$ref: "#/components/schemas/Pet"});
        expect(validate(JSON.parse(text)).valid).toBe(true);
    });
});

describe("types of schemas", () => {
    it("are told in a few words, with names linked", () => {
        const schemas = api.document.components.schemas;
        const link = (name: string) => `/s/${name}`;
        expect(typeLabel(schemas.NewPet.properties.birthday, api.schemaNames)).toBe("string (date) | null");
        expect(typeLabel(schemas.NewPet.properties.owner, api.schemaNames, link)).toBe("[Person](/s/Person) | [Shelter](/s/Shelter)");
        expect(typeLabel({type: "array", items: schemas.Pet}, api.schemaNames, link)).toBe("array of [Pet](/s/Pet)");
        expect(typeLabel(schemas.Order.properties.notes, api.schemaNames)).toBe("map of string");
        expect(typeLabel(schemas.Person.properties.type, api.schemaNames)).toBe('"person"');
        expect(typeLabel(schemas.Pet, api.schemaNames, link, 1)).toBe("[Pet](/s/Pet)");
    });

    it("have example values, without read-only properties in requests", () => {
        const pet = api.document.components.schemas.Pet;
        expect(exampleOf(pet, "reading")).toMatchObject({name: "Rex", id: 42, status: "available", category: {name: "string"}});
        expect(exampleOf(pet, "writing")).not.toHaveProperty("id");
        expect(exampleOf(pet, "reading")).not.toHaveProperty("callbackUrl");
        expect(exampleOf({type: "string", format: "date-time"})).toBe("2026-01-01T12:00:00Z");
        expect(exampleOf({type: "array", items: {type: "integer", minimum: 3}})).toEqual([3]);
    });
});

describe("API pages", () => {
    const page = (route: string) => site.pages.find(p => p.route === route)!;

    it("are made for the overview, tags, operations, webhooks and schemas, in every language", () => {
        expect(page("/api/petstore").markdown).toContain("## Servers");
        expect(page("/api/petstore").title).toBe("Petstore API");
        expect(page("/de/api/petstore").title).toBe("Tierhandlung-API");
        expect(page("/de/api/petstore").markdown).toContain("## Server");
        expect(page("/api/petstore/pets").children.map(c => c.route)).toContain("/api/petstore/pets/get-pet");
        expect(page("/api/petstore/pets/get-pet").markdown).toContain("::: request petstore getPet\n:::");
        expect(page("/api/petstore/pets/get-pet").parents.map(p => p.title)).toEqual(["Petstore API", "pets"]);
        expect(page("/api/petstore/webhooks/pet-sold").markdown).not.toContain("::: request");
        expect(page("/api/petstore/schemas/category").markdown).toContain("::: fields\n- `name` string\n- `parent` [Category](/api/petstore/schemas/category)\n:::");
        expect(page("/api/petstore/schemas/pet").markdown).toContain("- `id` integer (int64) **required** *read-only*");
        // Responses are tabs colored by status, operations rows with their method
        expect(page("/api/petstore/pets/get-pet").markdown).toContain("::: tabs status\n== 200\n\nThe pet");
        expect(page("/api/petstore/pets").markdown).toContain("::: endpoints\n- `GET /pets` [List pets](/api/petstore/pets/list-pets)");
        // The overview describes the schemes inside the form where readers enter them
        expect(page("/api/petstore").markdown).toContain("::: credentials petstore\n::: fields\n- `apiKey`\n\n  API key in the header `X-API-Key`");
        expect(page("/api/petstore/pets/delete-pet").markdown).toContain("> [!WARNING]");
    });

    it("link only to pages and sections that exist", () => {
        const broken = brokenLinks(site.pages, Object.fromEntries(site.versions.map(v => [v.name, v.docsDir])), site.redirects);
        expect(broken.filter(link => link.includes("openapi"))).toEqual([]);
    });

    it("are below the docs in the navigation, where their routes lead", () => {
        const nav = site.editions.find(e => e.prefix === "/de")!.nav;
        expect(nav.apis!.map(a => [a.title, a.route])).toEqual([["Tierhandlung-API", "/api/petstore"]]);
        expect(nav.apis![0]!.children!.map(c => c.title)).toEqual(["pets", "store", "Health check", "Webhooks", "Schemas"]);
        expect(getCurrentDocItemFromRoute("/api/petstore/pets/get-pet", nav)).toMatchObject({displayLink: "/de/api/petstore/pets/get-pet", method: "GET"});
        expect(getLinkPartsFromCurrentRoute("/api/petstore/pets/get-pet", nav).map(p => [p.title, p.isDirectory]))
            .toEqual([["Tierhandlung-API", true], ["pets", true], ["Get a pet", false]]);
        // The docs are found as before
        expect(getCurrentDocItemFromRoute("/reference/components", site.nav)?.displayLink).toBe("/reference/components");
    });

    it("of large APIs list tags on the overview and start closed in the navigation", () => {
        const paths = Array.from({length: 120}, (_, i) => `  /items/${i}:\n    get: {operationId: get${i}, tags: [${i < 60 ? "a" : "b"}], responses: {'200': {description: ok}}}`).join("\n");
        const root = project({"big.yaml": `openapi: 3.1.0\ninfo: {title: Big, version: '1'}\npaths:\n${paths}\n`});
        const big = loadApis(root, [{spec: "big.yaml"}]).apis[0]!;
        const {pages, nav} = apiPages(big, "Big", {prefix: "", version: "", language: "en"}, messagesFor("en"));
        expect(pages[0]!.markdown).toContain("::: cards\n- [a](/api/big/a){fa-solid fa-tag}\n  (60)");
        expect(pages[0]!.markdown).not.toContain("::: endpoints");
        expect(nav.children!.map(item => item.collapsed)).toEqual([true, true]);
        // Small APIs show every operation, and only their schemas start closed
        expect(site.nav.apis![0]!.children!.filter(item => item.collapsed).map(item => item.title)).toEqual(["Schemas"]);
    });

    it("may not take the route of a page of the docs", () => {
        const root = project({
            "clay.yaml": "title: T\nopenapi:\n  - spec: api.yaml\n    route: guides\n",
            "api.yaml": "openapi: 3.1.0\ninfo: {title: A, version: '1'}\npaths: {}\n",
            "docs/guides/setup.md": "# Setup\n",
        });
        expect(loadSite(root, {gitDates: false, env: {}}).warnings).toContain(
            `clay.yaml: the API api.yaml has the route /guides, where docs/guides is; give the API another "route"`);
    });
});

describe("request cells", () => {
    it("know the operation's parameters, body, credentials and an example response", () => {
        const cell = cellOf("listPets");
        expect(cell.parameters).toEqual([
            {name: "status", in: "query", required: false, type: "array of string", description: "Only pets with these statuses.", options: ["available", "pending", "sold"], array: true, example: "available"},
            {name: "limit", in: "query", required: false, type: "integer", example: "20"},
            {name: "X-Request-Id", in: "header", required: false, type: "string (uuid)", example: "3fa85f64-5717-4562-b3fc-2c963f66afa6"},
        ]);
        expect(cell.security).toEqual([{apiKey: []}, {bearer: []}]);
        expect(cell.example?.status).toBe("200");
        const create = cellOf("createPet");
        expect(create.body?.contents.map(c => [c.type, !!c.fields])).toEqual([["application/json", false], ["application/xml", false], ["application/x-www-form-urlencoded", true]]);
        // Each media type has an example of its own
        expect(create.body!.contents[1]!.example).toMatch(/^<pet>\n {2}<name>Rex<\/name>\n {2}<kind>dog<\/kind>\n {2}<tags>\n {4}<tag>string<\/tag>\n {2}<\/tags>\n/);
        expect(JSON.parse(create.body!.contents[0]!.example)).toEqual({name: "Rex", kind: "dog", tags: ["friendly"]});
        const photo = cellOf("uploadPhoto");
        expect(photo.body?.contents[0]?.fields).toEqual([{name: "file", required: true, file: true}, {name: "caption", required: false, file: false}]);
        expect(photo.body?.contents[1]).toEqual({type: "image/png", example: "", file: true});
        // Every scheme of the API, so readers can enter all of them from any cell
        expect(Object.keys(cellOf("deletePet").schemes)).toEqual(["apiKey", "bearer", "basic", "oauth", "openId", "mtls"]);
        expect(cellOf("deletePet").security).toEqual([{oauth: ["write:pets"]}, {openId: []}]);
    });

    it("are found by operationId or by method and path", () => {
        expect("op" in findOperation(site.apis, "petstore GET /pets/{petId}")).toBe(true);
        expect(findOperation(site.apis, "shop getPet")).toEqual({problem: "api", name: "shop", wanted: "getPet"});
        expect(findOperation(site.apis, "petstore getPets")).toEqual({problem: "operation", name: "petstore", wanted: "getPets"});
    });

    it("send what was filled in, with credentials where the scheme puts them", () => {
        const cell = cellOf("listPets");
        const inputs = {...startingInputs(cell), values: {status: "available, sold", limit: "5", "X-Request-Id": "abc"}};
        const request = buildRequest(cell, inputs, {apiKey: {value: "k"}}, (scheme, part) => ({apiKey: {value: "secret"}} as Record<string, Record<string, string>>)[scheme]?.[part]);
        expect(request.url).toBe("https://petstore.example.com/v1/pets?status=available&status=sold&limit=5");
        expect(request.headers).toEqual([["X-Request-Id", "abc"], ["X-API-Key", "secret"]]);
        // Code samples show placeholders where secrets go
        expect(buildRequest(cell, inputs, {apiKey: {value: "k"}}).headers).toContainEqual(["X-API-Key", "<X-API-Key>"]);
        // The alternative with credentials is sent; without any, none
        expect(buildRequest(cell, inputs, {bearer: {token: "t"}}, () => "t").headers).toContainEqual(["Authorization", "Bearer t"]);
        expect(buildRequest(cell, inputs, {}, () => undefined).headers).toEqual([["X-Request-Id", "abc"]]);

        const regional = buildRequest(cellOf("getPet"), {...startingInputs(cellOf("getPet")), server: "https://{region}.petstore.example.com/v1", serverValues: {region: "us"}});
        expect(regional.url).toBe("https://us.petstore.example.com/v1/pets/0");
        const order = cellOf("placeOrder");
        expect(buildRequest(order, startingInputs(order), {basic: {user: "ann", password: "pw"}}, (s, part) => ({user: "ann", password: "pw"} as Record<string, string>)[part]).headers)
            .toContainEqual(["Authorization", `Basic ${btoa("ann:pw")}`]);
        const photo = cellOf("uploadPhoto");
        const upload = buildRequest(photo, {...startingInputs(photo), values: {petId: "1", session: "s1"}});
        expect(upload.headers).toContainEqual(["Cookie", "session=s1"]);
        expect(upload.missing).toEqual(["file"]);
    });

    it("start with their own values, and examples for what is required", () => {
        expect(startingInputs(cellOf("getPet", {petId: "7"})).values).toEqual({petId: "7"});
        expect(startingInputs(cellOf("getPet")).values).toEqual({petId: "0"});
        expect(startingInputs(cellOf("listPets")).values).toEqual({});
        expect(startingInputs(cellOf("createPet", {body: '{"name": "Tom"}'})).body).toBe('{"name": "Tom"}');
    });

    it("write curl, fetch and Python code", () => {
        const cell = cellOf("createPet");
        const request = buildRequest(cell, startingInputs(cell));
        expect(curlCommand(request)).toBe([
            "curl -X POST 'https://petstore.example.com/v1/pets'",
            "  -H 'X-API-Key: <X-API-Key>'",
            "  -H 'Content-Type: application/json'",
            `  --data-raw '${cell.body!.contents[0]!.example}'`,
        ].join(" \\\n"));
        expect(fetchCode(request)).toContain(`method: "POST"`);
        expect(fetchCode(request)).toContain(`body: JSON.stringify({`);
        expect(pythonCode(request)).toContain(`requests.post(`);
        expect(pythonCode(request)).toContain(`"tags": [\n            "friendly",\n        ],`);
    });

    it("can be a request written out", () => {
        expect(parseRawRequest("POST https://x.dev/a HTTP/1.1\nAccept: text/plain\n\nhello")).toEqual(
            {method: "POST", url: "https://x.dev/a", headers: [["Accept", "text/plain"]], body: "hello"});
        const cell = rawCell("PUT https://x.dev/a\nContent-Type: application/json\n\n{}")!;
        expect(buildRequest(cell, startingInputs(cell))).toMatchObject({method: "PUT", url: "https://x.dev/a", headers: [["Content-Type", "application/json"]], body: {text: "{}"}});
        expect(rawCell("just text")).toBeUndefined();
        expect(rawCell("get https://x.dev/a")?.method).toBe("GET");
        expect(rawCell("GET /a")).toBeUndefined();
    });

    it("render as a curl command and an example until the browser takes over", async () => {
        const cells = cellResolver(site.apis, "", messagesFor("en"));
        const html = (await renderDoc("::: request petstore getPet\npetId: 7\n:::\n\n::: request petstore nothing\n:::", "/page", "/", "", "/page", messagesFor("en"), undefined, cells)).html;
        const template = serverDocument.createElement("template");
        template.innerHTML = html;
        const cell = template.content.querySelector<HTMLElement>(".clay-request")!;
        expect(cell.querySelector(".clay-request-code")?.textContent).toBe("curl 'https://petstore.example.com/v1/pets/7'");
        expect(cell.querySelector(".clay-request-status")?.textContent).toBe("Example response · 200");
        const data = JSON.parse(cell.dataset.request!) as CellData;
        expect(data).toMatchObject({method: "GET", path: "/pets/{petId}", values: {petId: "7"}, link: "/api/petstore/pets/get-pet"});
        expect(template.content.querySelector(".markdown-alert-caution")?.textContent).toContain(`The API “petstore” has no operation “nothing”.`);
    });

    it("are reported when they name what does not exist", () => {
        const root = project({
            "clay.yaml": "title: T\nopenapi:\n  - spec: api.yaml\n",
            "api.yaml": "openapi: 3.1.0\ninfo: {title: A, version: '1'}\npaths:\n  /a:\n    get: {operationId: getA, responses: {'200': {description: ok}}}\n",
            "docs/page.md": "# Page\n\n::: request api getA\n:::\n\n::: request api getB\n:::\n\n::: request shop getA\n:::\n\n::: request\nnot a request\n:::\n",
        });
        expect(loadSite(root, {gitDates: false, env: {}}).warnings).toEqual([
            `page.md: "::: request api getB": the API "api" has no operation "getB"`,
            `page.md: "::: request shop getA" names the API "shop", which "openapi" in clay.yaml does not have`,
            `page.md: a request needs a first line like "GET https://api.example.com/items"`,
        ]);
    });
});

describe("XML examples", () => {
    it("name elements and attributes as the schema's xml says", () => {
        const schema = {
            type: "object", xml: {name: "order"},
            properties: {id: {type: "integer", xml: {attribute: true}}, items: {type: "array", xml: {wrapped: true}, items: {type: "string", xml: {name: "item"}}}, note: {type: "string"}},
        };
        expect(xmlText({id: 3, items: ["a", "b"], note: "<hi>"}, schema)).toBe(
            '<order id="3">\n  <items>\n    <item>a</item>\n    <item>b</item>\n  </items>\n  <note>&lt;hi&gt;</note>\n</order>');
        expect(xmlText(["x", "y"], {type: "array", items: {type: "string"}}, "tag")).toBe("<tag>x</tag>\n<tag>y</tag>");
    });
});

describe("API pages for agents", () => {
    const url = urlMaker("https://example.com", "/docs/");
    const page = (route: string) => site.pages.find(p => p.route === route)!;

    it("show request cells as curl commands", () => {
        const markdown = pageMarkdown(page("/reference/components"), site, url);
        expect(markdown).toContain("[Get a pet](https://example.com/docs/api/petstore/pets/get-pet.md)\n\n```sh\ncurl 'https://petstore.example.com/v1/pets/7'\n```");
        expect(markdown).not.toContain("::: request");
        expect(pageMarkdown(page("/api/petstore/pets/get-pet"), site, url)).toContain("```sh\ncurl 'https://petstore.example.com/v1/pets/0'\n```");
    });

    it("describe the schemes instead of the form to enter them", () => {
        const markdown = pageMarkdown(page("/api/petstore"), site, url);
        expect(markdown).not.toContain("::: credentials");
        expect(markdown).toContain("::: fields\n- `apiKey`");
    });

    it("are listed in llms.txt", () => {
        const text = llmsTxt(site, site.editions[0]!, url);
        expect(text).toContain("## Petstore API\n\n- [Petstore API](https://example.com/docs/api/petstore.md)");
        expect(text).toContain("  - [pets](https://example.com/docs/api/petstore/pets.md)");
    });
});
