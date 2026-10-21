// What a request cell (::: request) knows and sends. The server describes the
// request (server/utils/request-cell.ts), the reader's browser fills it in and
// sends it (app/components/RequestCell.vue); both write the same code samples.

type Spec = Record<string, any>;
const isObject = (value: unknown): value is Spec => !!value && typeof value === "object";

export type CellParameter = {
    name: string;
    in: "path" | "query" | "header" | "cookie";
    required: boolean;
    description?: string;
    type: string; // e.g. "integer", "array of string"
    options?: string[]; // allowed values
    array?: boolean; // several values, written comma-separated
    explode?: boolean; // query arrays: "?a=1&a=2" (default) rather than "?a=1,2"
    example?: string;
    deprecated?: boolean;
};

// A form field of a form or multipart body; files are picked in the browser
export type CellField = { name: string, required: boolean, file: boolean };
export type CellContent = { type: string, example: string, fields?: CellField[], file?: boolean };

export type OAuthFlow = { authorizationUrl?: string, tokenUrl?: string, refreshUrl?: string, scopes: Record<string, string> };
export type CellScheme = {
    type: "apiKey" | "http" | "oauth2" | "openIdConnect" | "mutualTLS";
    description?: string;
    in?: "header" | "query" | "cookie"; // apiKey
    name?: string; // apiKey: the header, query parameter or cookie
    scheme?: string; // http: "basic", "bearer", ...
    bearerFormat?: string;
    flows?: Partial<Record<"authorizationCode" | "clientCredentials" | "password" | "implicit", OAuthFlow>>;
    openIdConnectUrl?: string;
};

export type CellData = {
    api?: string; // the API's route: cells of one API share their credentials
    title?: string;
    link?: string; // the operation's page
    method: string; // uppercase
    path: string; // with {parameters}; a full URL in raw cells
    servers: { url: string, description?: string, variables?: Record<string, { default: string, options?: string[] }> }[];
    parameters: CellParameter[];
    headers?: [string, string][]; // raw cells
    body?: { required: boolean, contents: CellContent[] };
    security: Record<string, string[]>[]; // alternatives: schemes needed together, with their scopes
    schemes: Record<string, CellScheme>;
    values: Record<string, string>; // what the cell starts with: parameters by name, "body", "server"
    example?: { status: string, type: string, body: string }; // shown until the cell runs
    raw?: string; // a request written out (::: request without an API), edited as text
};

// An example value of a schema: its own example, default, first allowed value,
// or one made up from its type. reading leaves out writeOnly properties (responses),
// writing readOnly ones (requests).
export function exampleOf(schema: unknown, use: "reading" | "writing" = "reading", seen = new Set<object>()): unknown {
    if (!isObject(schema) || seen.has(schema) || seen.size > 12) return undefined;
    if (schema.const !== undefined) return schema.const;
    if (Array.isArray(schema.examples) && schema.examples.length) return schema.examples[0];
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    const inner = new Set(seen).add(schema);
    if (Array.isArray(schema.allOf)) {
        const parts = schema.allOf.map((part: unknown) => exampleOf(part, use, inner));
        if (parts.every((part: unknown) => isObject(part) && !Array.isArray(part))) {
            return Object.assign({}, ...parts, exampleOf({...schema, allOf: undefined}, use, seen) ?? {});
        }
        return parts.find((part: unknown) => part !== undefined);
    }
    const variant = schema.oneOf?.[0] ?? schema.anyOf?.[0];
    if (variant) return exampleOf(variant, use, inner);

    const types: string[] = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : schema.properties ? ["object"] : [];
    const type = types.find(t => t !== "null") ?? types[0];
    switch (type) {
        case "object": {
            const result: Record<string, unknown> = {};
            for (const [name, property] of Object.entries(schema.properties ?? {})) {
                if (!isObject(property) || (use === "reading" ? property.writeOnly : property.readOnly)) continue;
                const value = exampleOf(property, use, inner);
                if (value !== undefined) result[name] = value;
            }
            if (!Object.keys(result).length && isObject(schema.additionalProperties)) {
                const value = exampleOf(schema.additionalProperties, use, inner);
                if (value !== undefined) result.key = value;
            }
            return result;
        }
        case "array": {
            const item = exampleOf(schema.items, use, inner);
            return item === undefined ? [] : [item];
        }
        case "string":
            return ({
                "date-time": "2026-01-01T12:00:00Z", date: "2026-01-01", time: "12:00:00", email: "user@example.com",
                uuid: "3fa85f64-5717-4562-b3fc-2c963f66afa6", uri: "https://example.com", url: "https://example.com",
                hostname: "example.com", ipv4: "192.0.2.1", ipv6: "2001:db8::1", binary: "", byte: "",
            } as Record<string, string>)[schema.format] ?? "string";
        case "integer":
        case "number":
            return typeof schema.minimum === "number" ? schema.minimum : 0;
        case "boolean":
            return true;
        case "null":
            return null;
    }
    return undefined;
}

// An example as text in its media type: JSON indented, XML as its schema names
// its elements (name: the schema's own name), other text as it is
export function exampleText(value: unknown, mediaType: string, schema?: unknown, name?: string): string {
    if (value === undefined) return "";
    if (/xml/i.test(mediaType) && typeof value === "object" && value !== null) return xmlText(value, schema, name);
    if (typeof value === "string" && !/json/i.test(mediaType)) return value;
    return JSON.stringify(value, null, 2);
}

const xmlEscape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// A value as XML, as OpenAPI's XML Object says: element names, attributes, wrapped lists
export function xmlText(value: unknown, schema?: unknown, name?: string, depth = 0): string {
    const spec: Spec = isObject(schema) ? schema : {};
    const merged: Spec = Array.isArray(spec.allOf)
        ? {...spec, properties: Object.assign({}, ...spec.allOf.map((part: Spec) => part?.properties ?? {}), spec.properties ?? {})}
        : spec;
    const tag = String(merged.xml?.name ?? name ?? "root");
    const pad = "  ".repeat(depth);
    if (Array.isArray(value)) {
        const itemName = merged.items?.xml?.name ?? (merged.xml?.wrapped ? tag : tag);
        const items = value.map(item => xmlText(item, merged.items, itemName, depth + (merged.xml?.wrapped ? 1 : 0)));
        return merged.xml?.wrapped ? `${pad}<${tag}>\n${items.join("\n")}\n${pad}</${tag}>` : items.join("\n");
    }
    if (isObject(value)) {
        const attributes: string[] = [];
        const children: string[] = [];
        for (const [key, item] of Object.entries(value)) {
            const property: Spec = isObject(merged.properties?.[key]) ? merged.properties[key] : {};
            if (property.xml?.attribute) attributes.push(` ${property.xml?.name ?? key}="${xmlEscape(String(item))}"`);
            else children.push(xmlText(item, property, key, depth + 1));
        }
        return children.length ? `${pad}<${tag}${attributes.join("")}>\n${children.join("\n")}\n${pad}</${tag}>` : `${pad}<${tag}${attributes.join("")}/>`;
    }
    return `${pad}<${tag}>${xmlEscape(String(value ?? ""))}</${tag}>`;
}

// "Basic dXNlcjpwYXNz" without Buffer, in the browser and on the server
const base64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

// What the reader entered for a scheme: an API key, user and password, or a token
export type Credential = { value?: string, user?: string, password?: string, token?: string };

// The alternative of security requirements that the entered credentials meet,
// else the first: the one the cell asks for. Cells without security need none.
export function chosenSecurity(cell: CellData, credentials: Record<string, Credential>): Record<string, string[]> | undefined {
    const usable = (requirement: Record<string, string[]>) => Object.keys(requirement).every(name => {
        const scheme = cell.schemes[name];
        const entered = credentials[name];
        if (!scheme) return false;
        if (scheme.type === "mutualTLS") return true; // the browser presents the certificate
        if (scheme.type === "apiKey") return !!entered?.value;
        if (scheme.type === "http" && scheme.scheme?.toLowerCase() === "basic") return !!entered?.user;
        return !!entered?.token;
    });
    return cell.security.find(usable) ?? cell.security[0];
}

export type HttpRequest = {
    method: string;
    url: string;
    headers: [string, string][];
    body?: { type: string, text?: string, fields?: { name: string, value: string, file?: boolean }[], file?: boolean };
    missing: string[]; // required values that are empty
};

// Whatever the reader filled in, or the cell's starting values
export type CellInputs = {
    server: string;
    serverValues: Record<string, string>;
    values: Record<string, string>; // parameters by name
    contentType?: string;
    body?: string;
    fields?: Record<string, string>; // form fields; files by their name
};

// What a cell starts with: its own values, and examples for what is required
export function startingInputs(cell: CellData): CellInputs {
    const values: Record<string, string> = {};
    for (const parameter of cell.parameters) {
        const value = cell.values[parameter.name] ?? (parameter.required ? parameter.example : undefined);
        if (value !== undefined) values[parameter.name] = value;
    }
    const content = cell.body?.contents.find(c => c.type === cell.values.contentType) ?? cell.body?.contents[0];
    const server = cell.servers.find(s => s.url === cell.values.server)?.url ?? cell.servers[0]?.url ?? "";
    return {
        server, serverValues: {}, values, contentType: content?.type,
        body: cell.values.body ?? content?.example,
        fields: Object.fromEntries((content?.fields ?? []).filter(f => !f.file && cell.values[f.name] !== undefined).map(f => [f.name, cell.values[f.name]!])),
    };
}

// The cell of a request written out, e.g. "POST https://api.example.com/pets",
// headers, an empty line and the body
export function rawCell(text: string): CellData | undefined {
    const request = parseRawRequest(text);
    if (!request) return undefined;
    const type = request.headers.find(([name]) => name.toLowerCase() === "content-type")?.[1] ?? "text/plain";
    return {
        method: request.method, path: request.url, servers: [], parameters: [], headers: request.headers,
        ...(request.body ? {body: {required: true, contents: [{type, example: request.body}]}} : {}),
        security: [], schemes: {}, values: {}, raw: text.trim(),
    };
}

function serverUrl(cell: CellData, inputs: CellInputs): string {
    const server = cell.servers.find(s => s.url === inputs.server) ?? cell.servers[0];
    if (!server) return "";
    return server.url.replace(/\{([^}]+)\}/g, (match, name: string) =>
        inputs.serverValues[name] ?? server.variables?.[name]?.default ?? match).replace(/\/$/, "");
}

const encode = (value: string) => encodeURIComponent(value);

// The request a cell sends, with placeholders where secrets go: placeholders
// for code samples (secret undefined), the entered values for sending
export function buildRequest(cell: CellData, inputs: CellInputs, credentials: Record<string, Credential> = {},
                             secret?: (scheme: string, part: keyof Credential) => string | undefined): HttpRequest {
    const missing: string[] = [];
    const query: [string, string][] = [];
    const headers: [string, string][] = [...(cell.headers ?? [])];
    const cookies: string[] = [];
    let path = cell.path;
    for (const parameter of cell.parameters) {
        const value = inputs.values[parameter.name] ?? "";
        if (!value) {
            if (parameter.required) missing.push(parameter.name);
            continue;
        }
        const values = parameter.array ? value.split(",").map(v => v.trim()).filter(Boolean) : [value];
        if (parameter.in === "path") path = path.split(`{${parameter.name}}`).join(values.map(encode).join(","));
        else if (parameter.in === "query") {
            if (parameter.array && parameter.explode !== false) values.forEach(v => query.push([parameter.name, v]));
            else query.push([parameter.name, values.join(",")]);
        } else if (parameter.in === "header") headers.push([parameter.name, values.join(",")]);
        else cookies.push(`${parameter.name}=${encode(values.join(","))}`);
    }

    // Credentials, as the chosen security requirement asks for them
    const requirement = chosenSecurity(cell, credentials) ?? {};
    const show = (name: string, part: keyof Credential, placeholder: string) => secret ? secret(name, part) ?? "" : placeholder;
    // Sent without what was not entered: some APIs answer without credentials
    const entered = (name: string, scheme: CellScheme) => !secret || (scheme.type === "apiKey" ? !!secret(name, "value")
        : scheme.type === "http" && scheme.scheme?.toLowerCase() === "basic" ? !!secret(name, "user") : !!secret(name, "token"));
    for (const name of Object.keys(requirement)) {
        const scheme = cell.schemes[name];
        if (!scheme || !entered(name, scheme)) continue;
        if (scheme.type === "apiKey" && scheme.name) {
            const value = show(name, "value", `<${scheme.name}>`);
            if (scheme.in === "query") query.push([scheme.name, value]);
            else if (scheme.in === "cookie") cookies.push(`${scheme.name}=${value}`);
            else headers.push([scheme.name, value]);
        } else if (scheme.type === "http" && scheme.scheme?.toLowerCase() === "basic") {
            headers.push(["Authorization", secret ? `Basic ${base64(`${secret(name, "user") ?? ""}:${secret(name, "password") ?? ""}`)}` : "Basic <user:password in base64>"]);
        } else if (scheme.type === "http" || scheme.type === "oauth2" || scheme.type === "openIdConnect") {
            const type = scheme.type === "http" && scheme.scheme ? scheme.scheme : "bearer";
            const prefix = type[0]!.toUpperCase() + type.slice(1);
            headers.push(["Authorization", `${prefix} ${show(name, "token", "<token>")}`]);
        }
    }
    if (cookies.length) headers.push(["Cookie", cookies.join("; ")]);

    let body: HttpRequest["body"];
    const content = cell.body?.contents.find(c => c.type === inputs.contentType) ?? cell.body?.contents[0];
    if (content) {
        if (content.fields) {
            const fields = content.fields.map(field => ({name: field.name, value: inputs.fields?.[field.name] ?? "", file: field.file}))
                .filter(field => field.value || field.file);
            for (const field of content.fields) if (field.required && !inputs.fields?.[field.name]) missing.push(field.name);
            body = {type: content.type, fields};
        } else if (content.file) {
            body = {type: content.type, file: true};
        } else {
            const text = inputs.body ?? content.example;
            if (text || cell.body?.required) body = {type: content.type, text};
        }
        // Multipart bodies get their boundary from the browser
        if (body && !/^multipart\//i.test(content.type) && !headers.some(([name]) => name.toLowerCase() === "content-type")) {
            headers.push(["Content-Type", content.type]);
        }
    }

    const base = /^[a-z][a-z\d+.-]*:/i.test(path) ? "" : serverUrl(cell, inputs);
    const search = query.map(([name, value]) => `${encode(name)}=${encode(value)}`).join("&");
    return {method: cell.method, url: base + path + (search ? (path.includes("?") ? "&" : "?") + search : ""), headers, body, missing};
}

const shellQuote = (text: string) => `'${text.replace(/'/g, `'\\''`)}'`;

export function curlCommand(request: HttpRequest): string {
    const lines = [`curl${request.method === "GET" ? "" : ` -X ${request.method}`} ${shellQuote(request.url)}`];
    for (const [name, value] of request.headers) lines.push(`-H ${shellQuote(`${name}: ${value}`)}`);
    const body = request.body;
    if (body?.fields) {
        const flag = /^multipart\//i.test(body.type) ? "-F" : "--data-urlencode";
        for (const field of body.fields) lines.push(`${flag} ${shellQuote(`${field.name}=${field.file ? "@file" : field.value}`)}`);
    } else if (body?.file) lines.push("--data-binary @file");
    else if (body?.text !== undefined) lines.push(`--data-raw ${shellQuote(body.text)}`);
    return lines.join(" \\\n  ");
}

export function fetchCode(request: HttpRequest): string {
    const options: string[] = [];
    if (request.method !== "GET") options.push(`  method: ${JSON.stringify(request.method)},`);
    if (request.headers.length) {
        options.push(`  headers: {\n${request.headers.map(([name, value]) => `    ${JSON.stringify(name)}: ${JSON.stringify(value)},`).join("\n")}\n  },`);
    }
    let setup = "";
    const body = request.body;
    if (body?.fields) {
        const multipart = /^multipart\//i.test(body.type);
        setup = `const body = new ${multipart ? "FormData" : "URLSearchParams"}();\n`
            + body.fields.map(field => `body.append(${JSON.stringify(field.name)}, ${field.file ? "file" : JSON.stringify(field.value)});`).join("\n") + "\n\n";
        options.push("  body,");
    } else if (body?.file) options.push("  body: file,");
    else if (body?.text !== undefined) {
        const json = /json/i.test(body.type) && (() => {
            try {
                return JSON.stringify(JSON.parse(body.text), null, 2).replace(/\n/g, "\n  ");
            } catch {
                return undefined;
            }
        })();
        options.push(json ? `  body: JSON.stringify(${json}),` : `  body: ${JSON.stringify(body.text)},`);
    }
    const call = options.length ? `fetch(${JSON.stringify(request.url)}, {\n${options.join("\n")}\n})` : `fetch(${JSON.stringify(request.url)})`;
    return `${setup}const response = await ${call};\nconsole.log(response.status, await response.text());`;
}

export function pythonCode(request: HttpRequest): string {
    const args = [JSON.stringify(request.url)];
    if (request.headers.length) {
        args.push(`headers={\n${request.headers.map(([name, value]) => `        ${JSON.stringify(name)}: ${JSON.stringify(value)},`).join("\n")}\n    }`);
    }
    const body = request.body;
    if (body?.fields) {
        const files = body.fields.filter(field => field.file);
        const data = body.fields.filter(field => !field.file);
        if (data.length) args.push(`data={${data.map(field => `${JSON.stringify(field.name)}: ${JSON.stringify(field.value)}`).join(", ")}}`);
        if (files.length) args.push(`files={${files.map(field => `${JSON.stringify(field.name)}: open("file", "rb")`).join(", ")}}`);
    } else if (body?.file) args.push(`data=open("file", "rb")`);
    else if (body?.text !== undefined) {
        let json: unknown;
        try {
            json = /json/i.test(body.type) ? JSON.parse(body.text) : undefined;
        } catch {
            json = undefined;
        }
        args.push(json !== undefined ? `json=${pythonValue(json, 1)}` : `data=${JSON.stringify(body.text)}`);
    }
    return `import requests\n\nresponse = requests.${request.method.toLowerCase()}(\n    ${args.join(",\n    ")},\n)\nprint(response.status_code, response.text)`;
}

// JSON as a Python literal: True, False and None
function pythonValue(value: unknown, depth: number): string {
    const indent = "    ".repeat(depth);
    if (value === null) return "None";
    if (value === true) return "True";
    if (value === false) return "False";
    if (Array.isArray(value)) return value.length ? `[\n${value.map(v => `${indent}    ${pythonValue(v, depth + 1)}`).join(",\n")},\n${indent}]` : "[]";
    if (isObject(value)) {
        const entries = Object.entries(value);
        return entries.length ? `{\n${entries.map(([k, v]) => `${indent}    ${JSON.stringify(k)}: ${pythonValue(v, depth + 1)}`).join(",\n")},\n${indent}}` : "{}";
    }
    return JSON.stringify(value);
}

// A raw cell, written like an HTTP request: "POST https://...", headers, an
// empty line and the body. It runs in the browser, so its address is a full one.
export function parseRawRequest(text: string): { method: string, url: string, headers: [string, string][], body: string } | undefined {
    const lines = text.replace(/\r\n/g, "\n").replace(/^\s*\n/, "").split("\n");
    const first = /^(get|post|put|patch|delete|head|options|trace|query)\s+(https?:\/\/\S+)(?:\s+HTTP\/[\d.]+)?\s*$/i.exec(lines[0]?.trim() ?? "");
    if (!first) return undefined;
    const headers: [string, string][] = [];
    let i = 1;
    for (; i < lines.length && lines[i]!.trim(); i++) {
        const colon = lines[i]!.indexOf(":");
        if (colon > 0) headers.push([lines[i]!.slice(0, colon).trim(), lines[i]!.slice(colon + 1).trim()]);
    }
    return {method: first[1]!.toUpperCase(), url: first[2]!, headers, body: lines.slice(i + 1).join("\n").trim()};
}
