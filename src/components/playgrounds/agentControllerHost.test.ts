import { describe, expect, it } from "vitest";
import { CONTROLLER_ENTRY } from "../../sam-runtime/index.ts";
import { createAgentBaseStarterFiles } from "./agentBaseStarter";
import {
  agentFilesHaveController,
  fileMapNeedsAgentController,
} from "./agentControllerHost";
import { createStarterFiles } from "./projectTypes";

describe("agentControllerHost helpers", () => {
  it("detects controller.js on Agent base starter", () => {
    const files = createAgentBaseStarterFiles();
    expect(files[CONTROLLER_ENTRY]).toBeTruthy();
    expect(agentFilesHaveController(files)).toBe(true);
    expect(agentFilesHaveController({ "index.html": "<html></html>" })).toBe(
      false
    );
  });

  it("treats Agent base starter as needing Agent-form Controller", () => {
    const files = createAgentBaseStarterFiles();
    expect(fileMapNeedsAgentController(files)).toBe(true);
    expect(fileMapNeedsAgentController(createStarterFiles())).toBe(false);
  });

  it("honours explicit sam:needs-controller false", () => {
    expect(
      fileMapNeedsAgentController({
        "index.html": `<!doctype html><html><head>
          <meta name="sam:needs-controller" content="false" />
        </head><body></body></html>`,
        "controller.js": "export default {}",
      })
    ).toBe(false);
  });
});
