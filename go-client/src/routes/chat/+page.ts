import { redirect } from "@sveltejs/kit";

/** Legacy 聊天區 URL → 包廂. */
export const prerender = false;

export function load() {
  redirect(308, "/room");
}
