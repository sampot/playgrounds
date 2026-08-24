/** @type {import('./$types').PageLoad} */
export function load({ url }) {
  const peerCap =
    url.searchParams.get("peerCap")?.trim() ||
    url.searchParams.get("cap")?.trim() ||
    "";
  const hubSessionId = url.searchParams.get("hub")?.trim() ?? "";
  const label = url.searchParams.get("label")?.trim() ?? "";
  return { peerCap, hubSessionId, label };
}
