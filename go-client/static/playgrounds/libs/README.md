# Host-shipped UI libraries (`PG.libs`)

Pinned binaries for [`PG-LIBS-SPEC.md`](../../../docs/PG-LIBS-SPEC.md).

- **Load only via** `await PG.libs.load(id)` — do not precache these paths in SW/install.
- **pin.json** is the human/CI pin table; `public/playgrounds/sdk.js` embeds the same rows (tests assert sync).
- Each library ships with `LICENSE-<id>.txt` for the **exact** pinned version.
- **UMD** libs expose a browser global (or `Math.seedrandom`); **ESM** (`format: "esm"`) load via dynamic `import()`.

| id | file | kind | load | license |
| --- | --- | --- | --- | --- |
| phaser | `phaser-4.2.1.min.js` | engine | UMD `Phaser` | MIT |
| matter | `matter-0.20.0.min.js` | physics | UMD `Matter` | MIT |
| howler | `howler-2.2.4.min.js` | audio | UMD `Howler` | MIT |
| tone | `tone-15.1.22.js` | audio | UMD `Tone` | MIT |
| nipple | `nipplejs-1.0.4.min.js` | input | UMD `nipplejs` | MIT |
| three | `three-0.185.1.module.min.js` | other | ESM namespace | MIT |
| pixi | `pixi-8.19.0.min.mjs` | engine | ESM namespace | MIT |
| seedrandom | `seedrandom-3.0.5.min.js` | other | `Math.seedrandom` | MIT |
| planck | `planck-1.3.0.min.js` | physics | UMD `planck` | MIT |
