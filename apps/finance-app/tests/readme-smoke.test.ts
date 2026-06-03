import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("README", () => {
  it("documents local setup, env, import, and export", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("npm install");
    expect(readme).toContain("DATABASE_URL");
    expect(readme).toContain("/api/import/current");
    expect(readme).toContain("/api/export/snapshot");
    expect(readme).toContain("/api/export/google-sheets");
  });
});
