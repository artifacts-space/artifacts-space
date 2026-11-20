import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { announceSharingChanged, onSharingChanged } from "./sharing-events";

describe("sharing events", () => {
  beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should call the listener when the sharing of its artifact is saved", () => {
    const listener = vi.fn();
    onSharingChanged("artifact-one", listener);

    announceSharingChanged("artifact-one");
    announceSharingChanged("artifact-one");

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("should not call the listener when another artifact's sharing is saved", () => {
    const listener = vi.fn();
    onSharingChanged("artifact-one", listener);

    announceSharingChanged("artifact-two");

    expect(listener).not.toHaveBeenCalled();
  });

  it("should stop calling the listener when its cleanup ran", () => {
    const listener = vi.fn();
    const stop = onSharingChanged("artifact-one", listener);

    stop();
    announceSharingChanged("artifact-one");

    expect(listener).not.toHaveBeenCalled();
  });

  it("should do nothing when there is no window", () => {
    vi.stubGlobal("window", undefined);

    expect(() => { announceSharingChanged("artifact-one"); }).not.toThrow();
  });
});
