import { describe, expect, it } from "vitest";

import { passwordFailureMessage, passwordFormProblem, passwordRefusal } from "./sign-in-form-rules";

describe("passwordFailureMessage", () => {
  it("should say one sentence when the password is wrong, the email is unknown, or the address is not confirmed", () => {
    expect(passwordFailureMessage({ status: 401, message: "Invalid email or password" })).toBe(passwordRefusal);
    expect(passwordFailureMessage({ status: 403, message: "Email not verified" })).toBe(passwordRefusal);
  });

  it("should show the server's own wait when a limit refuses", () => {
    expect(passwordFailureMessage({ status: 429, message: "Slow down. Try again in 2 minutes." })).toBe("Slow down. Try again in 2 minutes.");
  });

  it("should never show the server's text when the refusal is something else", () => {
    expect(passwordFailureMessage({ status: 400, message: "Some internal detail" })).toBe("Something went wrong. Check your connection and try again.");
    expect(passwordFailureMessage({ status: 500 })).toBe("Something went wrong. Check your connection and try again.");
  });
});

describe("passwordFormProblem", () => {
  it("should ask for each field when it is empty or the email is not an address", () => {
    expect(passwordFormProblem(" ", "x")).toBe("Enter your email address.");
    expect(passwordFormProblem("reviewer", "x")).toBe("Enter a valid email address.");
    expect(passwordFormProblem("reviewer@example.com", "")).toBe("Enter your password.");
  });

  it("should let the form send when both fields are filled", () => {
    expect(passwordFormProblem("reviewer@example.com", "a password")).toBeNull();
  });
});
