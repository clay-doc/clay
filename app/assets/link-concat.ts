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

    const aTrimmed = a.replace(/^\/+|\/+$/g, "");
    const bTrimmed = b.replace(/^\/+|\/+$/g, "");

    return "/" + [aTrimmed, bTrimmed].filter(part => part !== "").join("/");
}