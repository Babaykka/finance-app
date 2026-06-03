import { describe, expect, it } from "vitest";
import { buildDashboardSummary } from "@/server/services/dashboard-service";

describe("dashboard route summary shape", () => {
  it("returns an empty dashboard shape for empty inputs", () => {
    expect(buildDashboardSummary({ storagePlaces: [], debts: [], drafts: [] })).toEqual({
      assets: {},
      attentionStorage: [],
      upcomingDebts: [],
      pendingDraftCount: 0
    });
  });
});
