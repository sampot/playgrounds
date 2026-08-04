import { describe, expect, it } from "vitest";
import { TOOL_STARTER_NAME, createToolStarterFiles } from "./toolStarter";
import { DEFAULT_ENTRY } from "./projectTypes";

describe("createToolStarterFiles", () => {
  it("includes entry, UI, styles, functions, and README", () => {
    const files = createToolStarterFiles();
    expect(TOOL_STARTER_NAME).toBeTruthy();
    expect(files[DEFAULT_ENTRY]).toContain("文字工具");
    expect(files[DEFAULT_ENTRY]).toContain('name="sam:tool-kinds"');
    expect(files[DEFAULT_ENTRY]).toContain('name="sam:tool-globs"');
    expect(files[DEFAULT_ENTRY]).toContain("editor:text");
    expect(files[DEFAULT_ENTRY]).toContain("*.md");
    expect(files[DEFAULT_ENTRY]).toContain('id="editor"');
    expect(files[DEFAULT_ENTRY]).toContain('id="btn-save"');
    expect(files[DEFAULT_ENTRY]).toContain('id="btn-close"');
    expect(files["app.js"]).toContain("/api/tool/grant");
    expect(files["app.js"]).toContain("/api/tool/file");
    expect(files["app.js"]).toContain("/api/tool/close");
    expect(files["app.js"]).toContain("expectedHash");
    expect(files["functions.js"]).toContain("env.TOOL");
    expect(files["functions.js"]).toContain("/tool/grant");
    expect(files["functions.js"]).toContain("/tool/file");
    expect(files["functions.js"]).toContain("/tool/close");
    expect(files["functions.js"]).not.toContain("env.HOST");
    expect(files["styles.css"]).toContain(".editor");
    expect(files["README.md"]).toContain("用沙盒開啟");
    expect(files["README.md"]).toContain("不是總管");
    expect(files["README.md"]).toContain("新沙盒");
  });
});
