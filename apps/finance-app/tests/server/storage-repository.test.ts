import { describe, expect, it, vi } from "vitest";
import { createStorageRepository } from "@/server/repositories/storage-repository";

describe("createStorageRepository", () => {
  it("orders storage places by domain attention priority", async () => {
    const db = {
      storagePlace: {
        findMany: vi.fn().mockResolvedValue([
          { name: "Low", attentionPriority: "low" },
          { name: "Medium", attentionPriority: "medium" },
          { name: "Urgent", attentionPriority: "urgent" },
          { name: "High", attentionPriority: "high" }
        ]),
        findFirst: vi.fn()
      }
    };

    const repository = createStorageRepository(db as never);
    const rows = await repository.listByOwner("owner-1");

    expect(db.storagePlace.findMany).toHaveBeenCalledWith({
      where: { ownerId: "owner-1" },
      orderBy: [{ attentionPriority: "desc" }, { name: "asc" }]
    });
    expect(rows.map((row) => row.name)).toEqual(["Urgent", "High", "Medium", "Low"]);
  });
});
