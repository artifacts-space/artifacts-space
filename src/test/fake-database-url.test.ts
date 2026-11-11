import { describe, expect, it } from "vitest";

import { fakeDatabaseUrl } from "./fake-database-url";

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
});
