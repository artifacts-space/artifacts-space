import { describe, expect, it, vi } from "vitest";

import { createSaveQueue } from "./save-queue";

/*
 * The save line behind sheet formatting: one save in flight, the newest
 * change waiting, and a rollback to the last saved value when a save fails.
 */

interface Format {
  banding: string | null;
  align: Record<string, string>;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const plain: Format = { banding: null, align: {} };
const banded: Format = { banding: "muted", align: {} };
const bandedCentered: Format = { banding: "muted", align: { name: "center" } };
const bandedRight: Format = { banding: "muted", align: { name: "right" } };

function setUp(initial: Format = plain) {
  const sends: { value: Format; answer: ReturnType<typeof deferred<Format | null>> }[] = [];
  const onSettled = vi.fn<(value: Format) => void>();
  const onFailed = vi.fn<(error: unknown) => void>();
  const line = createSaveQueue<Format>(initial, { onSettled, onFailed });
  const save = (next: Format) => {
    const answer = deferred<Format | null>();
    sends.push({ value: next, answer });
    return answer.promise;
  };
  const queue = { push: (next: Format) => { line.push(next, save); }, reset: line.reset };
  return { queue, sends, onSettled, onFailed };
}

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("createSaveQueue", () => {
  it("should send a change at once when nothing is in flight", async () => {
    const { queue, sends, onSettled } = setUp();
    queue.push(banded);
    expect(sends.map((send) => send.value)).toEqual([banded]);
    sends[0]?.answer.resolve(banded);
    await flush();
    expect(onSettled).toHaveBeenCalledWith(banded);
  });

  it("should wait for the save in flight and then send only the newest change", async () => {
    const { queue, sends, onSettled } = setUp();
    queue.push(banded);
    queue.push(bandedCentered);
    queue.push(bandedRight);
    expect(sends, "the second and third wait for the first").toHaveLength(1);

    sends[0]?.answer.resolve(banded);
    await flush();
    expect(sends.map((send) => send.value), "the change in between is dropped: the newest already includes it").toEqual([banded, bandedRight]);
    expect(onSettled, "nothing settles while a change is still on its way").not.toHaveBeenCalled();

    sends[1]?.answer.resolve(bandedRight);
    await flush();
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledWith(bandedRight);
  });

  it("should report once and settle on the last saved value when a save fails", async () => {
    const { queue, sends, onSettled, onFailed } = setUp();
    queue.push(banded);
    sends[0]?.answer.resolve(banded);
    await flush();

    queue.push(bandedCentered);
    sends[1]?.answer.reject(new Error("offline"));
    await flush();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenLastCalledWith(banded);
  });

  it("should settle on the last saved value when the saver answers null", async () => {
    const { queue, sends, onSettled, onFailed } = setUp(banded);
    queue.push(bandedCentered);
    sends[0]?.answer.resolve(null);
    await flush();
    expect(onFailed, "the saver already told the person").not.toHaveBeenCalled();
    expect(onSettled).toHaveBeenCalledWith(banded);
  });

  it("should still send the waiting change when the one in flight fails", async () => {
    const { queue, sends, onSettled, onFailed } = setUp();
    queue.push(banded);
    queue.push(bandedCentered);
    sends[0]?.answer.reject(new Error("offline"));
    await flush();
    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(sends.map((send) => send.value)).toEqual([banded, bandedCentered]);
    expect(onSettled, "the newest change is still on its way").not.toHaveBeenCalled();

    sends[1]?.answer.resolve(bandedCentered);
    await flush();
    expect(onSettled).toHaveBeenCalledWith(bandedCentered);
  });

  it("should roll back to the value the server last sent when one arrived from elsewhere", async () => {
    const { queue, sends, onSettled } = setUp(plain);
    queue.reset(bandedRight);
    queue.push(bandedCentered);
    sends[0]?.answer.reject(new Error("offline"));
    await flush();
    expect(onSettled).toHaveBeenCalledWith(bandedRight);
  });
});
