import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMany = vi.fn();
const findFirstOrThrow = vi.fn();
const getLocalOwner = vi.fn();

vi.mock("@/server/db", () => ({
  prisma: {
    aiDraft: {
      updateMany,
      findFirstOrThrow
    }
  }
}));

vi.mock("@/server/auth/local-owner", () => ({
  getLocalOwner
}));

describe("ai-drafts reject route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getLocalOwner.mockResolvedValue({ id: "owner-1", telegramUserId: "123" });
  });

  it("rejects only pending or needs_clarification drafts", async () => {
    const { POST } = await import("@/app/api/ai-drafts/[id]/reject/route");
    updateMany.mockResolvedValue({ count: 1 });
    findFirstOrThrow.mockResolvedValue({ id: "draft-1", status: "rejected" });

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "draft-1" })
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "draft-1",
        ownerId: "owner-1",
        status: { in: ["pending", "needs_clarification"] }
      },
      data: { status: "rejected" }
    });
    expect(response.status).toBe(200);
  });

  it("returns 404 when the draft is missing or no longer rejectable", async () => {
    const { POST } = await import("@/app/api/ai-drafts/[id]/reject/route");
    updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: "draft-2" })
    });

    expect(response.status).toBe(404);
    expect(findFirstOrThrow).not.toHaveBeenCalled();
  });
});
