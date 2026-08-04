/**
 * Pinned WASI CLI assets for Playgrounds Shell / HOST.runCmd (DEC-021).
 *
 * - `jq.wasm`: jaq-based WASI CLI (jq-compatible subset); local wasip1 build.
 * - `cowsay.wasm`: wapm-packages/cowsay (MIT; rust-cowsay fork) wasip1;
 *   `cowthink` shares the same Module (argv0 selects mode).
 * - `grep.wasm` / `sed.wasm` / `find.wasm` / `diffutils.wasm`: uutils
 *   playground wasip1 standalones (https://uutils.org/wasm/).
 * - `awk.wasm`: benhoyt/goawk v1.31.0 built with GOOS=wasip1 GOARCH=wasm.
 * - `coreutils.wasm`: official uutils 0.9.0 wasip1 multicall
 *   (https://github.com/uutils/coreutils/releases); argv0 = util name.
 *
 * Note: `xargs` is a JS host command (not WASI) — browser WASI cannot spawn.
 * Asset URLs stay under `/playgrounds/wasi/` in both blog and standalone deploys.
 */

import { playgroundsWasiUrl } from "./playgroundsPaths";

export const WASI_JQ_VERSION = "jaq-wasi-0.1.0";

/** Served from `public/playgrounds/wasi/jq.wasm`. */
export const WASI_JQ_WASM_URL = playgroundsWasiUrl("jq.wasm");

/** SHA-256 of the vendored binary (hex). */
export const WASI_JQ_WASM_SHA256 =
  "0957453c7269a62738f0b00b4c93e9783224511d5b021dfe71bf2c807623e346";

/** wapm-packages/cowsay @ 907f671; wasm32-wasip1 release build. */
export const WASI_COWSAY_VERSION = "wapm-cowsay-0.1.0+907f671";

/** Served from `public/playgrounds/wasi/cowsay.wasm`. */
export const WASI_COWSAY_WASM_URL = playgroundsWasiUrl("cowsay.wasm");

/** SHA-256 of the vendored cowsay binary (hex). */
export const WASI_COWSAY_WASM_SHA256 =
  "dfee5f08c4dda57263dbc4c5dbe8c9a39a21b4def700a79cdebfba11f8d1e8f2";

/** uutils.org/wasm standalones fetched 2026-08-01. */
export const WASI_UUTILS_EXTRA_VERSION = "uutils-playground-2026-08-01";

export const WASI_GREP_WASM_URL = playgroundsWasiUrl("grep.wasm");
export const WASI_GREP_WASM_SHA256 =
  "d95f7744e4bff4f3bbea4ba7f7bda3d4d1fa059a6d2896ec4a7eb435e998f843";

export const WASI_SED_WASM_URL = playgroundsWasiUrl("sed.wasm");
export const WASI_SED_WASM_SHA256 =
  "9a233c788dc34a36adead4db6c38633fa73fa6dfa3ddb90a2e9507ffcc02635a";

export const WASI_FIND_WASM_URL = playgroundsWasiUrl("find.wasm");
export const WASI_FIND_WASM_SHA256 =
  "1ae4e178c7e724a5ce5e55a2a7114dc1fa95d9b4c035a5f57047e8b8fb3169fd";

export const WASI_DIFFUTILS_WASM_URL = playgroundsWasiUrl("diffutils.wasm");
export const WASI_DIFFUTILS_WASM_SHA256 =
  "d4a30573ee9cb48d78daf84d9ede1a73245fce9962205ab317d7625323a59927";

/** goawk v1.31.0 wasip1 (`awk` command name). */
export const WASI_AWK_VERSION = "goawk-1.31.0";
export const WASI_AWK_WASM_URL = playgroundsWasiUrl("awk.wasm");
export const WASI_AWK_WASM_SHA256 =
  "7b80ddc4106f13010a42bbb91c38d487a7e57e8656257cdeb08d84658e019107";

export const WASI_UUTILS_VERSION = "0.9.0";

/** Served from `public/playgrounds/wasi/coreutils.wasm`. */
export const WASI_UUTILS_WASM_URL = playgroundsWasiUrl("coreutils.wasm");

/** SHA-256 of the vendored uutils multicall binary (hex). */
export const WASI_UUTILS_WASM_SHA256 =
  "96a64fc1d59e6cfbbce13c1e9d6bd6a0155ab0ac5194731ebd095fa1f88b2556";

export interface WasiCmdInfo {
  name: string;
  summary: string;
  wasmUrl: string;
  version: string;
  /** Shared multicall Module (runtime only; not shown in Shell help). */
  family?: "uutils" | "cowsay" | "diffutils";
}

/**
 * uutils multicall subcommands exposed via allowlist.
 * Excludes `yes` (unbounded stdout) and `dd` (easy FS blow-up).
 */
export const WASI_UUTILS_UTIL_NAMES = [
  "arch",
  "b2sum",
  "base32",
  "base64",
  "basename",
  "basenc",
  "cat",
  "cksum",
  "comm",
  "cp",
  "csplit",
  "cut",
  "date",
  "dir",
  "dircolors",
  "dirname",
  "echo",
  "expand",
  "factor",
  "false",
  "fmt",
  "fold",
  "head",
  "join",
  "link",
  "ln",
  "ls",
  "md5sum",
  "mkdir",
  "mktemp",
  "mv",
  "nl",
  "nproc",
  "numfmt",
  "od",
  "paste",
  "pathchk",
  "pr",
  "printenv",
  "printf",
  "ptx",
  "pwd",
  "readlink",
  "realpath",
  "rm",
  "rmdir",
  "seq",
  "sha1sum",
  "sha224sum",
  "sha256sum",
  "sha384sum",
  "sha512sum",
  "shred",
  "shuf",
  "sleep",
  "sort",
  "split",
  "sum",
  "tail",
  "tee",
  "touch",
  "tr",
  "true",
  "truncate",
  "tsort",
  "tty",
  "uname",
  "unexpand",
  "uniq",
  "unlink",
  "vdir",
  "wc",
] as const;

export type WasiUutilsUtilName = (typeof WASI_UUTILS_UTIL_NAMES)[number];

/** User-facing one-liners (Shell help / listCmds). Packaging internals stay out. */
const UUTILS_SUMMARIES: Record<WasiUutilsUtilName, string> = {
  arch: "Print machine architecture",
  b2sum: "Compute / check BLAKE2 checksums",
  base32: "Base32 encode or decode",
  base64: "Base64 encode or decode",
  basename: "Strip directory and suffix from path",
  basenc: "Encode / decode with selectable alphabet",
  cat: "Concatenate and print files",
  cksum: "Checksum and count bytes",
  comm: "Compare two sorted files line by line",
  cp: "Copy files and directories",
  csplit: "Split a file into sections",
  cut: "Remove sections from each line",
  date: "Print or set the system date",
  dir: "List directory contents (ls-like)",
  dircolors: "Color setup for ls",
  dirname: "Strip last component from path",
  echo: "Display a line of text",
  expand: "Convert tabs to spaces",
  factor: "Factor numbers",
  false: "Do nothing, unsuccessfully",
  fmt: "Simple text formatter",
  fold: "Wrap each input line to fit width",
  head: "Output the first part of files",
  join: "Join lines of two files on a field",
  link: "Call the link function to create a link",
  ln: "Make links between files",
  ls: "List directory contents",
  md5sum: "Compute / check MD5 checksums",
  mkdir: "Create directories",
  mktemp: "Create a temporary file or directory",
  mv: "Move (rename) files",
  nl: "Number lines of files",
  nproc: "Print the number of processing units",
  numfmt: "Convert numbers to/from human-readable",
  od: "Dump files in octal and other formats",
  paste: "Merge lines of files",
  pathchk: "Check whether file names are valid",
  pr: "Convert text files for printing",
  printenv: "Print environment variables",
  printf: "Format and print data",
  ptx: "Produce a permuted index of file contents",
  pwd: "Print working directory",
  readlink: "Print resolved symbolic links",
  realpath: "Print resolved path",
  rm: "Remove files or directories",
  rmdir: "Remove empty directories",
  seq: "Print a sequence of numbers",
  sha1sum: "Compute / check SHA1 checksums",
  sha224sum: "Compute / check SHA224 checksums",
  sha256sum: "Compute / check SHA256 checksums",
  sha384sum: "Compute / check SHA384 checksums",
  sha512sum: "Compute / check SHA512 checksums",
  shred: "Overwrite a file to hide contents",
  shuf: "Generate random permutations",
  sleep: "Delay for a specified time",
  sort: "Sort lines of text files",
  split: "Split a file into pieces",
  sum: "Checksum and count the blocks in a file",
  tail: "Output the last part of files",
  tee: "Read from stdin and write to files and stdout",
  touch: "Change file timestamps",
  tr: "Translate or delete characters",
  true: "Do nothing, successfully",
  truncate: "Shrink or extend the size of a file",
  tsort: "Perform topological sort",
  tty: "Print the file name of the terminal",
  uname: "Print system information",
  unexpand: "Convert spaces to tabs",
  uniq: "Report or omit repeated lines",
  unlink: "Call the unlink function to remove a file",
  vdir: "List directory contents (verbose)",
  wc: "Print newline, word, and byte counts",
};

const UUTILS_CMDS: WasiCmdInfo[] = WASI_UUTILS_UTIL_NAMES.map(name => ({
  name,
  summary: UUTILS_SUMMARIES[name],
  wasmUrl: WASI_UUTILS_WASM_URL,
  version: WASI_UUTILS_VERSION,
  family: "uutils" as const,
}));

const COWSAY_CMDS: WasiCmdInfo[] = [
  {
    name: "cowsay",
    summary: "ASCII cow says a message (-f cowfile, -l list)",
    wasmUrl: WASI_COWSAY_WASM_URL,
    version: WASI_COWSAY_VERSION,
    family: "cowsay",
  },
  {
    name: "cowthink",
    summary: "ASCII cow thinks a message (-f cowfile, -l list)",
    wasmUrl: WASI_COWSAY_WASM_URL,
    version: WASI_COWSAY_VERSION,
    family: "cowsay",
  },
];

const TEXT_CMDS: WasiCmdInfo[] = [
  {
    name: "grep",
    summary: "Search PATTERNS in files",
    wasmUrl: WASI_GREP_WASM_URL,
    version: WASI_UUTILS_EXTRA_VERSION,
  },
  {
    name: "sed",
    summary: "Stream editor",
    wasmUrl: WASI_SED_WASM_URL,
    version: WASI_UUTILS_EXTRA_VERSION,
  },
  {
    name: "find",
    summary: "Search for files in a directory hierarchy",
    wasmUrl: WASI_FIND_WASM_URL,
    version: WASI_UUTILS_EXTRA_VERSION,
  },
  {
    name: "awk",
    summary: "Pattern scanning and text processing",
    wasmUrl: WASI_AWK_WASM_URL,
    version: WASI_AWK_VERSION,
  },
  {
    name: "diff",
    summary: "Compare files line by line",
    wasmUrl: WASI_DIFFUTILS_WASM_URL,
    version: WASI_UUTILS_EXTRA_VERSION,
    family: "diffutils",
  },
  {
    name: "cmp",
    summary: "Compare two files byte by byte",
    wasmUrl: WASI_DIFFUTILS_WASM_URL,
    version: WASI_UUTILS_EXTRA_VERSION,
    family: "diffutils",
  },
];

/** Allowlisted WASI commands (Agent + human Shell). */
export const WASI_ALLOWED_CMDS: readonly WasiCmdInfo[] = [
  {
    name: "jq",
    summary: "JSON processor (jq-compatible)",
    wasmUrl: WASI_JQ_WASM_URL,
    version: WASI_JQ_VERSION,
  },
  ...TEXT_CMDS,
  ...COWSAY_CMDS,
  ...UUTILS_CMDS,
] as const;

/** Human Shell only — implemented in JS (not a WASI binary). */
export const SHELL_HOST_CMD_NAMES = ["xargs"] as const;

export function isShellHostCmd(name: string): boolean {
  return (SHELL_HOST_CMD_NAMES as readonly string[]).includes(name);
}

export type WasiAllowedCmd = (typeof WASI_ALLOWED_CMDS)[number]["name"];

export function isWasiAllowedCmd(name: string): name is WasiAllowedCmd {
  return WASI_ALLOWED_CMDS.some(c => c.name === name);
}

export function getWasiCmdInfo(name: string): WasiCmdInfo | undefined {
  return WASI_ALLOWED_CMDS.find(c => c.name === name);
}

export function isWasiUutilsCmd(name: string): boolean {
  return WASI_UUTILS_UTIL_NAMES.includes(name as WasiUutilsUtilName);
}
