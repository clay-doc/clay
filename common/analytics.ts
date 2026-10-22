// "analytics" in clay.yaml: page views and a few events, counted by services
// that set no cookies and keep no personal data, so readers need not be asked
// for consent first: Plausible, Umami and GoatCounter, hosted or your own.

export type AnalyticsConfiguration = {
    plausible?: { domain?: string, src?: string }, // domain defaults to the host of siteURL
    umami?: { websiteId?: string, src?: string },
    goatcounter?: { code?: string, endpoint?: string }, // code: <code>.goatcounter.com; endpoint: your own server
    events?: boolean, // searches without results, copied code, the page menu; on unless false
    feedback?: boolean, // "Was this page helpful?" under pages, sent as an event; on unless false
};

export type AnalyticsScript = { src: string, attributes: Record<string, string> };

const HTTPS = /^https:\/\/[^\s"'<>]+$/;

function plausibleDomain(analytics: AnalyticsConfiguration, siteURL: string | undefined): string | undefined {
    if (analytics.plausible?.domain) return analytics.plausible.domain;
    try {
        return siteURL ? new URL(siteURL).host : undefined;
    } catch {
        return undefined;
    }
}

// The scripts to load for the configured services; those missing a setting are left out
export function analyticsScripts(analytics: AnalyticsConfiguration | undefined, siteURL: string | undefined): AnalyticsScript[] {
    if (!analytics) return [];
    const scripts: AnalyticsScript[] = [];
    const {plausible, umami, goatcounter} = analytics;
    const domain = plausibleDomain(analytics, siteURL);
    if (plausible && domain) {
        const src = plausible.src ?? "https://plausible.io/js/script.js";
        if (HTTPS.test(src)) scripts.push({src, attributes: {"data-domain": domain}});
    }
    if (umami?.websiteId) {
        const src = umami.src ?? "https://cloud.umami.is/script.js";
        if (HTTPS.test(src)) scripts.push({src, attributes: {"data-website-id": umami.websiteId}});
    }
    const endpoint = goatcounter?.endpoint ?? (goatcounter?.code ? `https://${goatcounter.code}.goatcounter.com/count` : undefined);
    if (endpoint && HTTPS.test(endpoint)) scripts.push({src: "https://gc.zgo.at/count.js", attributes: {"data-goatcounter": endpoint}});
    return scripts;
}

// Settings the services cannot use
export function analyticsWarnings(analytics: AnalyticsConfiguration | undefined, siteURL: string | undefined): string[] {
    if (!analytics) return [];
    const warnings: string[] = [];
    if (analytics.plausible && !plausibleDomain(analytics, siteURL)) warnings.push(`clay.yaml: analytics.plausible needs "domain", or siteURL`);
    if (analytics.umami && !analytics.umami.websiteId) warnings.push(`clay.yaml: analytics.umami needs "websiteId"`);
    if (analytics.goatcounter && !analytics.goatcounter.code && !analytics.goatcounter.endpoint) warnings.push(`clay.yaml: analytics.goatcounter needs "code" or "endpoint"`);
    for (const [key, value] of [["plausible.src", analytics.plausible?.src], ["umami.src", analytics.umami?.src], ["goatcounter.endpoint", analytics.goatcounter?.endpoint]]) {
        if (value && !HTTPS.test(value)) warnings.push(`clay.yaml: analytics.${key} "${value}" is not an https address; the service is left out`);
    }
    return warnings;
}
