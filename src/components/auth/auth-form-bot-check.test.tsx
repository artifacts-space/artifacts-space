import { isValidElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

/*
 * The wiring that turns the browser half of the bot check on: the sign-in
 * pages tell the form whether the host's check exists here, and the form
 * hands that to the hook. If either link were dropped, a deployment would
 * refuse every request for a sign-in link while every other test passed.
 * The hook itself is tested in src/lib/abuse/bot-check-client.test.ts.
 */

const mocks = vi.hoisted(() => ({ useSignInLinkBotCheck: vi.fn<(enabled: boolean) => void>() }));

vi.mock("@/lib/abuse/bot-check-client", () => ({ useSignInLinkBotCheck: mocks.useSignInLinkBotCheck }));

const { AuthForm } = await import("@/components/auth/auth-form");
const { default: SignInPage } = await import("@/app/(auth)/sign-in/page");
const { default: SignUpPage } = await import("@/app/(auth)/sign-up/page");

/** The `botCheck` prop the page gives its form. */
function botCheckOf(page: ReactElement): unknown {
  const form: unknown = (page.props as { children?: unknown }).children;
  if (!isValidElement(form) || form.type !== AuthForm) throw new Error("expected the page to render the sign-in form");
  return (form.props as { botCheck?: unknown }).botCheck;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("the sign-in pages", () => {
  it("should turn the bot check on in the form when the page is built on a Vercel deployment", () => {
    for (const env of ["production", "preview"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(botCheckOf(SignInPage())).toBe(true);
      expect(botCheckOf(SignUpPage())).toBe(true);
    }
  });

  it("should leave the bot check off when there is no host check to load: development and self-hosting", () => {
    for (const env of ["", "development"]) {
      vi.stubEnv("VERCEL_ENV", env);
      expect(botCheckOf(SignInPage())).toBe(false);
      expect(botCheckOf(SignUpPage())).toBe(false);
    }
  });
});

describe("AuthForm", () => {
  it("should hand the page's word to the hook that starts the check, on or off", () => {
    renderToString(<AuthForm mode="sign-in" googleEnabled={false} botCheck />);
    expect(mocks.useSignInLinkBotCheck.mock.calls).toEqual([[true]]);
    mocks.useSignInLinkBotCheck.mockClear();
    renderToString(<AuthForm mode="sign-up" googleEnabled={false} botCheck={false} />);
    expect(mocks.useSignInLinkBotCheck.mock.calls).toEqual([[false]]);
  });
});
