import { describe, expect, it } from "vitest";
import {
  AGENT_BASE_STARTER_NAME,
  createAgentBaseStarterFiles,
} from "./agentBaseStarter";

describe("createAgentBaseStarterFiles", () => {
  it("is a minimal Agent with Controller and no LLM BYOK UI", () => {
    const files = createAgentBaseStarterFiles();
    expect(AGENT_BASE_STARTER_NAME).toBe("Agent");
    expect(files["index.html"]).toContain("<title>Agent</title>");
    expect(files["index.html"]).toContain("sam:needs-controller");
    expect(files["index.html"]).toContain("一般 Agent 範本");
    expect(files["index.html"]).not.toContain('id="settings"');
    expect(files["index.html"]).not.toContain('type="password"');
    expect(files["controller.js"]).toContain("onStart");
    expect(files["controller.js"]).toContain("alarm");
    expect(files["controller.js"]).toContain("agent:running");
    expect(files["controller.js"]).not.toContain("chat/completions");
    expect(files["functions.js"]).toContain("/api/status");
    expect(files["functions.js"]).toContain("/api/control");
    expect(files["app.js"]).toContain("/api/status");
    expect(files["README.md"]).toContain("一般 Agent");
    expect(files["README.md"]).toContain("不必");
    expect(files["README.md"]).toContain("總管");
    expect(files["README.md"]).toContain("工具 SAM");
    expect(files["README.md"]).toContain("sam:needs-controller");
    expect(files["functions.js"]).toContain("不必設為總管");
    expect(files["functions.js"]).not.toContain("需此沙盒為總管");
  });
});
