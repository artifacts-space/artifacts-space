import { describe, expect, it } from "vitest";

import { parseTeamRole, roleLabel } from "./roles";

describe("parseTeamRole", () => {
  it("should read a single known role", () => {
    expect(parseTeamRole("owner")).toBe("owner");
    expect(parseTeamRole("admin")).toBe("admin");
  });

  it("should pick the highest role when several are stored", () => {
    expect(parseTeamRole("member, admin")).toBe("admin");
    expect(parseTeamRole("admin,owner")).toBe("owner");
  });

  it("should treat unknown or missing roles as member", () => {
    expect(parseTeamRole("superuser")).toBe("member");
    expect(parseTeamRole(null)).toBe("member");
    expect(parseTeamRole("")).toBe("member");
  });
});

describe("roleLabel", () => {
  it("should label roles for the UI", () => {
    expect(roleLabel("admin")).toBe("Admin");
  });
});
