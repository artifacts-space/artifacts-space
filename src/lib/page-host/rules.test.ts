import { describe, expect, it } from "vitest";

import { pageHostPattern } from "@/lib/security-header-rules";

import { frameDocument } from "./frame-document";
import { framingSite, pageHostResponse } from "./respond";
import { hostName, hostPort, isUnderPageDomain, looksLikePageHost, pageDomainRewrites, pageDomainRewriteSource, pageContentPolicy, pageFramePath, pageHostBase, pageHostPath, pageLabelFor, pageLabelOf, pageOrigin, pageSandbox, pageScriptHosts } from "./rules";

/** A stand-in for a page files token: the shape of one, opened by nothing. */
const token = "t".repeat(120);

const label = "0123456789abcdef0123456789abcdef";
const production = { NODE_ENV: "production", PAGE_HOST: "artifacts.link", BETTER_AUTH_URL: "https://artifacts.space" } as NodeJS.ProcessEnv;

describe("pageHostBase", () => {
  it("should be the PAGE_HOST setting when it is set", () => {
    expect(pageHostBase({ NODE_ENV: "production", PAGE_HOST: " Artifacts.Link " })).toBe("artifacts.link");
  });

  it("should be localhost under next dev, and nothing in production, when the setting is missing", () => {
    expect(pageHostBase({ NODE_ENV: "development" })).toBe("localhost");
    expect(pageHostBase({ NODE_ENV: "production" })).toBeNull();
  });

  it("should refuse a setting that is not a host name", () => {
    expect(pageHostBase({ NODE_ENV: "production", PAGE_HOST: "https://artifacts.link/" })).toBeNull();
  });
});

describe("page host names", () => {
  it("should read the name and the port from a Host header", () => {
    expect(hostName("ABC.Example.com:8080")).toBe("abc.example.com");
    expect(hostPort("abc.example.com:8080")).toBe("8080");
    expect(hostPort("abc.example.com")).toBe("");
    expect(hostName(null)).toBe("");
  });

  it("should see a page host of any domain, and never one of the site's own hosts", () => {
    expect(looksLikePageHost(`${label}.artifacts.link`)).toBe(true);
    expect(looksLikePageHost(`${label}.localhost:3000`)).toBe(true);
    for (const host of ["artifacts.space", "www.artifacts.space", "localhost:3000", "artifacts-space-git-main-acme.vercel.app", label, `${label}.`, `x${label}.artifacts.link`, null]) {
      expect(looksLikePageHost(host), String(host)).toBe(false);
    }
  });

  it("should agree with the pattern the proxy matcher and the header rules use", () => {
    const pattern = new RegExp(`^${pageHostPattern}$`);
    for (const host of [`${label}.artifacts.link`, `${label}.localhost`, "artifacts.space", "www.artifacts.space", label, `x${label}.artifacts.link`]) {
      expect(pattern.test(host), host).toBe(looksLikePageHost(host));
    }
  });

  it("should take a label only on this deployment's page domain", () => {
    expect(pageLabelOf(`${label}.artifacts.link`, "artifacts.link")).toBe(label);
    expect(pageLabelOf(`${label}.localhost:3471`, "localhost")).toBe(label);
    expect(pageLabelOf(`${label}.example.com`, "artifacts.link")).toBeNull();
    expect(pageLabelOf(`${label}.evil-artifacts.link`, "artifacts.link")).toBeNull();
    expect(pageLabelOf(`${label}.sub.artifacts.link`, "artifacts.link")).toBeNull();
    expect(pageLabelOf(`${label}.artifacts.link`, null)).toBeNull();
  });
});

describe("pageLabelFor", () => {
  it("should give each artifact its own stable label that does not contain its public id", async () => {
    const one = await pageLabelFor("CXpyuB2wc5uTJmRsdqZyKy");
    expect(one).toMatch(/^[0-9a-f]{32}$/);
    expect(await pageLabelFor("CXpyuB2wc5uTJmRsdqZyKy")).toBe(one);
    expect(await pageLabelFor("CXpyuB2wc5uTJmRsdqZyKz")).not.toBe(one);
    expect(one.toLowerCase()).not.toContain("cxpyub2w");
  });
});

describe("pageOrigin", () => {
  it("should use the site's scheme and port", () => {
    expect(pageOrigin(label, "artifacts.link", { protocol: "https:", port: "" })).toBe(`https://${label}.artifacts.link`);
    expect(pageOrigin(label, "localhost", { protocol: "http:", port: "3471" })).toBe(`http://${label}.localhost:3471`);
  });
});

describe("pageContentPolicy", () => {
  const policy = pageContentPolicy("https://artifacts.space");
  const directive = (name: string) => policy.split("; ").find((part) => part.startsWith(`${name} `)) ?? "";

  it("should close everything a directive does not open", () => {
    expect(policy.startsWith("default-src 'none'")).toBe(true);
  });

  it("should let only the site frame the page", () => {
    expect(directive("frame-ancestors")).toBe("frame-ancestors https://artifacts.space");
  });

  it("should let inline scripts run and load scripts from the page's own host and the public package hosts only", () => {
    expect(directive("script-src")).toContain("'unsafe-inline'");
    expect(directive("script-src")).toContain("https://cdn.jsdelivr.net");
    expect(directive("script-src")).not.toMatch(/\*|https:(\s|$)|artifacts/);
    expect(directive("script-src").split(" ").slice(1)).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'", "blob:", ...pageScriptHosts]);
  });

  it("should allow no request to this site or to any host but the page's own and the listed package hosts", () => {
    expect(directive("connect-src")).not.toMatch(/\*|https:(\s|$)|artifacts/);
    expect(directive("img-src")).not.toMatch(/\*|https:(\s|$)|artifacts/);
    // The listed hosts stay reachable without a click: a known limit, stated on pageContentPolicy.
    expect(directive("connect-src").split(" ").slice(1)).toEqual(["'self'", ...pageScriptHosts]);
    expect(directive("img-src").split(" ").slice(1)).toEqual(["'self'", "data:", "blob:", ...pageScriptHosts]);
  });

  it("should let the page load its own files of every kind, and nothing else of its host's", () => {
    for (const name of ["script-src", "style-src", "font-src", "img-src", "media-src", "connect-src", "worker-src"]) {
      expect(directive(name).split(" "), name).toContain("'self'");
    }
    for (const name of ["frame-src", "object-src", "base-uri", "form-action"]) {
      expect(directive(name), name).toBe(`${name} 'none'`);
    }
  });

  it("should forbid forms, frames, plugins, and a base address", () => {
    expect(policy).toContain("form-action 'none'");
    expect(policy).toContain("frame-src 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'none'");
  });
});

describe("pageSandbox", () => {
  it("should never let the page navigate the tab it is shown in, or start a download", () => {
    expect(pageSandbox).not.toContain("allow-top-navigation");
    expect(pageSandbox).not.toContain("allow-downloads");
    // A tab the page opens keeps the sandbox, so it cannot be used to get around it.
    expect(pageSandbox).not.toContain("allow-popups-to-escape-sandbox");
    expect(pageSandbox).toContain("allow-scripts");
  });
});

describe("frameDocument", () => {
  it("should take the page from the site's window only", () => {
    const html = frameDocument("https://artifacts.space");
    expect(html).toContain('var site = "https://artifacts.space"');
    expect(html).toContain("event.origin !== site || event.source !== host");
    expect(html).toContain("if (!host || host === window) return;");
  });

  it("should answer the site's question with the question's id, and answer only the site", () => {
    const html = frameDocument("https://artifacts.space");
    expect(html).toContain('host.postMessage({ type: "artifact-page:pong", id: event.data.id }, site)');
    expect(html).toContain("function onPing(event) {\n    if (event.origin !== site || event.source !== host) return;");
    // It answers before the page is written too, and again after document.open() dropped the first listener.
    expect(html.split('window.addEventListener("message", onPing);').length - 1).toBe(2);
    // The listener is added after document.open(), which drops the earlier ones, and before the page is written.
    expect(html.indexOf("document.open()")).toBeLessThan(html.indexOf('window.addEventListener("message", onPing)'));
    expect(html.indexOf('window.addEventListener("message", onPing)')).toBeLessThan(html.indexOf("document.write(data.html)"));
  });

  it("should never let a value end its script element", () => {
    const html = frameDocument('https://x"</script><script>alert(1)</script>');
    const lower = html.toLowerCase();
    expect(lower.split("<script").length - 1).toBe(1);
    expect(lower.split("</script").length - 1).toBe(1);
  });
});

describe("framingSite", () => {
  it("should be the configured site in production, whatever Host the request names", () => {
    expect(framingSite(`${label}.evil.example:1234`, production)).toBe("https://artifacts.space");
  });

  it("should be localhost on the request's port under next dev", () => {
    expect(framingSite(`${label}.localhost:3471`, { NODE_ENV: "development" })).toBe("http://localhost:3471");
  });
});

describe("pageHostResponse", () => {
  const answer = (pathname: string, method = "GET", host = `${label}.artifacts.link`) => pageHostResponse({ method, pathname, host }, production);
  /** The answer, for a request the proxy answers itself. */
  const ask = (pathname: string, method = "GET", host = `${label}.artifacts.link`) => {
    const response = answer(pathname, method, host);
    if (!response) throw new Error(`${pathname} was let through to the page file route.`);
    return response;
  };

  it("should serve the frame document at the root, cacheable, with no cookie", async () => {
    const response = ask("/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(await response.text()).toContain("artifact-page:ready");
  });

  it("should send no body for HEAD", async () => {
    const response = ask("/", "HEAD");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it.each(["/app", "/index.html", "/api/files/1", "//", "/a/b", "/f", "/f/", `/f/${token}`, `/f/${token}/`, "/f/short/site.css", `/f/${token}x!/site.css`, `/page-file/${token}/site.css`])("should answer 404 for %s", (pathname) => {
    expect(ask(pathname).status).toBe(404);
  });

  it("should serve the same frame document as the page's name under a files address, so the page's files are its siblings", async () => {
    const response = ask(`/f/${token}/index.html`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toBe(ask("/").headers.get("content-security-policy"));
    expect(await response.text()).toBe(await ask("/").text());
    expect(pageFramePath(token)).toBe(`/f/${token}/index.html`);
    expect(pageFramePath(null)).toBe("/");
  });

  it("should let a GET or HEAD of a page file through to its route, and nothing else", () => {
    for (const pathname of [`/f/${token}/site.css`, `/f/${token}/js/app.js`, `/f/${token}/img/a/b/logo.png`]) {
      expect(answer(pathname), pathname).toBeNull();
      expect(answer(pathname, "HEAD"), pathname).toBeNull();
      expect(ask(pathname, "POST").status, pathname).toBe(405);
      expect(ask(pathname, "DELETE").status, pathname).toBe(405);
    }
  });

  it("should never let a page file's path through on a host that is not a page host of this deployment", () => {
    for (const host of ["www.artifacts.link", "artifacts.space", `${label}.example.com`, `${label}.x.artifacts.link`]) {
      expect(ask(`/f/${token}/site.css`, "GET", host).status, host).toBe(404);
    }
    expect(pageHostResponse({ method: "GET", pathname: `/f/${token}/site.css`, host: `${label}.artifacts.link` }, { NODE_ENV: "production" })?.status).toBe(404);
  });

  it("should read a path as the frame document, a page file, or nothing", () => {
    expect(pageHostPath("/")).toBe("frame");
    expect(pageHostPath(`/f/${token}/index.html`)).toBe("frame");
    expect(pageHostPath(`/f/${token}/css/site.css`)).toBe("file");
    expect(pageHostPath(`/f/${token}/css/index.html`)).toBe("file");
    for (const pathname of ["", "/f", `/f/${token}`, `/f/${token}/`, "/index.html", `/F/${token}/site.css`, `/x/f/${token}/site.css`]) expect(pageHostPath(pathname), pathname).toBe("none");
  });

  it("should refuse every method but GET and HEAD", () => {
    expect(ask("/", "POST").status).toBe(405);
    expect(ask("/", "OPTIONS").status).toBe(405);
  });

  it("should answer 404, sandboxed and unframeable, for a page host on another domain", () => {
    const response = ask("/", "GET", `${label}.example.com`);
    expect(response.status).toBe(404);
    expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; sandbox; frame-ancestors 'none'");
  });
});

describe("hosts under the page domain that are not page hosts", () => {
  const label = "0123456789abcdef0123456789abcdef";
  /** Next matches a `has` host value against the whole host name, without its port. */
  const ruleMatches = (host: string, env: Record<string, string>) => {
    const [rule] = pageDomainRewrites({ NODE_ENV: "production", ...env });
    const value = rule?.has[0]?.value;
    return value !== undefined && new RegExp(`^${value}$`).test(host);
  };

  it("should send every path of every host under the page domain to the refusal", () => {
    const rules = pageDomainRewrites({ NODE_ENV: "production", PAGE_HOST: "artifacts.link" });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ source: pageDomainRewriteSource, destination: "/page-host-refusal" });
    for (const host of ["www.artifacts.link", "app.artifacts.link", "a.b.artifacts.link", `${label}.x.artifacts.link`, `${label}.artifacts.link`]) {
      expect(ruleMatches(host, { PAGE_HOST: "artifacts.link" }), host).toBe(true);
    }
  });

  it("should leave out only a page file's path, which its own route refuses on every host but a page host", () => {
    // Next compiles the source with path-to-regexp; the group is the pattern between the parentheses, tried against the path after its first slash.
    const group = /^\/:path\((.*)\)$/.exec(pageDomainRewriteSource)?.[1] ?? "";
    const caught = (pathname: string) => new RegExp(`^${group}$`).test(pathname.slice(1));
    for (const pathname of ["/", "/app", "/sign-in", "/api/auth/get-session", "/f", "/f/", `/f/${token}`, `/f/${token}/`, "/files/x/y", `/x/f/${token}/site.css`, "/_next/static/chunk.js"]) expect(caught(pathname), pathname).toBe(true);
    for (const pathname of [`/f/${token}/site.css`, `/f/${token}/js/app.js`, `/f/${token}/index.html`]) expect(caught(pathname), pathname).toBe(false);
  });

  it("should hold for a host in capitals and for one that ends with a dot, as the proxy's check does", () => {
    for (const host of ["WWW.ARTIFACTS.LINK", "Www.Artifacts.Link", "www.artifacts.link.", "WWW.ARTIFACTS.LINK."]) {
      expect(ruleMatches(host, { PAGE_HOST: "artifacts.link" }), host).toBe(true);
      expect(isUnderPageDomain(host, "artifacts.link"), host).toBe(true);
    }
    expect(ruleMatches("www.my-pages.example.net", { PAGE_HOST: "my-pages.example.net" })).toBe(true);
    expect(ruleMatches("www.mypages.example.net", { PAGE_HOST: "my-pages.example.net" })).toBe(false);
  });

  it("should never catch the site, a look-alike domain, or the page domain itself", () => {
    for (const host of ["artifacts.link.", "ARTIFACTS.LINK", "artifacts.link.evil.example"]) {
      expect(ruleMatches(host, { PAGE_HOST: "artifacts.link" }), host).toBe(false);
    }
    for (const host of ["artifacts.space", "www.artifacts.space", "artifacts.link", "notartifacts.link", "www.artifactsxlink", "artifacts.link.example.com", "localhost"]) {
      expect(ruleMatches(host, { PAGE_HOST: "artifacts.link" }), host).toBe(false);
    }
  });

  it("should add no rule where no page domain is set", () => {
    expect(pageDomainRewrites({ NODE_ENV: "production" })).toEqual([]);
    expect(pageDomainRewrites({ NODE_ENV: "production", PAGE_HOST: "not a host" })).toEqual([]);
  });

  it("should tell a host under the page domain from the domain itself and from other domains", () => {
    expect(isUnderPageDomain("www.artifacts.link", "artifacts.link")).toBe(true);
    expect(isUnderPageDomain("WWW.Artifacts.Link:443", "artifacts.link")).toBe(true);
    expect(isUnderPageDomain(`${label}.artifacts.link`, "artifacts.link")).toBe(true);
    expect(isUnderPageDomain("artifacts.link", "artifacts.link")).toBe(false);
    expect(isUnderPageDomain("notartifacts.link", "artifacts.link")).toBe(false);
    expect(isUnderPageDomain("artifacts.space", "artifacts.link")).toBe(false);
    expect(isUnderPageDomain("www.artifacts.link", null)).toBe(false);
    expect(isUnderPageDomain(null, "artifacts.link")).toBe(false);
  });
});
