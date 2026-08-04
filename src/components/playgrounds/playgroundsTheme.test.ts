import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function installDomMock(theme: "light" | "dark" = "light") {
  const attrs = new Map<string, string>([["data-theme", theme]]);
  const documentElement = {
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attrs.set(name, value);
    },
    removeAttribute: (name: string) => {
      attrs.delete(name);
    },
    classList: {
      add: () => {},
      remove: () => {},
    },
  };
  const doc = {
    documentElement,
    createElement: (tag: string) => {
      if (tag !== "iframe") throw new Error(`unexpected tag ${tag}`);
      return { style: { colorScheme: "" } };
    },
  };
  const getComputedStyle = () => ({
    getPropertyValue: (name: string) => {
      if (name === "--color-fill") return "248 250 249";
      if (name === "--color-text-base") return "28 35 33";
      if (name === "--color-accent") return "15 118 110";
      return "";
    },
  });
  vi.stubGlobal("document", doc);
  vi.stubGlobal("getComputedStyle", getComputedStyle);
  vi.stubGlobal("window", { getComputedStyle });
  return { attrs, documentElement, doc };
}

describe("playgroundsTheme", () => {
  beforeEach(() => {
    installDomMock("light");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reads data-theme for dark detection", async () => {
    const { isPlaygroundsDarkTheme } = await import("./playgroundsTheme");
    expect(isPlaygroundsDarkTheme()).toBe(false);
    document.documentElement.setAttribute("data-theme", "dark");
    expect(isPlaygroundsDarkTheme()).toBe(true);
  });

  it("sets iframe color-scheme from blog theme", async () => {
    const { applyIframeColorScheme } = await import("./playgroundsTheme");
    const el = document.createElement("iframe") as unknown as HTMLIFrameElement;
    applyIframeColorScheme(el);
    expect(el.style.colorScheme).toBe("light");
    document.documentElement.setAttribute("data-theme", "dark");
    applyIframeColorScheme(el);
    expect(el.style.colorScheme).toBe("dark");
  });

  it("also sets same-origin documentElement color-scheme", async () => {
    const { applyIframeColorScheme } = await import("./playgroundsTheme");
    const root = { style: { colorScheme: "" } };
    const el = {
      style: { colorScheme: "" },
      contentDocument: { documentElement: root },
    } as unknown as HTMLIFrameElement;
    document.documentElement.setAttribute("data-theme", "dark");
    applyIframeColorScheme(el);
    expect(el.style.colorScheme).toBe("dark");
    expect(root.style.colorScheme).toBe("dark");
  });

  it("builds an xterm theme from CSS variables", async () => {
    const { playgroundsXtermTheme } = await import("./playgroundsTheme");
    const theme = playgroundsXtermTheme();
    expect(theme.background).toBe("rgb(248 250 249)");
    expect(theme.foreground).toBe("rgb(28 35 33)");
    expect(theme.cursor).toBe("rgb(15 118 110)");
  });
});
