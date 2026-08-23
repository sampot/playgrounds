import { describe, expect, it, vi } from "vitest";
import {
  createBoothOwnerFileClient,
  createBoothOwnerFileHost,
} from "./boothOwnerFileChannel";

function hostDeps(overrides: Partial<Parameters<typeof createBoothOwnerFileHost>[0]> = {}) {
  return {
    newPrivateId: () => "pvt_test",
    importPrivateFile: async () => ({ ok: true as const }),
    importShareFile: async () => ({ ok: true as const }),
    exportPrivateFile: async () => null,
    exportShareFile: async () => null,
    send: vi.fn(),
    ...overrides,
  };
}

describe("boothOwnerFileChannel", () => {
  it("uploads a private file to the hub host over chunk messages", async () => {
    const imported: File[] = [];
    const hostOut: string[] = [];
    const clientOut: string[] = [];

    const host = createBoothOwnerFileHost(
      hostDeps({
        importPrivateFile: async (file) => {
          imported.push(file);
          return { ok: true };
        },
        send: (text) => hostOut.push(text),
      })
    );

    const client = createBoothOwnerFileClient({
      send: (text) => {
        clientOut.push(text);
        host.handleMessage(text);
      },
    });

    const { transferId } = host.beginPrivateUpload({
      name: "clip.mp4",
      size: 5,
      mime: "video/mp4",
    });

    const file = new File([new Uint8Array([9, 8, 7, 6, 5])], "clip.mp4", {
      type: "video/mp4",
    });
    await client.upload(transferId, file);

    expect(imported).toHaveLength(1);
    expect(imported[0]?.name).toBe("clip.mp4");
    const buf = new Uint8Array(await imported[0]!.arrayBuffer());
    expect(buf).toEqual(new Uint8Array([9, 8, 7, 6, 5]));
    expect(clientOut.length).toBeGreaterThan(0);
  });

  it("uploads a share file to the hub host over chunk messages", async () => {
    const imported: File[] = [];

    const host = createBoothOwnerFileHost(
      hostDeps({
        importShareFile: async (file) => {
          imported.push(file);
          return { ok: true, id: "share-1" };
        },
        send: () => {},
      })
    );

    const client = createBoothOwnerFileClient({
      send: (text) => host.handleMessage(text),
    });

    const { transferId } = host.beginShareUpload({
      name: "notes.pdf",
      size: 3,
      mime: "application/pdf",
    });

    const file = new File([new Uint8Array([1, 2, 3])], "notes.pdf", {
      type: "application/pdf",
    });
    await client.upload(transferId, file);

    expect(imported).toHaveLength(1);
    expect(imported[0]?.name).toBe("notes.pdf");
  });

  it("downloads a private file from the hub host", async () => {
    const client = createBoothOwnerFileClient({
      send: () => {},
    });
    const host = createBoothOwnerFileHost(
      hostDeps({
        exportPrivateFile: async () =>
          new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }),
        send: (text) => client.handleMessage(text),
      })
    );

    const { transferId } = await host.preparePrivateDownload("pvt_x");
    const blobPromise = client.receive(transferId);
    await host.streamDownload(transferId);
    const blob = await blobPromise;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );
  });

  it("downloads a share file from the hub host", async () => {
    const client = createBoothOwnerFileClient({
      send: () => {},
    });
    const host = createBoothOwnerFileHost(
      hostDeps({
        exportShareFile: async () =>
          new File([new Uint8Array([4, 5])], "b.mp3", { type: "audio/mpeg" }),
        send: (text) => client.handleMessage(text),
      })
    );

    const { transferId } = await host.prepareShareDownload("share-9");
    const blobPromise = client.receive(transferId);
    await host.streamDownload(transferId);
    const blob = await blobPromise;
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([4, 5])
    );
  });
});
