(() => {
  const primaryColorScheme = ""; // "light" | "dark"
  const BTN_SEL = "#theme-btn, .js-theme-btn";

  function getPreferTheme() {
    // Explicit user choice wins over system preference
    const stored = localStorage.getItem("theme");
    if (stored) return stored;

    if (primaryColorScheme) return primaryColorScheme;

    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  let themeValue = getPreferTheme();

  function setPreference() {
    localStorage.setItem("theme", themeValue);
    reflectPreference();
    document.dispatchEvent(
      new CustomEvent("theme-change", { detail: themeValue })
    );
  }

  function reflectPreference() {
    document.documentElement.setAttribute("data-theme", themeValue);
    if (themeValue === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
    const label =
      themeValue === "dark"
        ? "目前為深色主題，點擊切換為淺色"
        : "目前為淺色主題，點擊切換為深色";
    document.querySelectorAll(BTN_SEL).forEach((btn) => {
      btn.setAttribute("aria-label", label);
    });

    const body = document.body;
    if (body) {
      const bgColor = window.getComputedStyle(body).backgroundColor;
      document
        .querySelector("meta[name='theme-color']")
        ?.setAttribute("content", bgColor);
    }
  }

  function onThemeBtnClick() {
    themeValue = themeValue === "light" ? "dark" : "light";
    setPreference();
  }

  function setThemeFeature() {
    reflectPreference();
  }

  // set early so no page flashes / CSS is made aware
  reflectPreference();

  // Delegation: Svelte islands mount after window load
  document.addEventListener("click", (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest(BTN_SEL)) onThemeBtnClick();
  });

  document.addEventListener("appearance-controls-ready", setThemeFeature);
  window.addEventListener("load", () => {
    setThemeFeature();
    document.addEventListener("astro:after-swap", setThemeFeature);
  });

  // Follow OS only when the reader has not chosen a theme manually
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", ({ matches: isDark }) => {
      if (localStorage.getItem("theme")) return;
      themeValue = isDark ? "dark" : "light";
      reflectPreference();
      document.dispatchEvent(
        new CustomEvent("theme-change", { detail: themeValue })
      );
    });
})();
