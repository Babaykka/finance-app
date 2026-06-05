import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";

describe("health route", () => {
  const originalRenderCommit = process.env.RENDER_GIT_COMMIT;

  afterEach(() => {
    if (originalRenderCommit === undefined) {
      delete process.env.RENDER_GIT_COMMIT;
    } else {
      process.env.RENDER_GIT_COMMIT = originalRenderCommit;
    }
  });

  it("includes the deployed commit when Render provides it", async () => {
    process.env.RENDER_GIT_COMMIT = "abc123";

    const response = GET();

    await expect(response.json()).resolves.toEqual({
      ok: true,
      commit: "abc123"
    });
  });

  it("uses null commit when deployment metadata is not available", async () => {
    delete process.env.RENDER_GIT_COMMIT;

    const response = GET();

    await expect(response.json()).resolves.toEqual({
      ok: true,
      commit: null
    });
  });
});
