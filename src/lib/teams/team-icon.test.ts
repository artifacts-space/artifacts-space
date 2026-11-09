import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Team icon storage: the bytes are checked before anything is stored, the
 * old object is deleted after a replace or remove (best effort, logged),
 * and a link is signed only for members of a shared team whose key is one
 * this app made for that team. The database and R2 are mocked.
 */

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  limit: vi.fn(),
  membership: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
  presignDownload: vi.fn(),
}));

vi.mock("@/db", () => ({
  getDb: () => ({ execute: mocks.execute, select: () => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }) }),
}));
vi.mock("./queries", () => ({ getTeamMembershipById: mocks.membership }));
vi.mock("@/lib/files/r2", () => ({
  r2ConfigFromEnv: () => ({ accountId: "a", bucket: "b", accessKeyId: "k", secretAccessKey: "s" }),
  putObject: mocks.putObject,
  deleteObject: mocks.deleteObject,
  presignDownload: mocks.presignDownload,
}));

const { removeTeamIcon, saveTeamIcon, signedTeamIconUrl } = await import("./team-icon");

const oldKey = "team-icons/team-1/7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a.png";
const newKeyPattern = /^team-icons\/team-1\/[0-9a-f-]{36}\.png$/;

function validPng(): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();
  const chunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...encoder.encode(type), ...data, 0, 0, 0, 0];
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunk("IHDR", [0, 0, 1, 0, 0, 0, 1, 0, 8, 6, 0, 0, 0]), ...chunk("IEND", [])]);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.putObject.mockResolvedValue(undefined);
  mocks.deleteObject.mockResolvedValue(undefined);
});

describe("saveTeamIcon", () => {
  it("should store the new icon, then delete the one it replaced", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: oldKey }] });
    await saveTeamIcon("team-1", validPng());
    expect(mocks.putObject).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(newKeyPattern), expect.any(Uint8Array), "image/png");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), oldKey);
  });

  it("should store nothing when the bytes are not a square PNG or WebP", async () => {
    await expect(saveTeamIcon("team-1", new TextEncoder().encode("<svg/>"))).rejects.toThrow("The icon must be a PNG or WebP image.");
    expect(mocks.putObject).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("should keep the new icon when deleting the old one fails, and log it", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: oldKey }] });
    mocks.deleteObject.mockRejectedValue(new Error("R2 down"));
    await expect(saveTeamIcon("team-1", validPng())).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith("[team-icon] Deleting the old icon failed", "Error");
  });

  it("should never delete a previous value that is not this team's icon key", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: "files/7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a/report.pdf" }] });
    await saveTeamIcon("team-1", validPng());
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("should delete the uploaded object and refuse when the team is personal", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    await expect(saveTeamIcon("team-1", validPng())).rejects.toThrow("Personal teams have no icon.");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(newKeyPattern));
  });

  it("should delete the uploaded object when the database refuses the change", async () => {
    mocks.execute.mockRejectedValue(new Error("db down"));
    await expect(saveTeamIcon("team-1", validPng())).rejects.toThrow("db down");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), expect.stringMatching(newKeyPattern));
  });
});

describe("removeTeamIcon", () => {
  it("should clear the key and delete the old object", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: oldKey }] });
    await removeTeamIcon("team-1");
    expect(mocks.deleteObject).toHaveBeenCalledWith(expect.anything(), oldKey);
  });

  it("should succeed without deleting anything when there was no icon", async () => {
    mocks.execute.mockResolvedValue({ rows: [{ previous: null }] });
    await removeTeamIcon("team-1");
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});

describe("signedTeamIconUrl", () => {
  it("should sign a link for a member of the team", async () => {
    mocks.membership.mockResolvedValue({ id: "team-1", personal: false });
    mocks.limit.mockResolvedValue([{ logo: oldKey }]);
    mocks.presignDownload.mockResolvedValue({ url: "https://r2.example.com/signed" });
    expect(await signedTeamIconUrl("user-1", "team-1")).toBe("https://r2.example.com/signed");
    expect(mocks.presignDownload).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: oldKey, contentType: "image/png" }));
  });

  it("should sign nothing for someone outside the team", async () => {
    mocks.membership.mockResolvedValue(null);
    mocks.limit.mockResolvedValue([{ logo: oldKey }]);
    expect(await signedTeamIconUrl("stranger", "team-1")).toBeNull();
    expect(mocks.presignDownload).not.toHaveBeenCalled();
  });

  it("should sign nothing when the stored key belongs to another team", async () => {
    mocks.membership.mockResolvedValue({ id: "team-1", personal: false });
    mocks.limit.mockResolvedValue([{ logo: "team-icons/team-2/7d2c0c9e-4a51-4f53-9a7e-0f1d1e2c3b4a.png" }]);
    expect(await signedTeamIconUrl("user-1", "team-1")).toBeNull();
    expect(mocks.presignDownload).not.toHaveBeenCalled();
  });

  it("should sign nothing for a personal team", async () => {
    mocks.membership.mockResolvedValue({ id: "team-1", personal: true });
    expect(await signedTeamIconUrl("user-1", "team-1")).toBeNull();
    expect(mocks.presignDownload).not.toHaveBeenCalled();
  });
});
