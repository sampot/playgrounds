/**
 * Download / multi-file fetch progress for open-from-URL and similar transfers.
 */

export type ByteProgress = {
  loaded: number;
  /** Null when Content-Length is missing. */
  total: number | null;
  /** 0..1 when total known; otherwise null (indeterminate). */
  ratio: number | null;
};

export type FileListProgress = {
  done: number;
  total: number;
  ratio: number;
  path?: string;
};

export type OpenTransferProgress = {
  /** 0..1 when known; null = indeterminate bar. */
  ratio: number | null;
  /** Optional detail for a11y / status (e.g. "3/12"). */
  detail?: string;
};

function mergeChunks(chunks: Uint8Array[], totalLength: number): Uint8Array {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Read a fetch Response body with optional byte progress.
 * Falls back to arrayBuffer when body streaming is unavailable.
 */
export async function readResponseBytes(
  response: Response,
  options?: {
    signal?: AbortSignal;
    onProgress?: (p: ByteProgress) => void;
    maxBytes?: number;
  }
): Promise<Uint8Array> {
  const report = (loaded: number, total: number | null) => {
    options?.onProgress?.({
      loaded,
      total,
      ratio: total != null && total > 0 ? Math.min(1, loaded / total) : null,
    });
  };

  const lengthHeader = response.headers.get("content-length");
  const parsedTotal = lengthHeader ? Number(lengthHeader) : NaN;
  const total =
    Number.isFinite(parsedTotal) && parsedTotal >= 0 ? parsedTotal : null;

  if (total != null && options?.maxBytes != null && total > options.maxBytes) {
    throw new Error(
      `下載超過上限（>${Math.round(options.maxBytes / (1024 * 1024))}MB）`
    );
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await response.arrayBuffer());
    if (options?.maxBytes != null && buf.byteLength > options.maxBytes) {
      throw new Error(
        `下載超過上限（>${Math.round(options.maxBytes / (1024 * 1024))}MB）`
      );
    }
    report(buf.byteLength, buf.byteLength);
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  report(0, total);

  try {
    for (;;) {
      if (options?.signal?.aborted) {
        await reader.cancel().catch(() => undefined);
        throw new Error("已取消下載");
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      chunks.push(value);
      loaded += value.byteLength;
      if (options?.maxBytes != null && loaded > options.maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new Error(
          `下載超過上限（>${Math.round(options.maxBytes / (1024 * 1024))}MB）`
        );
      }
      report(loaded, total);
    }
  } catch (e) {
    if (options?.signal?.aborted) throw new Error("已取消下載");
    throw e;
  }

  const buf = mergeChunks(chunks, loaded);
  report(buf.byteLength, total ?? buf.byteLength);
  return buf;
}

export function fileListToOpenProgress(p: FileListProgress): OpenTransferProgress {
  return {
    ratio: p.ratio,
    detail: `${p.done}/${p.total}`,
  };
}

export function byteToOpenProgress(p: ByteProgress): OpenTransferProgress {
  if (p.ratio != null) {
    return {
      ratio: p.ratio,
      detail: `${Math.round(p.ratio * 100)}%`,
    };
  }
  if (p.loaded > 0) {
    const kb = Math.round(p.loaded / 1024);
    return { ratio: null, detail: `${kb} KB` };
  }
  return { ratio: null };
}
