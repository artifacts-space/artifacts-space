import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl, fakeNeonHost, neonDomain } from "./fake-database-url";

describe("fakeDatabaseUrl", () => {
  it("should build a URL that parses into the given parts when every part is set", () => {
    const url = new URL(fakeDatabaseUrl({ user: "app", password: "pw", host: "db.test", port: 5433, database: "main", query: "sslmode=require" }));
    expect(url.protocol).toBe("postgres:");
    expect(url.username).toBe("app");
    expect(url.password).toBe("pw");
    expect(url.hostname).toBe("db.test");
    expect(url.port).toBe("5433");
    expect(url.pathname).toBe("/main");
    expect(url.searchParams.get("sslmode")).toBe("require");
  });

  it("should leave the password out when it is empty", () => {
    const url = new URL(fakeDatabaseUrl({ user: "u", password: "", host: "127.0.0.1" }));
    expect(url.username).toBe("u");
    expect(url.password).toBe("");
  });

  it("should use fake defaults when no parts are given", () => {
    const url = new URL(fakeDatabaseUrl());
    expect(url.hostname).toBe("db.example.com");
    expect(url.password).toBe("fake-password");
  });

  it("should keep the host when the user or password holds reserved characters", () => {
    const url = new URL(fakeDatabaseUrl({ user: "a@b", password: "p@ss:w/rd?#", host: "db.test", database: "x/y" }));
    expect(url.hostname).toBe("db.test");
    expect(decodeURIComponent(url.username)).toBe("a@b");
    expect(decodeURIComponent(url.password)).toBe("p@ss:w/rd?#");
    expect(decodeURIComponent(url.pathname)).toBe("/x/y");
  });

  it("should throw when the host or query holds a reserved character", () => {
    expect(() => fakeDatabaseUrl({ host: "evil@db.test" })).toThrow("host");
    expect(() => fakeDatabaseUrl({ host: "db.test:5432" })).toThrow("host");
    expect(() => fakeDatabaseUrl({ query: "a=1#frag" })).toThrow("query");
  });
});

describe("fakeNeonHost", () => {
  it("should put the endpoint first and end with Neon's domain", () => {
    const host = fakeNeonHost("ep-test-000000");
    expect(host.startsWith("ep-test-000000.")).toBe(true);
    expect(host.endsWith(`.${neonDomain}`)).toBe(true);
    expect(new URL(fakeDatabaseUrl({ host })).hostname).toBe(host);
  });
});
