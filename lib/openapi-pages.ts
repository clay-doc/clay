import type {DocItem} from "../common/nav";
import {format, type Messages} from "../common/i18n";
import {exampleOf, exampleText} from "../common/openapi";
import GithubSlugger from "github-slugger";
import {typeLabel, type Api, type ApiOperation} from "./openapi";
import type {Crumb, Page} from "./site";

// The pages of an API, written as Markdown, so they are rendered, searched,
// checked and read by agents like the docs: an overview, a page per tag, per
// operation, per webhook and per schema. Operations show a request cell
// (::: request) to try them.

type Spec = Record<string, any>;
const isObject = (value: unknown): value is Spec => !!value && typeof value === "object";

// Text from the document in Markdown that Clay writes: in a line, in a table cell, as code
const line = (text: unknown) => String(text ?? "").replace(/\s*\n\s*/g, " ").trim();
const plain = (text: unknown) => line(text).replace(/([\\[\]<>*_`])/g, "\\$1");
const code = (text: unknown) => {
    const value = String(text);
    const ticks = "`".repeat(Math.max(0, ...[...value.matchAll(/`+/g)].map(m => m[0].length)) + 1);
    return ticks.length > 1 || value.startsWith("`") || value.endsWith("`") ? `${ticks} ${value} ${ticks}` : `${ticks}${value}${ticks}`;
};
const indent = (text: string, spaces: number) => text.split("\n").map(l => l ? " ".repeat(spaces) + l : l).join("\n");
const fence = (text: string, lang: string) => {
    const ticks = "`".repeat(Math.max(3, ...[...text.matchAll(/^`{3,}/gm)].map(m => m[0].length + 1)));
    return `${ticks}${lang}\n${text}\n${ticks}`;
};
const languageOf = (mediaType: string) => /json/i.test(mediaType) ? "json" : /xml/i.test(mediaType) ? "xml" : /yaml/i.test(mediaType) ? "yaml" : "text";

type Context = {
    api: Api;
    base: string; // the API's route in this edition, e.g. "/de/api/petstore"
    document: string; // where the document is published, e.g. "/_clay/1.x/openapi/petstore.json"
    t: Messages;
};

// An operation's page, below the API's route in an edition (base)
export function apiOperationRoute(api: Api, op: ApiOperation, base = api.route): string {
    if (op.webhook) return `${base}/webhooks/${op.slug}`;
    const tag = api.tags.find(tag => tag.operations.includes(op));
    return tag ? `${base}/${tag.slug}/${op.slug}` : `${base}/${op.slug}`;
}
const operationRoute = (ctx: Context, op: ApiOperation) => apiOperationRoute(ctx.api, op, ctx.base);
const operationTitle = (op: ApiOperation) => line(op.operation.summary) || (op.webhook ? op.path : `${op.method.toUpperCase()} ${op.path}`);

function schemaLink(ctx: Context) {
    return (name: string) => {
        const schema = ctx.api.schemas.find(s => s.name === name);
        return schema ? `${ctx.base}/schemas/${schema.slug}` : undefined;
    };
}

const typeOf = (ctx: Context, schema: unknown) => typeLabel(schema, ctx.api.schemaNames, schemaLink(ctx), 1);

// The properties of an object schema, those of allOf included
function propertiesOf(schema: Spec): { properties: Record<string, Spec>, required: Set<string> } {
    const parts = [schema, ...(Array.isArray(schema.allOf) ? schema.allOf.filter(isObject) : [])];
    const nested = parts.slice(1).flatMap(part => Array.isArray(part.allOf) ? part.allOf.filter(isObject) : []);
    const all = [...parts, ...nested];
    return {
        properties: Object.assign({}, ...all.map(part => isObject(part.properties) ? part.properties : {})),
        required: new Set(all.flatMap(part => Array.isArray(part.required) ? part.required.map(String) : [])),
    };
}

// What is said of a schema besides its type: its allowed values, default, and so on
function facts(ctx: Context, schema: Spec): string[] {
    const t = ctx.t;
    const facts: string[] = [];
    const values = schema.enum ?? schema.items?.enum;
    if (Array.isArray(values) && values.length) facts.push(`${t.apiAllowed} ${values.map(v => code(JSON.stringify(v))).join(", ")}`);
    if (schema.default !== undefined) facts.push(`${t.apiDefault} ${code(JSON.stringify(schema.default))}`);
    return facts;
}

// A field of a ::: fields list (server/utils/components.ts): "- `name` type **required** *read-only*";
// flags written as they are stay bold or struck through, others are set in italics
const fieldLine = (pad: string, name: string, type: string, flags: string[]) =>
    `${pad}- ${code(name)}${[type, ...flags.filter(Boolean).map(flag => /^(\*\*|~~).*\1$/.test(flag) ? flag : `*${flag}*`)].filter(Boolean).map(part => ` ${part}`).join("")}`;

// A schema as a nested list of its properties, for a ::: fields list. Schemas
// with a name of their own are linked to their page instead of listed again,
// which also ends recursion.
// Schemas without a name are listed this deep; deeper ones only show their type
const SCHEMA_DEPTH = 4;

function schemaLines(ctx: Context, schema: unknown, depth = 0, seen = new Set<object>()): string[] {
    if (!isObject(schema) || seen.has(schema) || depth >= SCHEMA_DEPTH) return [];
    const inner = new Set(seen).add(schema);
    const pad = "  ".repeat(depth);
    const expandable = (s: unknown): s is Spec => isObject(s) && !ctx.api.schemaNames.has(s) && !inner.has(s);
    const lines: string[] = [];

    const variants = schema.oneOf ?? schema.anyOf;
    if (Array.isArray(variants)) {
        for (const variant of variants) {
            lines.push(`${pad}- ${typeOf(ctx, variant)} *${(schema.oneOf ? ctx.t.apiOneOf : ctx.t.apiAnyOf).replace(/[:：]$/, "")}*`);
            if (expandable(variant)) {
                const sub = schemaLines(ctx, variant, depth + 1, inner);
                if (sub.length) lines.push("", ...sub);
            }
        }
        if (schema.discriminator?.propertyName) lines.push("", `${pad}${format(ctx.t.apiChosenBy, {property: code(schema.discriminator.propertyName)})}`);
        return lines;
    }
    const items = schema.type === "array" || schema.items ? schema.items : undefined;
    if (items) {
        // A list of named schemas shows their properties too, at the top
        return depth === 0 && isObject(items) && !inner.has(items) ? schemaLines(ctx, items, depth, inner) : expandable(items) ? schemaLines(ctx, items, depth, inner) : [];
    }
    const {properties, required} = propertiesOf(schema);
    for (const [name, property] of Object.entries(properties)) {
        if (!isObject(property)) continue;
        lines.push(fieldLine(pad, name, typeOf(ctx, property), [
            required.has(name) ? `**${ctx.t.apiRequired}**` : "",
            property.readOnly ? ctx.t.apiReadOnly : "",
            property.writeOnly ? ctx.t.apiWriteOnly : "",
            property.deprecated ? "~~deprecated~~" : "",
        ]));
        // A schema with a name of its own is described on its page
        const named = ctx.api.schemaNames.has(property);
        const variants = property.oneOf ?? property.anyOf;
        const nested = property.items ?? property.additionalProperties;
        const child = isObject(property.properties) || Array.isArray(property.allOf) ? property : nested;
        // Variants are listed when some of them have no page to link to
        const listVariants = Array.isArray(variants) && !named && variants.some(variant => expandable(variant));
        const about = [
            property.description && !named ? String(property.description).trim() : "",
            ...facts(ctx, property),
            property.discriminator?.propertyName && !listVariants ? format(ctx.t.apiChosenBy, {property: code(property.discriminator.propertyName)}) : "",
        ].filter(Boolean);
        for (const text of about) lines.push("", indent(text, pad.length + 2));
        if (listVariants || (!Array.isArray(variants) && expandable(child))) {
            const sub = schemaLines(ctx, listVariants ? property : child, depth + 1, inner);
            if (sub.length) lines.push("", ...sub);
        }
    }
    if (!lines.length && isObject(schema.additionalProperties) && expandable(schema.additionalProperties)) return schemaLines(ctx, schema.additionalProperties, depth, inner);
    return lines;
}

const fieldsBlock = (lines: string[]) => lines.length ? `::: fields\n${lines.join("\n")}\n:::` : "";

// A schema: its type when it says more than its properties, its description and
// properties; before the type, what it is for, e.g. media types
function schemaSection(ctx: Context, schema: unknown, before = ""): string {
    if (!isObject(schema)) return before;
    const named = ctx.api.schemaNames.has(schema);
    const label = named ? typeOf(ctx, schema) : typeLabel(schema, ctx.api.schemaNames, schemaLink(ctx), 0);
    const properties = schemaLines(ctx, schema);
    const type = named || !properties.length || label !== "object" ? `${ctx.t.apiType}: ${label}` : "";
    const parts = [
        [before, type].filter(Boolean).join(" · "),
        schema.description && !named ? String(schema.description).trim() : "",
        facts(ctx, schema).join(" · "),
        fieldsBlock(properties),
    ];
    return parts.filter(Boolean).join("\n\n");
}

function examplesOf(media: Spec, use: "reading" | "writing"): unknown {
    if (media.example !== undefined) return media.example;
    const first = Object.values(media.examples ?? {}).find(isObject) as Spec | undefined;
    if (first?.value !== undefined) return first.value;
    return exampleOf(media.schema, use);
}

// The media types of a body or response: those with the same schema are shown
// once, their examples next to each other
function contentSection(ctx: Context, content: unknown, use: "reading" | "writing"): string {
    if (!isObject(content)) return "";
    const media = Object.entries(content).filter((entry): entry is [string, Spec] => isObject(entry[1]));
    const groups: { types: string[], schema: unknown }[] = [];
    for (const [type, m] of media) {
        const group = groups.find(g => g.schema === m.schema);
        if (group) group.types.push(type);
        else groups.push({types: [type], schema: m.schema});
    }
    // The media types as badges, in the line that tells the schema's type
    const parts = groups.map(group => schemaSection(ctx, group.schema, group.types.map(type => `:badge[${type.replace(/[\]]/g, "")}]{note}`).join(" ")));
    // Forms and files have no example to show as text
    const examples = media.filter(([type, m]) => m.schema?.format !== "binary" && !/^(multipart\/|application\/x-www-form-urlencoded)/i.test(type))
        .map(([type, m]) => ({type, text: exampleText(examplesOf(m, use), type, m.schema, ctx.api.schemaNames.get(m.schema))}))
        .filter(example => example.text);
    if (examples.length === 1) parts.push(fence(examples[0]!.text, `${languageOf(examples[0]!.type)} [${ctx.t.apiExample}]`));
    else if (examples.length > 1) parts.push(`::: code-group\n${examples.map(e => fence(e.text, `${languageOf(e.type)} [${e.type}]`)).join("\n")}\n:::`);
    return parts.join("\n\n");
}

// Parameters and headers as fields: name, type, where they go
function parameterFields(ctx: Context, parameters: Spec[], showPlace = true): string {
    return fieldsBlock(parameters.flatMap(p => {
        const schema = p.schema ?? (Object.values(p.content ?? {})[0] as Spec | undefined)?.schema;
        const about = [p.description ? String(p.description).trim() : "", ...(isObject(schema) ? facts(ctx, schema) : [])].filter(Boolean);
        return [
            fieldLine("", String(p.name), typeOf(ctx, schema), [
                p.required || p.in === "path" ? `**${ctx.t.apiRequired}**` : "",
                showPlace ? String(p.in) : "",
                p.deprecated ? "~~deprecated~~" : "",
            ]),
            ...about.flatMap(text => ["", indent(text, 2)]),
        ];
    }));
}

// The "Authentication" heading of an API's overview, in the language of the edition
const authenticationAnchor = (ctx: Context) => new GithubSlugger().slug(ctx.t.apiAuthentication);

// Which credentials requests need: each alternative a field, with what it asks for,
// linked to the API's overview, where they are described and entered
function securityText(ctx: Context, security: Spec[]): string {
    if (!security.length || security.some(requirement => isObject(requirement) && !Object.keys(requirement).length)) return ctx.t.apiNoAuth;
    const schemes: Spec = ctx.api.document.components?.securitySchemes ?? {};
    const alternatives = security.filter(isObject).map(requirement => {
        const names = Object.keys(requirement);
        const scopes = Object.values(requirement).flatMap(s => Array.isArray(s) ? s : []);
        const kinds = names.map(name => isObject(schemes[name]) ? schemeKind(ctx, schemes[name]) : "").filter(Boolean);
        return [fieldLine("", names.join(" + "), "", scopes), ...(kinds.length ? ["", `  [${kinds.join(" + ").replace(/[[\]]/g, "")}](${ctx.base}#${authenticationAnchor(ctx)})`] : [])];
    });
    return [alternatives.length > 1 ? ctx.t.apiAuthNeeds : "", fieldsBlock(alternatives.flat())].filter(Boolean).join("\n\n");
}

// The same on the overview, in a line: the schemes are described below it
function securityLine(ctx: Context, security: Spec[]): string {
    if (!security.length || security.some(requirement => isObject(requirement) && !Object.keys(requirement).length)) return ctx.t.apiNoAuth;
    const alternatives = security.filter(isObject).map(requirement => Object.keys(requirement).map(code).join(" + "));
    return alternatives.length > 1 ? `${ctx.t.apiAuthNeeds} ${alternatives.join(" · ")}` : alternatives[0]!;
}

// Responses as tabs, one per status, colored by it
function responsesSection(ctx: Context, responses: unknown): string {
    if (!isObject(responses)) return "";
    const tabs = Object.entries(responses).filter((entry): entry is [string, Spec] => isObject(entry[1])).map(([status, r]) => {
        const parts = [`== ${status}`, r.description ? String(r.description).trim() : ""];
        if (isObject(r.headers) && Object.keys(r.headers).length) {
            parts.push(`**${ctx.t.apiHeaders}**`, parameterFields(ctx, Object.entries(r.headers).filter(([, h]) => isObject(h))
                .map(([name, header]) => ({...header as Spec, name, in: "header"})), false));
        }
        parts.push(contentSection(ctx, r.content, "reading"));
        if (isObject(r.links) && Object.keys(r.links).length) {
            parts.push(`**${ctx.t.apiLinks}**`, Object.entries(r.links).filter(([, link]) => isObject(link)).map(([name, link]) => {
                const target = ctx.api.tags.flatMap(tag => tag.operations).concat(ctx.api.untagged).find(op => op.id === (link as Spec).operationId);
                const to = target ? `[${plain(operationTitle(target))}](${operationRoute(ctx, target)})` : (link as Spec).operationId ? code((link as Spec).operationId) : "";
                const values = isObject((link as Spec).parameters) ? Object.entries((link as Spec).parameters).map(([k, v]) => `${code(k)} = ${code(String(v))}`).join(", ") : "";
                return `- ${code(name)}${to ? `: ${to}` : ""}${values ? ` (${values})` : ""}${(link as Spec).description ? ` — ${line((link as Spec).description)}` : ""}`;
            }).join("\n"));
        }
        return parts.filter(Boolean).join("\n\n");
    });
    return tabs.length ? `::: tabs status\n${tabs.join("\n\n")}\n:::` : "";
}

// An operation's page: a cell to try it, what to send, what comes back
function operationMarkdown(ctx: Context, op: ApiOperation): string {
    const t = ctx.t;
    const o = op.operation;
    const parts = [`# ${plain(operationTitle(op))}`];
    if (o.deprecated) parts.push(`> [!WARNING]\n> ${t.apiDeprecated}`);
    // Operations show their method and path in their request cell
    if (op.webhook) parts.push(`::: endpoints\n- ${code(`${op.method.toUpperCase()} ${op.path}`)} ${t.apiWebhookNote}\n:::`);
    if (o.description) parts.push(String(o.description).trim());
    if (o.externalDocs?.url) parts.push(`[${plain(o.externalDocs.description || o.externalDocs.url)}](${o.externalDocs.url})`);
    // Webhooks are sent by the API, not to it
    if (!op.webhook) parts.push(`::: request ${ctx.api.name} ${op.id}\n:::`);
    if (!op.webhook) parts.push(`## ${t.apiAuthentication}`, securityText(ctx, op.security));
    if (op.parameters.length) parts.push(`## ${t.apiParameters}`, parameterFields(ctx, op.parameters));
    if (isObject(o.requestBody)) {
        parts.push(`## ${t.apiRequestBody}${o.requestBody.required ? ` :badge[${t.apiRequired}]{caution}` : ""}`);
        if (o.requestBody.description) parts.push(String(o.requestBody.description).trim());
        parts.push(contentSection(ctx, o.requestBody.content, "writing"));
    }
    parts.push(`## ${t.apiResponses}`, responsesSection(ctx, o.responses));
    if (isObject(o.callbacks) && Object.keys(o.callbacks).length) {
        parts.push(`## ${t.apiCallbacks}`);
        for (const [name, callback] of Object.entries(o.callbacks)) {
            if (!isObject(callback)) continue;
            for (const [expression, item] of Object.entries(callback)) {
                if (!isObject(item)) continue;
                for (const [method, operation] of Object.entries(item)) {
                    if (!isObject(operation) || !/^(get|put|post|delete|options|head|patch|trace)$/.test(method)) continue;
                    parts.push(`### ${plain(name)}`, `::: endpoints\n- ${code(`${method.toUpperCase()} ${expression}`)} ${plain(operation.summary ?? "")}\n:::`);
                    if (operation.description) parts.push(String(operation.description).trim());
                    if (isObject(operation.requestBody)) parts.push(contentSection(ctx, operation.requestBody.content, "reading"));
                }
            }
        }
    }
    return parts.filter(Boolean).join("\n\n") + "\n";
}

// What a security scheme asks for, in a few words
function schemeKind(ctx: Context, scheme: Spec): string {
    const t = ctx.t;
    if (scheme.type === "apiKey") return format(scheme.in === "query" ? t.apiKeyQuery : scheme.in === "cookie" ? t.apiKeyCookie : t.apiKeyHeader, {name: code(scheme.name ?? "")});
    if (scheme.type === "http") return format(t.apiHttpAuth, {scheme: code(scheme.scheme ?? "")}) + (scheme.bearerFormat ? ` (${plain(scheme.bearerFormat)})` : "");
    if (scheme.type === "oauth2") return t.apiOAuth;
    if (scheme.type === "openIdConnect") return `${t.apiOpenId}: <${scheme.openIdConnectUrl}>`;
    if (scheme.type === "mutualTLS") return t.apiMutualTls;
    return "";
}

// How a security scheme is used, as a field of the overview
function schemeField(ctx: Context, name: string, scheme: Spec): string[] {
    const t = ctx.t;
    const lines = [fieldLine("", name, "", []), "", indent(schemeKind(ctx, scheme), 2)];
    if (scheme.description) lines.push("", indent(String(scheme.description).trim(), 2));
    if (scheme.type === "oauth2" && isObject(scheme.flows)) {
        lines.push("");
        for (const [flowName, flow] of Object.entries(scheme.flows)) {
            if (!isObject(flow)) continue;
            const where = [flow.authorizationUrl ? format(t.apiAuthorizeAt, {url: `<${flow.authorizationUrl}>`}) : "", flow.tokenUrl ? format(t.apiTokenAt, {url: `<${flow.tokenUrl}>`}) : ""].filter(Boolean).join(", ");
            lines.push(fieldLine("  ", flowName, "", []), ...(where ? ["", `    ${where}`] : []));
            const scopes = Object.entries(flow.scopes ?? {});
            if (scopes.length) lines.push("", ...scopes.flatMap(([scope, about]) => [fieldLine("    ", scope, "", []), ...(about ? ["", `      ${line(about)}`] : [])]));
        }
    }
    return lines;
}

const operationEntry = (op: ApiOperation, ctx: Context) =>
    `- ${code(op.webhook ? op.method.toUpperCase() : `${op.method.toUpperCase()} ${op.path}`)} [${plain(operationTitle(op))}](${operationRoute(ctx, op)})${op.operation.deprecated ? " ~~deprecated~~" : ""}`;
const endpointsBlock = (ctx: Context, ops: ApiOperation[]) => ops.length ? `::: endpoints\n${ops.map(op => operationEntry(op, ctx)).join("\n")}\n:::` : "";

// From this many operations or schemas, the overview only links to them
const LARGE_API = 100;

function overviewMarkdown(ctx: Context, title: string): string {
    const t = ctx.t;
    const {document: doc, api} = {document: ctx.api.document, api: ctx.api};
    const info: Spec = isObject(doc.info) ? doc.info : {};
    const parts = [`# ${plain(title)}`];
    if (info.version) parts.push(`:badge[${format(t.apiVersion, {version: line(info.version).replace(/[\]]/g, "")})}]`);
    if (info.summary) parts.push(plain(info.summary));
    if (info.description) parts.push(String(info.description).trim());

    const servers: Spec[] = (doc.servers ?? []).filter(isObject);
    if (servers.length) {
        parts.push(`## ${t.apiServers}`, fieldsBlock(servers.flatMap(server => {
            const variables = Object.entries(server.variables ?? {}).filter((entry): entry is [string, Spec] => isObject(entry[1])).flatMap(([name, v]) => {
                const values = Array.isArray(v.enum) ? v.enum : [v.default];
                return [fieldLine("  ", name, values.map((value: unknown) => code(String(value))).join(", "), []), ...(v.description ? ["", indent(line(v.description), 4)] : [])];
            });
            return [fieldLine("", String(server.url), "", []), ...(server.description ? ["", `  ${plain(server.description)}`] : []), ...(variables.length ? ["", ...variables] : [])];
        })));
    }

    const schemes = Object.entries(doc.components?.securitySchemes ?? {}).filter((entry): entry is [string, Spec] => isObject(entry[1]));
    if (schemes.length || doc.security) {
        // The schemes, in a form where readers enter them for every request cell of the API
        const described = fieldsBlock(schemes.flatMap(([name, scheme]) => schemeField(ctx, name, scheme)));
        parts.push(`## ${t.apiAuthentication}`, securityLine(ctx, (doc.security ?? []).filter(isObject)),
            schemes.length ? `::: credentials ${api.name}\n${described}\n:::` : "");
    }

    // Large APIs list their tags, and leave operations and schemas to the pages of these
    const large = api.tags.flatMap(tag => tag.operations).length + api.untagged.length + api.webhooks.length > LARGE_API;
    if (api.tags.length || api.untagged.length) {
        parts.push(`## ${t.apiOperations}`);
        if (large && api.tags.length) {
            parts.push(`::: cards\n${api.tags.map(tag => `- [${plain(tag.name)}](${ctx.base}/${tag.slug}){fa-solid fa-tag}\n  ${tag.description ? `${line(firstLine(tag.description))} ` : ""}(${tag.operations.length})`).join("\n")}\n:::`);
        } else {
            for (const tag of api.tags) {
                parts.push(`### [${plain(tag.name)}](${ctx.base}/${tag.slug})`, tag.description ? String(tag.description).trim() : "", endpointsBlock(ctx, tag.operations));
            }
        }
        if (api.untagged.length) parts.push(`### ${api.tags.length ? t.apiOther : plain(title)}`, endpointsBlock(ctx, api.untagged));
    }
    if (api.webhooks.length) parts.push(`## [${t.apiWebhooks}](${ctx.base}/webhooks)`, large ? "" : endpointsBlock(ctx, api.webhooks));
    if (api.schemas.length) parts.push(`## [${t.apiSchemas}](${ctx.base}/schemas)`, api.schemas.length > LARGE_API ? "" : schemaCards(ctx));

    const about = [
        info.contact && (info.contact.url || info.contact.email) ? `- ${t.apiContact}: ${[info.contact.name ? plain(info.contact.name) : "", info.contact.url ? `<${info.contact.url}>` : "", info.contact.email ? `<${info.contact.email}>` : ""].filter(Boolean).join(", ")}` : "",
        info.license?.name ? `- ${t.apiLicense}: ${info.license.url ? `[${plain(info.license.name)}](${info.license.url})` : plain(info.license.name)}` : "",
        info.termsOfService ? `- [${t.apiTerms}](${info.termsOfService})` : "",
        doc.externalDocs?.url ? `- [${plain(doc.externalDocs.description || doc.externalDocs.url)}](${doc.externalDocs.url})` : "",
        `- [${t.apiDocument}](${ctx.document})`,
    ].filter(Boolean);
    parts.push("---", about.join("\n"));
    return parts.filter(Boolean).join("\n\n") + "\n";
}

// The schemas as cards, with the first sentence of their description
const schemaCards = (ctx: Context) => `::: cards\n${ctx.api.schemas.map(s =>
    `- [${plain(s.name)}](${ctx.base}/schemas/${s.slug}){fa-solid fa-cube}${s.schema.description ? `\n  ${line(firstLine(s.schema.description))}` : ""}`).join("\n")}\n:::`;

function tagMarkdown(ctx: Context, tag: Api["tags"][number]): string {
    const declared = (ctx.api.document.tags ?? []).find((t: Spec) => isObject(t) && t.name === tag.name) as Spec | undefined;
    return [
        `# ${plain(tag.name)}`,
        tag.description ? String(tag.description).trim() : "",
        declared?.externalDocs?.url ? `[${plain(declared.externalDocs.description || declared.externalDocs.url)}](${declared.externalDocs.url})` : "",
        endpointsBlock(ctx, tag.operations),
    ].filter(Boolean).join("\n\n") + "\n";
}

function schemaMarkdown(ctx: Context, schema: Api["schemas"][number]): string {
    const s = schema.schema;
    const value = exampleOf(s, "reading");
    const json = exampleText(value, "application/json");
    const xml = s.xml ? exampleText(value, "application/xml", s, schema.name) : "";
    return [
        `# ${plain(schema.name)}`,
        s.description ? String(s.description).trim() : "",
        `${ctx.t.apiType}: ${typeLabel(s, ctx.api.schemaNames, schemaLink(ctx), 0)}`,
        facts(ctx, s).join(" · "),
        fieldsBlock(schemaLines(ctx, s)),
        json && json !== "{}" ? `## ${ctx.t.apiExample}\n\n${xml ? `::: code-group\n${fence(json, "json [JSON]")}\n${fence(xml, "xml [XML]")}\n:::` : fence(json, "json")}` : "",
    ].filter(Boolean).join("\n\n") + "\n";
}

// What search engines and link previews show of a page, in its front matter like in the docs
const withDescription = (markdown: string, description: string) => description ? `---\ndescription: ${JSON.stringify(description)}\n---\n${markdown}` : markdown;
const firstLine = (text: unknown) => String(text ?? "").trim().split(/\n\s*\n/)[0]?.replace(/\s*\n\s*/g, " ") ?? "";

// Pages made before, per API (read again when its document changes, openapi.ts)
// and edition: "clay dev" loads the site for every page it serves
const made = new WeakMap<Api, Map<string, { pages: Page[], nav: DocItem }>>();

// The pages and the navigation of an API in one edition
export function apiPages(api: Api, title: string, {prefix, version, language}: { prefix: string, version: string, language: string }, t: Messages): { pages: Page[], nav: DocItem } {
    const edition = {prefix, version, language};
    const key = JSON.stringify([title, prefix, version, language, t]);
    const cached = made.get(api)?.get(key);
    if (cached) return cached;
    const result = makeApiPages(api, title, edition, t);
    if (!made.has(api)) made.set(api, new Map());
    made.get(api)!.set(key, result);
    return result;
}

function makeApiPages(api: Api, title: string, edition: { prefix: string, version: string, language: string }, t: Messages): { pages: Page[], nav: DocItem } {
    const base = edition.prefix + api.route;
    const ctx: Context = {api, base, t, document: `/_clay${edition.version ? `/${edition.version}` : ""}/openapi/${api.name}.json`};
    const pages: Page[] = [];
    const root: Crumb = {title, route: base};
    const page = (route: string, pageTitle: string, icon: string, markdown: string, parents: Crumb[], children: Crumb[], description: string, isDir: boolean): Page => {
        const made: Page = {
            route, source: api.spec, title: pageTitle, icon, isDir, parents, children, markdown: withDescription(markdown, description),
            frontMatter: {title: pageTitle, ...(description ? {description} : {})}, ...edition,
        };
        pages.push(made);
        return made;
    };
    const opItem = (op: ApiOperation): DocItem => {
        const route = operationRoute(ctx, op);
        return {
            title: operationTitle(op), link: `${route}.md`, displayLink: route, children: undefined,
            method: op.method.toUpperCase(), ...(op.operation.deprecated ? {deprecated: true} : {}),
        };
    };
    const opPage = (op: ApiOperation, parents: Crumb[]) =>
        page(operationRoute(ctx, op), operationTitle(op), "fa-solid fa-bolt", operationMarkdown(ctx, op), parents,
            [], firstLine(op.operation.description) || line(op.operation.summary), false);
    const crumbOf = (op: ApiOperation): Crumb => ({title: operationTitle(op), route: operationRoute(ctx, op)});

    const children: DocItem[] = [];
    const topCrumbs: Crumb[] = [];
    // In the sidebar, the folders of a large API start closed, and the schemas of every API
    const large = api.tags.flatMap(tag => tag.operations).length + api.untagged.length + api.webhooks.length > LARGE_API;
    const closed = large ? {collapsed: true} : {};
    for (const tag of api.tags) {
        const route = `${base}/${tag.slug}`;
        const crumb = {title: tag.name, route};
        page(route, tag.name, "fa-solid fa-tag", tagMarkdown(ctx, tag), [root], tag.operations.map(crumbOf), firstLine(tag.description), true);
        for (const op of tag.operations) opPage(op, [root, crumb]);
        children.push({title: tag.name, icon: "fa-solid fa-tag", link: route, displayLink: route, children: tag.operations.map(opItem), hasIndex: true, ...closed});
        topCrumbs.push(crumb);
    }
    for (const op of api.untagged) {
        opPage(op, [root]);
        children.push(opItem(op));
        topCrumbs.push(crumbOf(op));
    }
    if (api.webhooks.length) {
        const route = `${base}/webhooks`;
        const crumb = {title: t.apiWebhooks, route};
        page(route, t.apiWebhooks, "fa-solid fa-satellite-dish", `# ${t.apiWebhooks}\n\n${t.apiWebhookNote}\n\n${endpointsBlock(ctx, api.webhooks)}\n`,
            [root], api.webhooks.map(crumbOf), "", true);
        for (const op of api.webhooks) opPage(op, [root, crumb]);
        children.push({title: t.apiWebhooks, icon: "fa-solid fa-satellite-dish", link: route, displayLink: route, children: api.webhooks.map(opItem), hasIndex: true, ...closed});
        topCrumbs.push(crumb);
    }
    if (api.schemas.length) {
        const route = `${base}/schemas`;
        const crumb = {title: t.apiSchemas, route};
        const schemaCrumbs = api.schemas.map(s => ({title: s.name, route: `${route}/${s.slug}`}));
        // Many schemas are a list; a few are cards with their description
        const index = api.schemas.length > LARGE_API ? api.schemas.map(s => `- [${plain(s.name)}](${route}/${s.slug})`).join("\n") : schemaCards(ctx);
        page(route, t.apiSchemas, "fa-solid fa-cubes", `# ${t.apiSchemas}\n\n${index}\n`,
            [root], schemaCrumbs, "", true);
        for (const s of api.schemas) page(`${route}/${s.slug}`, s.name, "fa-solid fa-cube", schemaMarkdown(ctx, s), [root, crumb], [], firstLine(s.schema.description), false);
        children.push({
            title: t.apiSchemas, icon: "fa-solid fa-cubes", link: route, displayLink: route, hasIndex: true, collapsed: true,
            children: api.schemas.map(s => ({title: s.name, icon: "fa-solid fa-cube", link: `${route}/${s.slug}.md`, displayLink: `${route}/${s.slug}`, children: undefined})),
        });
        topCrumbs.push(crumb);
    }
    const info: Spec = isObject(api.document.info) ? api.document.info : {};
    pages.unshift({
        route: base, source: api.spec, title, icon: api.icon, isDir: true, parents: [], children: topCrumbs,
        markdown: withDescription(overviewMarkdown(ctx, title), line(info.summary) || firstLine(info.description)),
        frontMatter: {title, description: line(info.summary) || firstLine(info.description)}, ...edition,
    });
    return {pages, nav: {title, icon: api.icon, link: base, displayLink: base, children, hasIndex: true, route: api.route}};
}
