import {existsSync, readFileSync, statSync} from "node:fs";
import {basename, dirname, extname, isAbsolute, join, relative, resolve} from "node:path";
import {load} from "js-yaml";
import GithubSlugger from "github-slugger";
import {upgrade} from "@scalar/openapi-upgrader";
import {validate, validatePathParameters} from "@scalar/openapi-validator";
import type {ApiConfiguration} from "../common/configuration";
import {exampleOf, exampleText, type CellContent, type CellData, type CellField, type CellParameter, type CellScheme} from "../common/openapi";

// OpenAPI documents (3.0, 3.1, and Swagger 2.0, which is upgraded) named by
// "openapi" in clay.yaml, read into what the API pages are made of
// (openapi-pages.ts) and what request cells send (common/openapi.ts).

// Parts of an OpenAPI document: data whose shape the spec defines, read as it comes
type Spec = Record<string, any>;

export const METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"] as const;

export type ApiOperation = {
    id: string; // its operationId, or method and path
    slug: string; // in its URL
    method: string; // lowercase
    path: string; // "/pets/{petId}", or the name of a webhook
    operation: Spec; // the Operation Object, references resolved
    parameters: Spec[]; // those of its path too, unless it overrides them
    servers: Spec[];
    security: Spec[]; // alternatives, each naming the schemes needed together
    webhook?: boolean;
};

export type ApiTag = { name: string, slug: string, description?: string, operations: ApiOperation[] };
export type ApiSchema = { name: string, slug: string, schema: Spec };

// A saved version keeps copies of its APIs' documents in this folder of its own
// (versions.ts), with their settings in apis.yaml, laid out like the project
export const VERSION_APIS = "_openapi";
export const VERSION_APIS_FILE = "apis.yaml";

export type Api = {
    name: string; // the last part of its route, as request cells name it: "::: request petstore getPetById"
    route: string; // in every edition after its prefix, e.g. "/api/petstore"
    title: string;
    icon: string;
    spec: string; // its file, relative to the project
    files: string[]; // its file and the files its references lead to, relative to where it was read from
    document: Spec; // as OpenAPI 3.1, references resolved
    schemaNames: Map<object, string>; // the components' names of schemas, for links to their pages
    tags: ApiTag[];
    untagged: ApiOperation[];
    webhooks: ApiOperation[];
    schemas: ApiSchema[];
};

const isObject = (value: unknown): value is Spec => !!value && typeof value === "object";

// "getPetById" becomes "get-pet-by-id", "actions/get-policy" "actions-get-policy"
const slugger = () => {
    const slugs = new GithubSlugger();
    return (text: string) => slugs.slug(text.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[/.]+/g, "-")) || slugs.slug("operation");
};

// "#/components/schemas/Pet" names "Pet"; schemas of other files are named
// by the last part of their pointer, or by the file
function schemaName(ref: string): string | undefined {
    const [path = "", pointer = ""] = ref.split("#");
    if (path && !pointer.replace(/^\//, "")) return basename(path, extname(path));
    const match = /^\/(?:components\/schemas|definitions)\/([^/]+)$/.exec(pointer) ?? (path ? /\/([^/]+)$/.exec(pointer) : null);
    return match ? match[1]!.replace(/~1/g, "/").replace(/~0/g, "~") : undefined;
}

// Replaces every {$ref} with what it points to, in the document or in another
// file next to it. The same target is the same object: recursive schemas
// become cycles, and names of schemas are kept in names.
function resolveRefs(document: Spec, file: string, dir: string, root: string, problems: string[], names: Map<object, string>) {
    const documents = new Map<string, unknown>([[file, document]]);
    const visited = new Set<object>();
    const name = (path: string) => relative(root, path).split("\\").join("/");

    const lookup = (ref: string, from: string): { value: unknown, file: string } | undefined => {
        const [path = "", pointer = ""] = ref.split("#");
        const target = path ? resolve(dirname(from), decodeURI(path)) : from;
        const problem = (reason: string) => {
            problems.push(`${name(from)}: "$ref: ${ref}" ${reason}`);
            return undefined;
        };
        if (!documents.has(target)) {
            const inside = relative(dir, target);
            if (/^[a-z][a-z\d+.-]*:/i.test(path)) return problem("points to another site; only files of the project can be read");
            if (inside.startsWith("..") || isAbsolute(inside)) return problem("points outside the project");
            if (!existsSync(target)) return problem("points to a file that does not exist");
            try {
                documents.set(target, load(readFileSync(target, "utf8")));
            } catch (error) {
                return problem(`points to a file that cannot be read: ${(error as Error).message.split("\n")[0]}`);
            }
        }
        let value = documents.get(target);
        for (const part of pointer.split("/").slice(1)) {
            const key = decodeURIComponent(part).replace(/~1/g, "/").replace(/~0/g, "~");
            value = isObject(value) ? value[key] : undefined;
            if (value === undefined) return problem("points to nothing");
        }
        return {value, file: target};
    };

    const walk = (node: Spec, from: string) => {
        if (visited.has(node)) return;
        visited.add(node);
        for (const [key, value] of Object.entries(node)) {
            let current: unknown = value;
            let source = from;
            // A reference may lead to another reference
            for (let hops = 0; isObject(current) && typeof current.$ref === "string" && hops < 32; hops++) {
                const ref: string = current.$ref;
                const found = lookup(ref, source);
                if (!found) break;
                // Next to a reference, OpenAPI 3.1 allows a summary and a description of its own
                const own = Object.fromEntries(Object.entries(current).filter(([k]) => k !== "$ref"));
                current = Object.keys(own).length && isObject(found.value) ? {...found.value, ...own} : found.value;
                source = found.file;
                const named = schemaName(ref);
                if (named && isObject(current) && !names.has(current)) names.set(current, named);
            }
            node[key] = current;
            if (isObject(current)) walk(current, source);
        }
    };
    walk(document, file);
    return [...documents.keys()].map(path => relative(dir, path).split("\\").join("/"));
}

// What OpenAPI's validator finds wrong in a document, e.g. "petstore.yaml: /info must have required property 'version'".
// Path parameters are checked once references are resolved, since parameters are often shared.
function validationProblems(spec: string, check: () => { message: string, path?: string | string[] }[]): string[] {
    try {
        return [...new Set(check().map(({path, message}) => {
            const where = Array.isArray(path) ? path.join(" › ") : path;
            return `${spec}: ${where ? `${where} ` : ""}${message}`;
        }))];
    } catch (error) {
        return [`${spec}: cannot be checked: ${(error as Error).message}`];
    }
}

function operations(document: Spec, slug: (text: string) => string): { paths: ApiOperation[], webhooks: ApiOperation[] } {
    const read = (path: string, item: Spec, webhook: boolean): ApiOperation[] => METHODS.filter(method => isObject(item[method])).map(method => {
        const operation = item[method] as Spec;
        // Parameters of the operation replace those of its path with the same name and place
        const own: Spec[] = (operation.parameters ?? []).filter(isObject);
        const inherited: Spec[] = (item.parameters ?? []).filter(isObject).filter((p: Spec) => !own.some(o => o.name === p.name && o.in === p.in));
        // A webhook is named by its name
        const id = typeof operation.operationId === "string" && operation.operationId ? operation.operationId : webhook ? path : `${method} ${path}`;
        return {
            id, slug: slug(id), method, path, operation,
            parameters: [...inherited, ...own],
            servers: operation.servers ?? item.servers ?? document.servers ?? [{url: "/"}],
            security: operation.security ?? document.security ?? [],
            ...(webhook ? {webhook} : {}),
        };
    });
    const entries = (paths: unknown, webhook: boolean) =>
        isObject(paths) ? Object.entries(paths).filter(([, item]) => isObject(item)).flatMap(([path, item]) => read(path, item as Spec, webhook)) : [];
    return {paths: entries(document.paths, false), webhooks: entries(document.webhooks, true)};
}

// The route of an API: as configured, else "/api/" and the spec's file name
export function apiRoute(config: ApiConfiguration): string {
    const given = config.route ?? `api/${basename(config.spec, extname(config.spec))}`;
    return "/" + given.split("/").map(part => part.trim()).filter(Boolean).join("/");
}

// Reads the documents of "openapi" in clay.yaml, or of a saved version's
// apis.yaml: their files are in dir and may not leave it. Problems are reported
// and do not stop the build; a document that cannot be read at all has no pages.
// Files are relative to the project (root).
export function loadApis(root: string, configs: ApiConfiguration[] | undefined, dir = root, source = "clay.yaml: openapi"): { apis: Api[], files: string[], warnings: string[] } {
    const apis: Api[] = [];
    const files: string[] = [];
    const warnings: string[] = [];
    for (const [i, config] of (configs ?? []).entries()) {
        const label = `${source}[${i}]`;
        if (!isObject(config) || typeof config.spec !== "string" || !config.spec) {
            warnings.push(`${label} needs "spec", the file of an OpenAPI document`);
            continue;
        }
        const read = cachedApi(root, dir, config, label);
        files.push(...read.files);
        warnings.push(...read.warnings);
        if (!read.api) continue;
        if (apis.some(api => api.name === read.api!.name)) {
            warnings.push(`${label}: another API already ends its route with "${read.api.name}"; give it a route of its own`);
            continue;
        }
        apis.push(read.api);
    }
    return {apis, files: [...new Set(files)], warnings};
}

type ReadApi = { api?: Api, files: string[], warnings: string[] };

// Documents read before, by their settings: "clay dev" loads the site for every
// page it serves, and a large document takes a while to read and check. A
// document is read again once one of its files has changed.
const readApis = new Map<string, { stamp: string, read: ReadApi }>();
const stampOf = (root: string, files: string[]) => files.map(file => {
    try {
        const stat = statSync(join(root, file));
        return `${file}:${stat.mtimeMs}:${stat.size}`;
    } catch {
        return `${file}:-`;
    }
}).join("|");

function cachedApi(root: string, dir: string, config: ApiConfiguration, label: string): ReadApi {
    const key = JSON.stringify([root, dir, config, label]);
    const cached = readApis.get(key);
    if (cached && stampOf(root, cached.read.files) === cached.stamp) return cached.read;
    const read = readApi(root, dir, config, label);
    readApis.set(key, {stamp: stampOf(root, read.files), read});
    return read;
}

// One document, its files relative to the project
function readApi(root: string, dir: string, config: ApiConfiguration, label: string): ReadApi {
    const files: string[] = [];
    const warnings: string[] = [];
    const done = (api?: Api): ReadApi => ({...(api ? {api} : {}), files, warnings});
    const ofProject = (file: string) => relative(root, resolve(dir, file)).split("\\").join("/");
    const file = resolve(dir, config.spec);
    const spec = relative(root, file).split("\\").join("/");
    const inside = relative(dir, file);
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(config.spec)) {
        warnings.push(`${label}: "${config.spec}" is an address; download the document with "generate" and name the file`);
        return done();
    }
    if (inside.startsWith("..") || isAbsolute(inside)) {
        warnings.push(`${label}: ${config.spec} is outside the project`);
        return done();
    }
    files.push(spec);
    if (!existsSync(file)) {
        warnings.push(`${label}: ${config.spec} does not exist`);
        return done();
    }
    let raw: unknown;
    try {
        raw = load(readFileSync(file, "utf8"));
    } catch (error) {
        warnings.push(`${spec}: cannot be read: ${(error as Error).message.split("\n")[0]}`);
        return done();
    }
    if (!isObject(raw) || !(typeof raw.openapi === "string" || raw.swagger === "2.0")) {
        warnings.push(`${spec}: is not an OpenAPI document (it needs "openapi: 3.x" or "swagger: 2.0")`);
        return done();
    }
    warnings.push(...validationProblems(spec, () => validate(structuredClone(raw)).errors ?? []));

    const route = apiRoute(config);
    const name = route.split("/").at(-1)!;
    let document: Spec;
    try {
        document = raw.openapi?.startsWith("3.1") ? structuredClone(raw) : upgrade(structuredClone(raw), "3.1") as Spec;
    } catch (error) {
        warnings.push(`${spec}: cannot be upgraded to OpenAPI 3.1: ${(error as Error).message}`);
        return done();
    }
    const schemaNames = new Map<object, string>();
    const read = resolveRefs(document, file, dir, root, warnings, schemaNames);
    files.push(...read.map(ofProject).filter(f => f !== spec));
    warnings.push(...validationProblems(spec, () => validatePathParameters(document)));

    const slug = slugger();
    // Routes of their own below the API's
    slug("schemas");
    slug("webhooks");
    const {paths, webhooks} = operations(document, slug);
    const declared: Spec[] = (document.tags ?? []).filter(isObject);
    const tagNames = [...new Set([...declared.map(tag => String(tag.name)), ...paths.flatMap(op => op.operation.tags?.[0] ?? [])])];
    const tags = tagNames.map(tagName => ({
        name: tagName,
        slug: slug(tagName),
        description: declared.find(tag => tag.name === tagName)?.description,
        // An operation with several tags is listed under the first
        operations: paths.filter(op => op.operation.tags?.[0] === tagName),
    })).filter(tag => tag.operations.length);
    const schemaSlug = slugger();
    const schemas = Object.entries(document.components?.schemas ?? {}).filter(([, schema]) => isObject(schema))
        .map(([schemaName, schema]) => {
            schemaNames.set(schema as object, schemaName);
            return {name: schemaName, slug: schemaSlug(schemaName), schema: schema as Spec};
        });

    return done({
        name, route, spec, files: read, document, schemaNames, tags, schemas,
        title: config.title || String(document.info?.title || name),
        icon: config.icon || "fa-solid fa-plug",
        untagged: paths.filter(op => !op.operation.tags?.length),
        webhooks,
    });
}

// A schema's type in a few words: "string (date-time)", "array of Pet",
// "Person | Shelter". link turns names of schemas into links to their pages.
export function typeLabel(schema: unknown, names: Map<object, string>, link?: (name: string) => string | undefined, depth = 0): string {
    if (!isObject(schema)) return "any";
    const name = names.get(schema);
    if (name && depth > 0) {
        const href = link?.(name);
        return href ? `[${name}](${href})` : name;
    }
    const inner = (part: unknown) => typeLabel(part, names, link, depth + 1);
    if (schema.const !== undefined) return JSON.stringify(schema.const);
    if (Array.isArray(schema.oneOf) || Array.isArray(schema.anyOf)) return (schema.oneOf ?? schema.anyOf).map(inner).join(" | ");
    if (Array.isArray(schema.allOf)) {
        const named = schema.allOf.filter((part: unknown) => isObject(part) && names.has(part));
        return named.length === schema.allOf.length ? named.map(inner).join(" & ") : "object";
    }
    const types: string[] = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
    const nullable = types.includes("null") || schema.nullable === true;
    const own = types.filter(type => type !== "null");
    const main = own.length ? own : schema.properties ? ["object"] : schema.items ? ["array"] : [];
    const label = main.map(type => {
        if (type === "array") return schema.items ? `array of ${inner(schema.items)}` : "array";
        if (type === "object" && !schema.properties && isObject(schema.additionalProperties)) return `map of ${inner(schema.additionalProperties)}`;
        return schema.format ? `${type} (${schema.format})` : type;
    }).join(" | ") || (Array.isArray(schema.enum) ? "enum" : "any");
    return nullable ? `${label} | null` : label;
}

// The value of a parameter or form field as the reader types it
const text = (value: unknown) => value === undefined || value === null ? undefined : typeof value === "object" ? JSON.stringify(value) : String(value);

// Form fields of a form or multipart body: the properties of its schema
function formFields(schema: unknown): CellField[] {
    if (!isObject(schema)) return [];
    const merged = Array.isArray(schema.allOf) ? Object.assign({}, ...schema.allOf.map((part: Spec) => part?.properties ?? {}), schema.properties ?? {}) : schema.properties ?? {};
    const required = new Set<string>([...(schema.required ?? []), ...(schema.allOf ?? []).flatMap((part: Spec) => part?.required ?? [])]);
    return Object.entries(merged as Record<string, Spec>).filter(([, property]) => isObject(property) && !property.readOnly).map(([name, property]) => ({
        name, required: required.has(name),
        file: property.format === "binary" || property.contentMediaType === "application/octet-stream" || property.items?.format === "binary",
    }));
}

const binaryBody = (type: string, schema: unknown) =>
    /^(image|audio|video|application\/(octet-stream|pdf|zip))/i.test(type) || (isObject(schema) && schema.format === "binary");

// Every security scheme of an API, as request cells and the credentials form use them
export function apiSchemes(api: Api): Record<string, CellScheme> {
    const schemes = Object.entries(api.document.components?.securitySchemes ?? {}).filter((entry): entry is [string, Spec] => isObject(entry[1]));
    return Object.fromEntries(schemes.map(([name, scheme]) => [name, {
            type: scheme.type, description: scheme.description, in: scheme.in, name: scheme.name,
            scheme: scheme.scheme, bearerFormat: scheme.bearerFormat, openIdConnectUrl: scheme.openIdConnectUrl,
            ...(isObject(scheme.flows) ? {flows: scheme.flows} : {}),
        } as CellScheme]));
}

// What a request cell of an operation needs, with starting values from the cell's text.
// It knows all schemes of the API: readers can enter all of them from any cell.
export function operationCell(api: Api, op: ApiOperation, values: Record<string, string>, link?: string): CellData {
    const schemes = apiSchemes(api);
    const parameters: CellParameter[] = op.parameters.filter(p => ["path", "query", "header", "cookie"].includes(p.in)).map(p => {
        const schema: Spec = p.schema ?? (Object.values(p.content ?? {})[0] as Spec | undefined)?.schema ?? {};
        const array = schema.type === "array" || (Array.isArray(schema.type) && schema.type.includes("array"));
        const options = (array ? schema.items?.enum : schema.enum)?.map(String);
        const example = text(p.example ?? Object.values(p.examples ?? {}).find(isObject)?.value ?? exampleOf(schema, "writing"));
        return {
            name: String(p.name), in: p.in, required: p.in === "path" || p.required === true,
            type: typeLabel(schema, api.schemaNames),
            ...(p.description ? {description: String(p.description)} : {}),
            ...(options?.length ? {options} : {}),
            ...(array ? {array} : {}),
            ...(p.explode === false ? {explode: false} : {}),
            ...(example !== undefined && example !== "" && !(array && example === "[]") ? {example: array ? (exampleOf(schema, "writing") as unknown[]).map(String).join(",") : example} : {}),
            ...(p.deprecated ? {deprecated: true} : {}),
        };
    });
    const body = isObject(op.operation.requestBody) ? op.operation.requestBody : undefined;
    const contents: CellContent[] = Object.entries(body?.content ?? {}).filter(([, media]) => isObject(media)).map(([type, media]) => {
        const m = media as Spec;
        if (/^(multipart\/form-data|application\/x-www-form-urlencoded)/i.test(type)) return {type, example: "", fields: formFields(m.schema)};
        if (binaryBody(type, m.schema)) return {type, example: "", file: true};
        const example = m.example ?? Object.values(m.examples ?? {}).find(isObject)?.value ?? exampleOf(m.schema, "writing");
        return {type, example: exampleText(example, type, m.schema, api.schemaNames.get(m.schema))};
    });
    // The first successful response with an example, shown until the cell runs
    const responses = Object.entries(op.operation.responses ?? {}).filter(([, r]) => isObject(r)) as [string, Spec][];
    const success = responses.find(([status]) => /^2/.test(status)) ?? responses[0];
    const media = success && Object.entries(success[1].content ?? {}).find(([type, m]) => isObject(m) && !binaryBody(type, (m as Spec).schema)) as [string, Spec] | undefined;
    const exampleValue = media && (media[1].example ?? Object.values(media[1].examples ?? {}).find(isObject)?.value ?? exampleOf(media[1].schema, "reading"));
    return {
        api: api.route, title: op.operation.summary || undefined, link,
        method: op.method.toUpperCase(), path: op.path,
        servers: op.servers.filter(isObject).map(server => ({
            url: String(server.url), ...(server.description ? {description: String(server.description)} : {}),
            ...(isObject(server.variables) ? {
                variables: Object.fromEntries(Object.entries(server.variables).map(([name, v]) => [name, {
                    default: String((v as Spec).default ?? ""), ...(Array.isArray((v as Spec).enum) ? {options: (v as Spec).enum.map(String)} : {}),
                }])),
            } : {}),
        })),
        parameters,
        ...(contents.length ? {body: {required: body?.required === true, contents}} : {}),
        security: op.security.filter(isObject),
        schemes, values,
        ...(success && media && exampleValue !== undefined ? {example: {status: success[0], type: media[0], body: exampleText(exampleValue, media[0], media[1].schema, api.schemaNames.get(media[1].schema))}} : {}),
    };
}

// The document as one file of OpenAPI 3.1, for readers and tools to download:
// schemas with a name are referenced by it, everything else is written out
export function bundledDocument(api: Api): Spec {
    const definitions = new Map(api.schemas.map(s => [s.schema as object, s.name]));
    const path: object[] = [];
    const write = (value: unknown, at: string): unknown => {
        if (!isObject(value)) return value;
        const name = definitions.get(value);
        if (name !== undefined && at !== `components/schemas/${name}`) return {$ref: `#/components/schemas/${name.replace(/~/g, "~0").replace(/\//g, "~1")}`};
        // A cycle through a schema without a name
        if (path.includes(value)) return {};
        path.push(value);
        const result = Array.isArray(value)
            ? value.map((item, i) => write(item, `${at}/${i}`))
            : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, write(item, at ? `${at}/${key}` : key)]));
        path.pop();
        return result;
    };
    return write(api.document, "") as Spec;
}

// The operation a request cell names: "petstore getPetById" or "petstore GET /pets/{petId}"
export function findOperation(apis: Api[], title: string): { api: Api, op: ApiOperation } | { problem: "api" | "operation", name: string, wanted: string } {
    const [name = "", ...rest] = title.trim().split(/\s+/);
    const api = apis.find(api => api.name === name);
    const wanted = rest.join(" ");
    if (!api) return {problem: "api", name, wanted};
    const [method, path] = rest.length === 2 ? [rest[0]!.toLowerCase(), rest[1]!] : [];
    const op = [...api.tags.flatMap(tag => tag.operations), ...api.untagged].find(op => op.id === wanted || (op.method === method && op.path === path));
    return op ? {api, op} : {problem: "operation", name, wanted};
}
