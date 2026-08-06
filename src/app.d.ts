/// <reference types="@sveltejs/kit" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PUBLIC_PLAYGROUNDS_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __PLAYGROUNDS_BUILT_AT__: string | undefined;
