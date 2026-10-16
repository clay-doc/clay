import {describe, expect, it} from "vitest";
import {analyticsScripts, analyticsWarnings} from "../../common/analytics";

describe("analytics", () => {
    it("loads the scripts of the configured services", () => {
        expect(analyticsScripts({plausible: {}, umami: {websiteId: "abc"}, goatcounter: {code: "docs"}}, "https://docs.example.com")).toEqual([
            {src: "https://plausible.io/js/script.js", attributes: {"data-domain": "docs.example.com"}},
            {src: "https://cloud.umami.is/script.js", attributes: {"data-website-id": "abc"}},
            {src: "https://gc.zgo.at/count.js", attributes: {"data-goatcounter": "https://docs.goatcounter.com/count"}},
        ]);
    });

    it("works with self-hosted services", () => {
        expect(analyticsScripts({plausible: {domain: "docs.example.com", src: "https://stats.example.com/js/script.js"}}, undefined))
            .toEqual([{src: "https://stats.example.com/js/script.js", attributes: {"data-domain": "docs.example.com"}}]);
        expect(analyticsScripts({goatcounter: {endpoint: "https://count.example.com/count"}}, undefined)[0]!.attributes)
            .toEqual({"data-goatcounter": "https://count.example.com/count"});
    });

    it("leaves out services that miss a setting, with a warning", () => {
        const analytics = {plausible: {}, umami: {}, goatcounter: {}, };
        expect(analyticsScripts(analytics, undefined)).toEqual([]);
        expect(analyticsWarnings(analytics, undefined)).toEqual([
            'clay.yaml: analytics.plausible needs "domain", or siteURL',
            'clay.yaml: analytics.umami needs "websiteId"',
            'clay.yaml: analytics.goatcounter needs "code" or "endpoint"',
        ]);
        expect(analyticsWarnings({umami: {websiteId: "abc", src: "http://stats.example.com/script.js"}}, undefined))
            .toEqual(['clay.yaml: analytics.umami.src "http://stats.example.com/script.js" is not an https address; the service is left out']);
    });
});
