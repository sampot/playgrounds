/** Dev-only WebRTC file-transfer harness — Guest fetches via SW only. */
export const prerender = true;
/** Override root `ssr = false` so prerender HTML includes title／body (not an empty kit shell). */
export const ssr = true;
