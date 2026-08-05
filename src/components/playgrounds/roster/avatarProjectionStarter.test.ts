import { describe, expect, it } from "vitest";
import {
  AVATAR_PROJECTION_STARTER_TITLE,
  ROSTER_AVATAR_BRIDGE,
  createAvatarProjectionStarterFiles,
} from "./avatarProjectionStarter";

describe("createAvatarProjectionStarterFiles", () => {
  it("builds UI-only projection with bridge + peer identity", () => {
    const files = createAvatarProjectionStarterFiles({
      peerAgentId: "peer-1",
      name: "Alice",
      identiconUrl: "data:image/png;base64,xx",
    });
    expect(files["index.html"]).toContain("Alice");
    expect(files["index.html"]).toContain("./app.js");
    expect(files["styles.css"]).toBeTruthy();
    expect(files["app.js"]).toContain(ROSTER_AVATAR_BRIDGE);
    expect(files["app.js"]).toContain("peer-1");
    expect(files["app.js"]).toContain("打招呼");
    expect(files["controller.js"]).toBeUndefined();
    expect(AVATAR_PROJECTION_STARTER_TITLE).toBeTruthy();
  });
});
