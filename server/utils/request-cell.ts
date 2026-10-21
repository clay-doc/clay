import {load} from "js-yaml";
import type {Site} from "../../lib/site";
import {apiSchemes, findOperation, operationCell, type Api} from "../../lib/openapi";
import {editionPrefix} from "../../common/editions";
import {apiOperationRoute} from "../../lib/openapi-pages";
import {rawCell, type CellData, type CellScheme} from "../../common/openapi";
import {format, type Messages} from "../../common/i18n";

// Finds what a request cell (::: request) sends: an operation of an API, by
// its operationId or its method and path, or a request written out
// credentials names the security schemes of an API, for the form where readers enter them all
export type CellResolver = ((title: string, text: string) => CellData | string) & {
    credentials?: (name: string) => { api: string, schemes: Record<string, CellScheme> } | undefined;
};

// Cells try the APIs of their page's version, and link to their pages in its language
export function pageCells(site: Site, page: { version: string, language: string }, t: Messages): CellResolver {
    const apis = site.versions.find(version => version.name === page.version)?.apis ?? [];
    return cellResolver(apis, editionPrefix(page.version, page.language, site.languages[0]!.code), t);
}

export function cellResolver(apis: Api[], prefix: string, t: Messages): CellResolver {
    const resolve: CellResolver = (title, text) => {
        if (!title.trim()) return rawCell(text) ?? t.requestInvalid;
        const found = findOperation(apis, title);
        if ("problem" in found) {
            return found.problem === "api" ? format(t.requestUnknownApi, {name: found.name}) : format(t.requestUnknownOperation, {operation: found.wanted, api: found.name});
        }
        let values: Record<string, string> = {};
        try {
            const data = text.trim() ? load(text) : undefined;
            if (data && typeof data === "object" && !Array.isArray(data)) {
                values = Object.fromEntries(Object.entries(data).map(([key, value]) =>
                    [key, typeof value === "string" ? value : JSON.stringify(value, null, key === "body" ? 2 : 0)]));
            }
        } catch {
            return t.requestInvalidValues;
        }
        const {api, op} = found;
        return operationCell(api, op, values, apiOperationRoute(api, op, prefix + api.route));
    };
    resolve.credentials = name => {
        const api = apis.find(api => api.name === name);
        return api && {api: api.route, schemes: apiSchemes(api)};
    };
    return resolve;
}
