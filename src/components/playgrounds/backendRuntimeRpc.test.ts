import { describe, expect, it } from "vitest";
import {
  RUNTIME_LOCAL_HOST_METHODS,
  createCachedSecretsNamespace,
  createRpcDelegateBinding,
  createRpcDelegateBindingWithGrant,
  createRpcSessionBinding,
  createSplitHostBinding,
} from "./backendRuntimeRpc";
import { isHostLocalMethod } from "./hostMethodSurface";

describe("createCachedSecretsNamespace (DEC-038 §6.3-A)", () => {
  it("get reads from memory cache without external RPC", async () => {
    const material = new Map([["API_KEY", "secret-value"]]);
    const secrets = createCachedSecretsNamespace(() => material);
    const binding = secrets.API_KEY as { get: () => Promise<string> };
    expect(await binding.get()).toBe("secret-value");
    expect(await binding.get()).toBe("secret-value");
  });

  it("get throws secret_locked when cache empty", async () => {
    const secrets = createCachedSecretsNamespace(() => new Map());
    const binding = secrets.API_KEY as { get: () => Promise<string> };
    await expect(binding.get()).rejects.toMatchObject({
      message: "secret_locked",
    });
  });

  it("get throws secret_not_found when other secrets exist", async () => {
    const material = new Map([["OTHER", "x"]]);
    const secrets = createCachedSecretsNamespace(() => material);
    const binding = secrets.API_KEY as { get: () => Promise<string> };
    await expect(binding.get()).rejects.toMatchObject({
      message: "secret_not_found",
    });
  });
});

describe("RUNTIME_LOCAL_HOST_METHODS", () => {
  it("every runtime-local method is also classified HOST local", () => {
    for (const m of RUNTIME_LOCAL_HOST_METHODS) {
      expect(isHostLocalMethod(m), m).toBe(true);
    }
  });
});

describe("createSplitHostBinding", () => {
  it("serves readFile／listFiles from snapshot without RPC", async () => {
    const rpcCalls: string[] = [];
    const host = createSplitHostBinding(
      async (binding, method) => {
        rpcCalls.push(`${binding}.${method}`);
        return null;
      },
      {
        "a.md": "hello",
        "b.txt": "world",
      }
    );
    const readFile = host.readFile as (
      path: string
    ) => Promise<{ content: string; path: string }>;
    const listFiles = host.listFiles as () => Promise<string[]>;
    const out = await readFile("a.md");
    expect(out.content).toBe("hello");
    expect(await listFiles()).toEqual(["a.md", "b.txt"]);
    expect(rpcCalls).toEqual([]);
  });

  it("readFile rejects missing／binary without RPC", async () => {
    const rpcCalls: string[] = [];
    const host = createSplitHostBinding(
      async (binding, method) => {
        rpcCalls.push(`${binding}.${method}`);
        return null;
      },
      {
        "bin.dat": new Uint8Array([1, 2, 3]),
      }
    );
    const readFile = host.readFile as (path: string) => Promise<unknown>;
    await expect(readFile("missing.md")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(readFile("bin.dat")).rejects.toMatchObject({ code: "binary" });
    expect(rpcCalls).toEqual([]);
  });

  it("readFileBase64 serves binary from snapshot without RPC", async () => {
    const rpcCalls: string[] = [];
    const host = createSplitHostBinding(
      async (binding, method) => {
        rpcCalls.push(`${binding}.${method}`);
        return null;
      },
      { "bin.dat": new Uint8Array([1, 2]) }
    );
    const readFileBase64 = host.readFileBase64 as (
      path: string
    ) => Promise<{ byteLength: number; base64: string }>;
    const out = await readFileBase64("bin.dat");
    expect(out.byteLength).toBe(2);
    expect(out.base64).toBeTruthy();
    expect(rpcCalls).toEqual([]);
  });

  it("writeFile persists locally without RPC when persistLocalWrites", async () => {
    const rpcCalls: string[] = [];
    const files: Record<string, string> = { "a.md": "old" };
    const host = createSplitHostBinding(
      async (binding, method) => {
        rpcCalls.push(`${binding}.${method}`);
        return null;
      },
      files,
      {
        sandboxId: "sbx",
        persistLocalWrites: true,
      }
    );
    expect(typeof host.writeFile).toBe("function");
    expect(rpcCalls).toEqual([]);
    const writeFile = host.writeFile as (
      path: string,
      content: string
    ) => Promise<unknown>;
    await expect(writeFile("a.md", "new")).rejects.toBeTruthy();
    expect(rpcCalls).toEqual([]);
  });

  it("without persistLocalWrites, writeFile RPCs", async () => {
    const rpcCalls: string[] = [];
    const host = createSplitHostBinding(
      async (binding, method) => {
        rpcCalls.push(`${binding}.${method}`);
        return { path: "a.md", hash: "x" };
      },
      { "a.md": "old" }
    );
    const writeFile = host.writeFile as (
      path: string,
      content: string
    ) => Promise<unknown>;
    await writeFile("a.md", "new");
    expect(rpcCalls).toEqual(["HOST.writeFile"]);
  });

  it("RPCs shell-face openFile", async () => {
    const rpcCalls: string[] = [];
    const host = createSplitHostBinding(
      async (binding, method, args) => {
        rpcCalls.push(`${binding}.${method}`);
        return { path: args[0], sandboxId: "w" };
      },
      { "a.md": "x" }
    );
    const openFile = host.openFile as (path: string) => Promise<unknown>;
    await openFile("a.md");
    expect(rpcCalls).toEqual(["HOST.openFile"]);
  });

  it("delegate／session bindings always RPC", async () => {
    const calls: string[] = [];
    const rpc = async (b: string, m: string) => {
      calls.push(`${b}.${m}`);
      return null;
    };
    const d = createRpcDelegateBinding(rpc as never);
    const s = createRpcSessionBinding(rpc as never);
    await (d.invoke as (x: unknown) => Promise<unknown>)({});
    await (s.send as (x: unknown) => Promise<unknown>)({});
    expect(calls).toEqual(["DELEGATE.invoke", "SESSION.send"]);
  });

  it("delegate with grant exposes local DB／getGrant without RPC", async () => {
    const calls: string[] = [];
    const rpc = async (b: string, m: string) => {
      calls.push(`${b}.${m}`);
      return null;
    };
    const fakeDb = { prepare: () => ({}) };
    const d = createRpcDelegateBindingWithGrant(
      rpc as never,
      {
        hostSandboxId: "work",
        paths: [".bindings/db"],
        mode: "readwrite",
        focusPath: ".bindings/db",
      },
      { DB: fakeDb }
    );
    expect(d.DB).toBe(fakeDb);
    expect(d.KV).toBeUndefined();
    const grant = await (
      d.getGrant as () => Promise<{
        hostSandboxId: string;
        paths: string[];
      }>
    )();
    expect(grant.hostSandboxId).toBe("work");
    expect(grant.paths).toEqual([".bindings/db"]);
    await (d.close as () => Promise<unknown>)();
    expect(calls).toEqual(["DELEGATE.close"]);
  });
});
