/** One-shot `pg-boothd login` command shown in dash after minting a device token. */
export function formatBoothDeviceLoginCommand(opts: {
  deviceToken: string;
  ownerUserId: string;
}): string {
  const token = opts.deviceToken.trim();
  const owner = opts.ownerUserId.trim();
  if (!token) throw new Error("device_token_required");
  if (!owner) throw new Error("owner_user_id_required");
  return `pg-boothd login --device-token ${token} --owner ${owner}`;
}
