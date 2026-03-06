export default function linkConcat(a: string, b: string) {
    // "/a" + "/b" => "/a/b"
    // "a" + "b" => "/a/b"
    // "a/" + "b" => "/a/b"
    // "a" + "/b" => "/a/b"
    // "a" + "" => "/a"
    // "" + "b" => "/b"
    // "/" + "b" => "/b"
    // "/" + "/b" => "/b"
    // "a" + "/" => "/a"
    // "a/" + "/" => "/a"
    // "" + "" => "/"
    // "/" + "/" => "/"

    const aHasLeadingSlash = a.startsWith("/");
    const aHasTrailingSlash = a.endsWith("/");
    const bHasLeadingSlash = b.startsWith("/");

    const aTrimmed = a.replace(/^\/+|\/+$/g, "");
    const bTrimmed = b.replace(/^\/+|\/+$/g, "");

    if (aTrimmed === "" && bTrimmed === "") {
        return "/";
    }

    if (aTrimmed === "") {
        return bHasLeadingSlash ? b : "/" + b;
    }

    if (bTrimmed === "") {
        return aHasLeadingSlash ? a : "/" + a;
    }

    const separator = (aHasTrailingSlash || bHasLeadingSlash) ? "" : "/";

    return (aHasLeadingSlash ? a : "/" + a) + separator + (bHasLeadingSlash ? b : "/" + b);
}