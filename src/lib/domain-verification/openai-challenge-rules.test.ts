import { describe, expect, it } from "vitest";

import { OPENAI_CHALLENGE_ENV, openAiChallengeResponse, openAiChallengeToken } from "./openai-challenge-rules";

const asEnv = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

function env(value: string | undefined): NodeJS.ProcessEnv {
  return asEnv(value === undefined ? {} : { [OPENAI_CHALLENGE_ENV]: value });
}

describe("openAiChallengeResponse", () => {
  it("should return 404 when the token is unset", async () => {
    const response = openAiChallengeResponse(env(undefined));
    expect(response.status).toBe(404);
    expect(await response.text()).not.toBe("");
  });

  it("should return 404, never an empty 200, when the token is blank", () => {
    expect(openAiChallengeResponse(env("")).status).toBe(404);
    expect(openAiChallengeResponse(env("   \n")).status).toBe(404);
  });

  it("should return only the exact token as plain text when the token is set", async () => {
    const response = openAiChallengeResponse(env("abc123-token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("abc123-token");
  });

  it("should drop surrounding whitespace when the variable was pasted with a newline", async () => {
    expect(await openAiChallengeResponse(env("  abc123-token\n")).text()).toBe("abc123-token");
  });

  it("should never let a cache keep the token when it is served", () => {
    expect(openAiChallengeResponse(env("abc123-token")).headers.get("cache-control")).toBe("no-store");
  });
});

describe("openAiChallengeToken", () => {
  it("should read only the documented variable when other variables are set", () => {
    expect(openAiChallengeToken(asEnv({ OPENAI_APPS_CHALLENGE: "wrong-name" }))).toBeNull();
    expect(openAiChallengeToken(env("right"))).toBe("right");
  });
});
