// Events for the analytics services of the site (common/analytics.ts), when
// "analytics.events" is not false and a service was loaded (plugins/analytics.client.ts)

type Services = {
    plausible?: (event: string, options: { props: Record<string, string> }) => void,
    umami?: { track: (event: string, data: Record<string, string>) => void },
    goatcounter?: { count: (options: { path: string, title: string, event: boolean }) => void },
    clayAnalyticsEvents?: boolean,
};

export function track(event: string, props: Record<string, string> = {}) {
    if (import.meta.server) return;
    const services = window as unknown as Services;
    if (!services.clayAnalyticsEvents) return;
    services.plausible?.(event, {props});
    services.umami?.track(event, props);
    services.goatcounter?.count({path: event, title: Object.values(props).join(" · "), event: true});
}
