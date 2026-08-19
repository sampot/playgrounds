/** Vitest stub — real mp4box is a go-client runtime dependency. */
export function createFile() {
  return {
    onReady: null,
    onSegment: null,
    onError: null,
    appendBuffer() {},
    setSegmentOptions() {},
    initializeSegmentation() {
      return [];
    },
    start() {},
    flush() {},
  };
}

export default { createFile };
