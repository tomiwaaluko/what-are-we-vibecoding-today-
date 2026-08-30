import { describe, expect, it } from "vitest";
import { identityFromAppName } from "../identity.js";

describe("identityFromAppName", () => {
  it("maps Cursor vs Visual Studio Code", () => {
    expect(identityFromAppName("Cursor")).toBe("cursor");
    expect(identityFromAppName("Visual Studio Code")).toBe("vscode");
  });
});
