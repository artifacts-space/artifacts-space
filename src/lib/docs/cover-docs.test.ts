import { describe, expect, it } from "vitest";

import { resolveCoverChange } from "@/lib/covers/cover";

import { coverMcpExamples } from "./cover-docs";

interface ExampleCall {
  arguments: { cover?: string | null; coverPosition?: number };
}

function args(json: string): ExampleCall["arguments"] {
  return (JSON.parse(json) as ExampleCall).arguments;
}

describe("cover docs examples", () => {
  it("should be accepted by the server's cover rules when an agent sends them", () => {
    const create = args(coverMcpExamples.createWithGradient);
    expect(resolveCoverChange(create.cover, create.coverPosition, null)).toEqual({ ok: true, cover: "dawn" });
    const image = args(coverMcpExamples.updateWithImage);
    expect(resolveCoverChange(image.cover, image.coverPosition, null)).toMatchObject({ ok: true, cover: expect.stringMatching(/^file:[0-9a-f-]{36}@30$/) as unknown });
    const move = args(coverMcpExamples.reposition);
    expect(resolveCoverChange(move.cover, move.coverPosition, "file:0f8fad5b-d9cb-469f-a165-70867728950e")).toMatchObject({ ok: true });
    const clear = args(coverMcpExamples.clear);
    expect(resolveCoverChange(clear.cover, clear.coverPosition, "mist")).toEqual({ ok: true, cover: null });
  });
});
