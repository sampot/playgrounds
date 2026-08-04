/**
 * Shell-side proxy for a Controller SamInstance running in Backend Runtime Worker.
 * AgentRuntime on the main thread drains mailbox and calls into this proxy.
 */

import type { AgentMessage } from "../../sam-runtime/message.ts";
import type { AgentRuntime } from "../../sam-runtime/runtime.ts";
import type { SamInstance } from "../../sam-runtime/instance.ts";
import type { SamHeadMeta } from "../../sam-runtime/types.ts";
import type { FileMap } from "./projectTypes";
import {
  backendControllerAttach,
  backendControllerCommand,
  backendControllerDetach,
  backendControllerDispatch,
  backendControllerPause,
  backendControllerResume,
  backendControllerSyncFiles,
} from "./backendHost";

export class RemoteSamInstance {
  readonly id: string;
  private meta: SamHeadMeta & { name?: string };
  private _started = false;
  private paused = false;
  private runtime: AgentRuntime | null = null;
  private agentId: string | null = null;
  private withHost: boolean;
  private activeAgentSandboxId: string | null;
  private files: FileMap;

  constructor(opts: {
    id: string;
    files: FileMap;
    withHost: boolean;
    activeAgentSandboxId: string | null;
    meta?: SamHeadMeta & { name?: string };
  }) {
    this.id = opts.id;
    this.files = opts.files;
    this.withHost = opts.withHost;
    this.activeAgentSandboxId = opts.activeAgentSandboxId;
    this.meta = opts.meta ?? { name: opts.id };
  }

  get started(): boolean {
    return this._started;
  }

  getMeta(): SamHeadMeta & { name?: string } {
    return { ...this.meta };
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

  async start(): Promise<void> {
    if (this._started) return;
    const out = await backendControllerAttach({
      sandboxId: this.id,
      files: this.files,
      withHost: this.withHost,
      activeAgentSandboxId: this.activeAgentSandboxId,
    });
    if (out.meta) this.meta = { ...this.meta, ...out.meta };
    this._started = true;
    this.paused = false;
  }

  async stop(): Promise<void> {
    if (!this._started) return;
    try {
      await backendControllerDetach(this.id);
    } finally {
      this._started = false;
      this.paused = false;
    }
  }

  async dispatchMessage(msg: AgentMessage): Promise<void> {
    await backendControllerDispatch(this.id, msg);
  }

  async command(command: unknown): Promise<unknown> {
    return backendControllerCommand(this.id, command);
  }

  async pauseProcess(): Promise<void> {
    await backendControllerPause(this.id);
    this.paused = true;
  }

  async resumeProcess(): Promise<void> {
    await backendControllerResume(this.id);
    this.paused = false;
  }

  async syncFiles(files: FileMap): Promise<void> {
    this.files = files;
    if (this._started) {
      await backendControllerSyncFiles(this.id, files);
    }
  }

  /** Cast helper for AgentRuntime.attach which expects SamInstance. */
  asSamInstance(): SamInstance {
    return this as unknown as SamInstance;
  }
}
