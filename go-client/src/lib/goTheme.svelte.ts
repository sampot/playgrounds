/**
 * go-client 畫面色系（light / dark）。
 *
 * 與 `app.html` 的內聯開機腳本共用同一個 localStorage 鍵
 * `pg_go_theme`：開機腳本負責「無閃爍」初次套用，本模組負責執行期
 * 以 Svelte 5 runes 反應式切換並寫回同一把鍵。
 */

export type GoTheme = "light" | "dark";

const THEME_KEY = "pg_go_theme";

function readStoredTheme(): GoTheme {
  if (typeof localStorage === "undefined") return "light";
  const t = localStorage.getItem(THEME_KEY);
  return t === "dark" ? "dark" : "light";
}

function applyTheme(theme: GoTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#161826" : "#f6f0e0");
  }
}

class GoThemeStore {
  current = $state<GoTheme>(readStoredTheme());

  constructor() {
    // 與開機腳本已套用的 data-theme 對齊（避免 SSR/hydrate 不一致）。
    applyTheme(this.current);
  }

  toggle(): void {
    this.set(this.current === "dark" ? "light" : "dark");
  }

  set(theme: GoTheme): void {
    this.current = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      /* 隱私模式等無法寫入時，僅本次切換生效 */
    }
    applyTheme(theme);
  }
}

export const goTheme = new GoThemeStore();
