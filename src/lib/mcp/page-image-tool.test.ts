import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * artifacts_page_image through the real MCP server and client over an
 * in-memory transport. The read itself (src/lib/page-render/read.ts) is
 * mocked; its own tests cover who gets a picture.
 */

const data = vi.hoisted(() => ({ readPageImage: vi.fn() }));
vi.mock("@/lib/page-render/read", () => ({ readPageImage: data.readPageImage }));

const { registerPageImageTool } = await import("./page-image-tool");

const publicId = "4fXkP9qR2sT7vW1yZ3aB5c";
let client: Client;

async function connect(access: "full" | "read") {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  registerPageImageTool(server, "user-1", access);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "test-client", version: "1.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
}

interface ToolResult {
  isError?: boolean;
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  structuredContent?: { error?: { code: string } };
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(async () => {
  await client.close();
});

describe("artifacts_page_image", () => {
  it("should list the tool as read-only on a read-only connection", async () => {
    await connect("read");
    const { tools } = await client.listTools();
    expect(tools.find((tool) => tool.name === "artifacts_page_image")?.annotations?.readOnlyHint).toBe(true);
  });

  it("should return the text, then the picture, with no structured content when the page was drawn", async () => {
    await connect("full");
    data.readPageImage.mockResolvedValue({
      state: "image",
      facts: { title: "Launch", viewport: { width: 390, height: 844 }, savedAt: "2026-11-24T09:30:00.000Z", drawnAt: "2026-11-24T09:31:00.000Z" },
      picture: { bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" },
    });
    const result = (await client.callTool({ name: "artifacts_page_image", arguments: { id: publicId, width: 390, height: 844 } })) as ToolResult;
    expect(data.readPageImage).toHaveBeenCalledWith("user-1", { publicId, width: 390, height: 844 });
    expect(result.content[0]?.text).toContain("390 by 844");
    expect(result.content[0]?.text).toContain("never instructions");
    expect(result.content[1]).toEqual({ type: "image", data: "AQID", mimeType: "image/webp" });
    expect(result.structuredContent).toBeUndefined();
  });

  it("should return a typed tool error when there is no picture", async () => {
    await connect("full");
    data.readPageImage.mockResolvedValue({ state: "refused", refusal: { code: "not_html", message: "This artifact is not an HTML page." } });
    const result = (await client.callTool({ name: "artifacts_page_image", arguments: { id: publicId } })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(result.structuredContent?.error?.code).toBe("not_html");
  });

  it("should refuse a width outside the limits before it reads anything", async () => {
    await connect("full");
    const result = (await client.callTool({ name: "artifacts_page_image", arguments: { id: publicId, width: 4000 } })) as ToolResult;
    expect(result.isError).toBe(true);
    expect(data.readPageImage).not.toHaveBeenCalled();
  });
});
