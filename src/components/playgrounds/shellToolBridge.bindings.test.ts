/**
 * Shell DELEGATE bridge: DB／KV exposure from grant (DEC-037).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createShellToolBridge } from "./shellToolBridge";
import {
  BINDINGS_DB_PATH,
  BINDINGS_KV_PATH,
  normalizeToolSession,
  type ToolSession,
} from "./toolGrant";

describe("createShellToolBridge bindings", () => {
  let session: ToolSession | null;

  beforeEach(() => {
    session = null;
  });

  function bridge() {
    return createShellToolBridge({
      getSessionFor: () => session,
      getSession: () => session,
      getActiveId: () => "host-1",
      getActiveAgentId: () => "agent-1",
      getHostFiles: () => ({ "src/a.js": "ok" }),
      patchHostFile: async () => {},
      closeToolSession: async () => {
        session = null;
      },
    });
  }

  it("exposes DB only when .bindings/db granted", async () => {
    session = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: [BINDINGS_DB_PATH],
      mode: "readwrite",
    });
    const b = bridge();
    expect(b.DB).toBeDefined();
    expect(b.KV).toBeUndefined();
    const caps = await b.capabilities();
    expect(caps).toContain("db");
    expect(caps).not.toContain("kv");
  });

  it("exposes KV and rejects put when read-only", async () => {
    session = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: [BINDINGS_KV_PATH],
      mode: "read",
    });
    const b = bridge();
    expect(b.KV).toBeDefined();
    await expect(b.KV!.put("k", "v")).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("rejects reading virtual path as file", async () => {
    session = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: [BINDINGS_DB_PATH],
      mode: "read",
    });
    const b = bridge();
    await expect(b.readFile(BINDINGS_DB_PATH)).rejects.toMatchObject({
      code: "bindings_virtual_not_file",
    });
  });

  it("still reads OPFS under grant", async () => {
    session = normalizeToolSession({
      toolSandboxId: "tool-1",
      hostSandboxId: "host-1",
      paths: ["src"],
      mode: "read",
    });
    const b = bridge();
    const r = await b.readFile("src/a.js");
    expect(r.content).toBe("ok");
    expect(b.DB).toBeUndefined();
  });
});
