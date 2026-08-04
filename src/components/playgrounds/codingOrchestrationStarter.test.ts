import { describe, expect, it } from "vitest";
import {
  CODING_ORCH_DEMO_PATH,
  CODING_ORCH_JOIN_POLICY,
  CODING_ORCH_PROTOCOL_ID,
} from "./codingOrchestrationApi";
import {
  CODING_ORCH_HOST_STARTER_NAME,
  createCodingOrchestrationHostStarterFiles,
} from "./codingOrchestrationHostStarter";
import {
  CODING_ORCH_WORKER_STARTER_NAME,
  createCodingOrchestrationWorkerStarterFiles,
} from "./codingOrchestrationWorkerStarter";

describe("coding orchestration starters", () => {
  it("host starter declares invite_only protocol and demo file", () => {
    const files = createCodingOrchestrationHostStarterFiles();
    expect(CODING_ORCH_HOST_STARTER_NAME).toBeTruthy();
    expect(files[CODING_ORCH_DEMO_PATH]).toContain("off-by-one");
    expect(files["functions.js"]).toContain(CODING_ORCH_PROTOCOL_ID);
    expect(files["functions.js"]).toContain(CODING_ORCH_JOIN_POLICY);
    expect(files["functions.js"]).toContain("task.progress");
    expect(files["functions.js"]).toContain("task.failed");
    expect(files["functions.js"]).toContain("task.clarify");
    expect(files["app.js"]).toContain("spawn-participant");
  });

  it("worker starter uses SESSION + optional DELEGATE with BYOK LLM path", () => {
    const files = createCodingOrchestrationWorkerStarterFiles();
    expect(CODING_ORCH_WORKER_STARTER_NAME).toContain("LLM");
    expect(files["app.js"]).toContain("task.assigned");
    expect(files["app.js"]).toContain("task.result");
    expect(files["app.js"]).toContain("/api/llm/chat");
    expect(files["app.js"]).toContain("applyEditsViaDelegate");
    expect(files["functions.js"]).toContain("SESSION");
    expect(files["functions.js"]).toContain("DELEGATE");
    expect(files["functions.js"]).toContain("/api/delegate/file");
    expect(files["functions.js"]).toContain("/api/llm/chat");
    expect(files["controller.js"]).toContain("export default");
    expect(files["controller.js"]).toContain("onMessage");
  });
});
