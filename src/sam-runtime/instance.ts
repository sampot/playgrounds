/**
 * SamInstance — one running SAM (Controller + Infrastructure) (DEC-024 / DEC-031).
 */

import { AgentRuntimeError } from "./errors.ts";
import type { AgentMessage } from "./message.ts";
import { parseSamHead, resolveSamMeta } from "./parseSamHead.ts";
import type { AgentRuntime } from "./runtime.ts";
import { SamScheduler } from "./scheduler.ts";
import { createDefaultFunctionsHandler } from "./defaultFunctionsHandler.ts";
import {
  CONTROLLER_ENTRY,
  FUNCTIONS_ENTRY,
  INDEX_ENTRY,
  type ControllerHandler,
  type FunctionsHandler,
  type LoadedEsmModule,
  type SamControllerMessage,
  type SamEnv,
  type SamEsmLoader,
  type SamExecutionContext,
  type SamFileMap,
  type SamHeadMeta,
  type ScheduleOptions,
} from "./types.ts";

export interface SamInstanceOptions {
  id: string;
  files: SamFileMap;
  /** Required: Node host uses loadEsmFromFileMap; browser supplies its own. */
  loadEsm: SamEsmLoader;
  /** Extra env bindings (KV, HOST, …). No INFRA — Controllers use bindings directly. */
  createEnv?: (instance: SamInstance) => SamEnv | Promise<SamEnv>;
}

export class SamInstance {
  readonly id: string;
  private files: SamFileMap;
  private createEnv?: SamInstanceOptions["createEnv"];
  private loadEsm: SamEsmLoader;
  private scheduler = new SamScheduler();
  private controllerMod: LoadedEsmModule<{
    default?: ControllerHandler;
  }> | null = null;
  private functionsMod: LoadedEsmModule<{ default?: FunctionsHandler }> | null =
    null;
  private controller: ControllerHandler | null = null;
  private functions: FunctionsHandler | null = null;
  private env: SamEnv = {};
  private _started = false;
  private paused = false;
  private meta: SamHeadMeta & { name?: string };
  private runtime: AgentRuntime | null = null;
  private agentId: string | null = null;
  /** Serialize all authoritative handler entry points. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(opts: SamInstanceOptions) {
    this.id = opts.id;
    this.files = { ...opts.files };
    this.createEnv = opts.createEnv;
    this.loadEsm = opts.loadEsm;
    const html = this.files[INDEX_ENTRY] ?? "";
    this.meta = resolveSamMeta(parseSamHead(html));
  }

  get started(): boolean {
    return this._started;
  }

  getMeta(): SamHeadMeta & { name?: string } {
    return { ...this.meta };
  }

  hasController(): boolean {
    return typeof this.files[CONTROLLER_ENTRY] === "string";
  }

  hasFunctions(): boolean {
    return typeof this.files[FUNCTIONS_ENTRY] === "string";
  }

  isPaused(): boolean {
    return this.paused;
  }

  attachRuntime(runtime: AgentRuntime, agentId: string): void {
    this.runtime = runtime;
    this.agentId = agentId;
  }

  detachRuntime(): void {
    this.runtime = null;
    this.agentId = null;
  }

  private runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  private makeCtx(): SamExecutionContext {
    const runtime = this.runtime;
    const agentId = this.agentId ?? this.id;
    return {
      waitUntil(promise) {
        // Must not touch authoritative state (KV/DB/mailbox). Best-effort only.
        void Promise.resolve(promise).catch(() => undefined);
      },
      schedule: (options: ScheduleOptions) => {
        if (runtime) {
          return runtime.schedule(agentId, options);
        }
        return this.scheduler.schedule(options, () => this.fireAlarm());
      },
      send: runtime
        ? options =>
            runtime.send({
              to: options.to,
              type: options.type,
              payload: options.payload,
              from: agentId,
              id: options.id,
              replyTo: options.replyTo,
            })
        : undefined,
      sendSelf: runtime
        ? options => runtime.sendSelf(agentId, options)
        : undefined,
    };
  }

  private async fireAlarm(): Promise<void> {
    if (!this.controller?.alarm || !this._started || this.paused) return;
    await this.runExclusive(async () => {
      if (!this.controller?.alarm || !this._started || this.paused) return;
      await this.controller.alarm(this.env, this.makeCtx());
    });
  }

  /** Host-side dispatch to functions.js (not exposed on Controller env). */
  private async dispatchFunctions(request: Request): Promise<Response> {
    if (!this.functions) {
      return new Response(
        JSON.stringify({
          error: "functions.js unavailable",
          code: "playgrounds_functions_unavailable",
        }),
        {
          status: 503,
          headers: { "content-type": "application/json; charset=utf-8" },
        }
      );
    }
    const ctx = this.makeCtx();
    return this.functions.fetch(request, this.env, ctx);
  }

  async start(): Promise<void> {
    if (this._started) return;

    if (this.hasFunctions()) {
      this.functionsMod = await this.loadEsm<{
        default?: FunctionsHandler;
      }>(this.files, FUNCTIONS_ENTRY);
      const h = this.functionsMod?.exports?.default;
      if (!h || typeof h.fetch !== "function") {
        await this.functionsMod?.dispose();
        this.functionsMod = null;
        throw new Error("functions.js 須 export default { fetch }");
      }
      this.functions = h;
    } else {
      // No SAM-supplied functions.js → host installs a default handler that
      // exposes the sandbox's intrinsic bindings (env.KV / env.DB / env.vars /
      // env.secrets.*) under the standard /api/* routes (PG-UI-SDK-SPEC §4).
      // The handler reads `env` lazily per request so it can be installed
      // before createEnv runs (env is assigned afterwards).
      this.functions = createDefaultFunctionsHandler(() => this.env);
    }

    if (this.hasController()) {
      this.controllerMod = await this.loadEsm<{
        default?: ControllerHandler;
      }>(this.files, CONTROLLER_ENTRY);
      const h = this.controllerMod?.exports?.default;
      if (!h || typeof h !== "object") {
        await this.controllerMod?.dispose();
        this.controllerMod = null;
        throw new Error("controller.js 須 export default { … }");
      }
      this.controller = h;
    }

    const base = this.createEnv ? await this.createEnv(this) : {};
    this.env = { ...base };

    this._started = true;
    this.paused = false;
    if (this.controller?.onStart) {
      await this.runExclusive(async () => {
        await this.controller!.onStart!(this.env, this.makeCtx());
      });
    }
  }

  async stop(): Promise<void> {
    if (!this._started) return;
    try {
      if (this.controller?.onStop) {
        await this.runExclusive(async () => {
          await this.controller!.onStop!(this.env, this.makeCtx());
        });
      }
    } finally {
      this.scheduler.dispose();
      await this.controllerMod?.dispose();
      await this.functionsMod?.dispose();
      this.controllerMod = null;
      this.functionsMod = null;
      this.controller = null;
      this.functions = null;
      this._started = false;
      this.paused = false;
    }
  }

  async pauseProcess(): Promise<void> {
    if (!this._started || this.paused) return;
    await this.runExclusive(async () => {
      if (this.controller?.onPause) {
        await this.controller.onPause(this.env, this.makeCtx());
      }
      this.paused = true;
    });
  }

  async resumeProcess(): Promise<void> {
    if (!this._started || !this.paused) return;
    await this.runExclusive(async () => {
      this.paused = false;
      if (this.controller?.onResume) {
        await this.controller.onResume(this.env, this.makeCtx());
      }
    });
  }

  /**
   * Dispatch a mailbox message (called by AgentRuntime drain).
   * Prefer onMessage; system.command falls back to onCommand; system.alarm → alarm().
   */
  async dispatchMessage(msg: AgentMessage): Promise<void> {
    if (!this._started) {
      throw new AgentRuntimeError("instance_not_started");
    }
    if (this.paused) {
      throw new Error("instance_paused");
    }
    await this.runExclusive(async () => {
      const envelope: SamControllerMessage = { ...msg };
      const ctx = this.makeCtx();

      if (msg.type === "system.alarm" && this.controller?.alarm) {
        await this.controller.alarm(this.env, ctx);
        return;
      }

      if (msg.type === "system.command") {
        if (this.controller?.onMessage) {
          await this.controller.onMessage(envelope, this.env, ctx);
          return;
        }
        if (this.controller?.onCommand) {
          await this.controller.onCommand(msg.payload, this.env, ctx);
          return;
        }
        throw new AgentRuntimeError("controller_no_onCommand");
      }

      if (this.controller?.onMessage) {
        await this.controller.onMessage(envelope, this.env, ctx);
        return;
      }
      // Transition: treat unknown types as onCommand payload if present.
      if (this.controller?.onCommand) {
        await this.controller.onCommand(msg.payload ?? msg, this.env, ctx);
        return;
      }
      throw new AgentRuntimeError("controller_no_onMessage");
    });
  }

  async command(command: unknown): Promise<unknown> {
    if (!this._started) throw new AgentRuntimeError("instance_not_started");
    if (this.paused) throw new Error("instance_paused");
    if (!this.controller?.onCommand) {
      throw new AgentRuntimeError("controller_no_onCommand");
    }
    // Direct path keeps sync return value for HOST/shell; mailbox uses send().
    return this.runExclusive(async () =>
      this.controller!.onCommand!(command, this.env, this.makeCtx())
    );
  }

  async fetch(request: Request): Promise<Response> {
    if (!this._started) {
      return new Response(JSON.stringify({ error: "not started" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    if (this.controller?.fetch) {
      return this.runExclusive(async () =>
        this.controller!.fetch!(request, this.env, this.makeCtx())
      );
    }
    // No Controller.fetch → host may hit functions.js directly (UI path equivalent).
    return this.dispatchFunctions(request);
  }

  /**
   * Shell／headless host entry to this instance's functions.js.
   * Not an env binding — Controllers must not call functions via INFRA.
   */
  async functionsFetch(request: Request): Promise<Response> {
    if (!this._started) {
      return new Response(JSON.stringify({ error: "not started" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    }
    return this.dispatchFunctions(request);
  }

  /** @deprecated Prefer functionsFetch — same host-side functions entry. */
  async infraFetch(request: Request): Promise<Response> {
    return this.functionsFetch(request);
  }
}
