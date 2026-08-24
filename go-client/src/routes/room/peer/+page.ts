/** @type {import('./$types').PageLoad} */
export function load({ url }) {
  const peerCap =
    url.searchParams.get("peerCap")?.trim() ||
    url.searchParams.get("cap")?.trim() ||
    "";
  const hubSessionId = url.searchParams.get("hub")?.trim() ?? "";
  const hubUrl = url.searchParams.get("hubUrl")?.trim() ?? "";
  const label = url.searchParams.get("label")?.trim() ?? "";
  return { peerCap, hubSessionId, hubUrl, label };
}
