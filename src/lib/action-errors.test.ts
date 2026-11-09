import { APIError } from "better-auth/api";
import { redirect } from "next/navigation";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { UserFacingError } from "@/lib/user-facing-error";

import { actionErrorMessage, teamWording } from "./action-errors";

describe("teamWording", () => {
  it("should say team instead of organization", () => {
    expect(teamWording("You are not a member of this organization")).toBe("You are not a member of this team");
    expect(teamWording("Organization not found")).toBe("Team not found");
  });
});

describe("actionErrorMessage", () => {
  it("should show an APIError's message when one is thrown", () => {
    expect(actionErrorMessage(new APIError("BAD_REQUEST", { message: "That name is reserved." }), "fallback")).toBe("That name is reserved.");
  });

  it("should show the first zod issue when input is invalid", () => {
    const result = z.object({ email: z.email("Enter a valid email address.") }).safeParse({ email: "x" });
    expect(actionErrorMessage(result.error, "fallback")).toBe("Enter a valid email address.");
  });

  it("should hide unknown errors behind the fallback", () => {
    expect(actionErrorMessage(new Error("connection string leaked"), "Try again.")).toBe("Try again.");
  });
});

describe("actionErrorMessage with UserFacingError", () => {
  it("should show the message of an error written for the user", () => {
    expect(actionErrorMessage(new UserFacingError("Choose a team."), "fallback")).toBe("Choose a team.");
  });
});

describe("actionErrorMessage with the last-owner trigger", () => {
  it("should say the team keeps an owner when the database refused, even when the error is wrapped", () => {
    const database = new Error("A team always keeps at least one owner.");
    const wrapped = new Error("Failed query: update team_member", { cause: database });
    expect(actionErrorMessage(wrapped, "fallback")).toBe("A team always keeps at least one owner.");
  });

  it("should keep other database errors behind the fallback", () => {
    const wrapped = new Error("Failed query", { cause: new Error("duplicate key value violates unique constraint") });
    expect(actionErrorMessage(wrapped, "fallback")).toBe("fallback");
  });
});

describe("actionErrorMessage with Next's control flow", () => {
  it("should let a redirect through instead of turning it into an error message", () => {
    let thrown: unknown = null;
    try {
      redirect("/sign-in");
    } catch (error) {
      thrown = error;
    }
    expect(() => actionErrorMessage(thrown, "fallback")).toThrow();
  });
});
