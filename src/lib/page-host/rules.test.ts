import { describe, expect, it } from "vitest";

import { pageHostPattern } from "@/lib/security-header-rules";

import { frameDocument } from "./frame-document";
import { framingSite, pageHostResponse } from "./respond";
import { hostName, hostPort, looksLikePageHost, pageContentPolicy, pageHostBase, pageLabelFor, pageLabelOf, pageOrigin, pageSandbox } from "./rules";

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
  it("should give each artifact its own stable label that does not contain its id", async () => {
    const one = await pageLabelFor("3f2a1b4c-0000-4000-8000-000000000001");
    expect(one).toMatch(/^[0-9a-f]{32}$/);
    expect(await pageLabelFor("3f2a1b4c-0000-4000-8000-000000000001")).toBe(one);
    expect(await pageLabelFor("3f2a1b4c-0000-4000-8000-000000000002")).not.toBe(one);
    expect(one).not.toContain("3f2a1b4c");
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

  it("should let inline scripts run and load scripts from the public package hosts only", () => {
    expect(directive("script-src")).toContain("'unsafe-inline'");
    expect(directive("script-src")).toContain("https://cdn.jsdelivr.net");
    expect(directive("script-src")).not.toMatch(/\*|https:(\s|$)|'self'/);
  });

  it("should allow no request to this site, to the page host, or to any other site", () => {
    expect(directive("connect-src")).not.toMatch(/\*|https:(\s|$)|'self'|artifacts/);
    expect(directive("img-src")).not.toMatch(/\*|https:(\s|$)|'self'/);
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
  const ask = (pathname: string, method = "GET", host = `${label}.artifacts.link`) => pageHostResponse({ method, pathname, host }, production);

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

  it.each(["/app", "/index.html", "/api/files/1", "//", "/a/b"])("should answer 404 for %s", (pathname) => {
    expect(ask(pathname).status).toBe(404);
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
