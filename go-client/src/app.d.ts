// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {}
}

interface ImportMetaEnv {
  /** Injected by go-client/vite.config.ts at build／dev start. */
  readonly GO_BUILD_ISO: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
