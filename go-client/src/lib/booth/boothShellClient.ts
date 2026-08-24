import type {
  BoothStateSnapshot,
  BoothSubscribeScope,
} from "@pg/roster/boothChannel";
import type {
  BoothAck,
  BoothEngineEvent,
  BoothHubEngine,
  BoothIntent,
  BoothShellContext,
} from "./boothHubEngine";

export type BoothShellMode = "embedded" | "shell" | "operator";

export type BoothShellClient = {
  readonly mode: BoothShellMode;
  readonly shellId: string;
  subscribe(
    scopes: BoothSubscribeScope[],
    listener: (msg: BoothEngineEvent) => void
  ): () => void;
  getSnapshot(): BoothStateSnapshot | null;
  dispatch(intent: BoothIntent): Promise<BoothAck>;
  canDirect(): boolean;
  getDirector(): BoothShellContext["role"] | null;
};

const HOST_SHELL_ID = "embedded-host";

export function createBoothShellClient(opts: {
  engine: BoothHubEngine;
  mode: BoothShellMode;
  shellId?: string;
  role?: BoothShellContext["role"];
}): BoothShellClient {
  const shellId = opts.shellId ?? HOST_SHELL_ID;
  const role =
    opts.role ??
    (opts.mode === "operator" ? "operator" : "host");
  let latestSnapshot: BoothStateSnapshot | null = null;

  opts.engine.registerShell({ shellId, role });

  const unsub = opts.engine.subscribe(
    [
      "members",
      "cast",
      "inviteGate",
      "shareFiles",
      "privateFiles",
      "director",
      "engineHealth",
    ],
    (msg) => {
      if (msg.type === "booth.state.snapshot") {
        latestSnapshot = msg.snapshot;
      }
    }
  );

  return {
    mode: opts.mode,
    shellId,

    subscribe(scopes, listener) {
      return opts.engine.subscribe(scopes, listener);
    },

    getSnapshot() {
      return latestSnapshot;
    },

    dispatch(intent) {
      return opts.engine.dispatch(intent, { shellId, role });
    },

    canDirect() {
      const director = opts.engine.getDirector();
      if (director?.shellId === shellId) return true;
      if (role === "host" && !director) return true;
      return false;
    },

    getDirector() {
      const director = opts.engine.getDirector();
      if (!director || director.shellId !== shellId) {
        return role === "host" && !director ? "host" : null;
      }
      return director.role;
    },
  };
}

export function embeddedHostShellContext(): BoothShellContext {
  return { shellId: HOST_SHELL_ID, role: "host" };
}
