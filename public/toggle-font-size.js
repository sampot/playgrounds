(() => {
  const FONT_SIZES = ["md", "lg", "xl"];
  const STORAGE_KEY = "font-size";
  const DEC_SEL = "#font-dec, .js-font-dec";
  const INC_SEL = "#font-inc, .js-font-inc";
  const GROUP_SEL = "#font-size-controls, .js-font-size-controls";

  function getPreferFontSize() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && FONT_SIZES.includes(stored)) return stored;
    return "md";
  }

  let fontSizeValue = getPreferFontSize();

  function setPreference() {
    localStorage.setItem(STORAGE_KEY, fontSizeValue);
    reflectPreference();
  }

  function reflectPreference() {
    document.documentElement.setAttribute("data-font-size", fontSizeValue);

    const atMin = fontSizeValue === FONT_SIZES[0];
    const atMax = fontSizeValue === FONT_SIZES[FONT_SIZES.length - 1];

    document.querySelectorAll(DEC_SEL).forEach((el) => {
      if (!(el instanceof HTMLButtonElement)) return;
      el.disabled = atMin;
      el.setAttribute("aria-label", atMin ? "已是最小字型" : "縮小字型");
    });
    document.querySelectorAll(INC_SEL).forEach((el) => {
      if (!(el instanceof HTMLButtonElement)) return;
      el.disabled = atMax;
      el.setAttribute("aria-label", atMax ? "已是最大字型" : "放大字型");
    });

    const groupLabel = `目前字型大小：${
      fontSizeValue === "md"
        ? "標準"
        : fontSizeValue === "lg"
          ? "較大"
          : "最大"
    }`;
    document.querySelectorAll(GROUP_SEL).forEach((el) => {
      el.setAttribute("aria-label", groupLabel);
    });
  }

  function decreaseFontSize() {
    const i = FONT_SIZES.indexOf(fontSizeValue);
    if (i > 0) {
      fontSizeValue = FONT_SIZES[i - 1];
      setPreference();
    }
  }

  function increaseFontSize() {
    const i = FONT_SIZES.indexOf(fontSizeValue);
    if (i < FONT_SIZES.length - 1) {
      fontSizeValue = FONT_SIZES[i + 1];
      setPreference();
    }
  }

  function setFontSizeFeature() {
    reflectPreference();
  }

  // Apply early so rem-based layout does not flash at the wrong size
  reflectPreference();

  document.addEventListener("click", (event) => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest(DEC_SEL)) decreaseFontSize();
    else if (t.closest(INC_SEL)) increaseFontSize();
  });

  document.addEventListener("appearance-controls-ready", setFontSizeFeature);
  window.addEventListener("load", () => {
    setFontSizeFeature();
    document.addEventListener("astro:after-swap", setFontSizeFeature);
  });
})();
