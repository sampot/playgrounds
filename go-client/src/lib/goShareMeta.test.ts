import { describe, expect, it } from "vitest";
import {
  GO_HELP_DOCUMENT_TITLE,
  GO_HOME_DESCRIPTION,
  GO_HOME_DOCUMENT_TITLE,
  GO_HOME_LEAD,
  GO_INVITE_DESCRIPTION,
  GO_INVITE_DOCUMENT_TITLE,
  GO_OG_IMAGE_ALT,
  GO_SITE_NAME,
  GO_TWITTER_SITE,
  goInviteCanonicalUrl,
  goOgMeta,
  goSamCanonicalUrl,
  goSamDescription,
  goSamDocumentTitle,
  goSamShareTitle,
  goWebsiteJsonLd,
  goWebPageJsonLd,
  goSamIsIndexable,
  goSamJsonLd,
  goSamKindLabel,
} from "./goShareMeta";

describe("goShareMeta", () => {
  it("uses distinct document titles per entry.title", () => {
    const a = goSamDocumentTitle({ title: "打磚塊" });
    const b = goSamDocumentTitle({ title: "五子棋" });
    expect(a).toBe("打磚塊 · 山姆鍋遊樂場");
    expect(b).toBe("五子棋 · 山姆鍋遊樂場");
    expect(a).not.toBe(b);
    expect(goSamShareTitle({ title: "打磚塊" })).toBe("打磚塊");
  });

  it("prefixes description with site context", () => {
    expect(
      goSamDescription({ title: "打磚塊", blurb: "擋板反彈清磚" })
    ).toBe("山姆鍋遊樂場 · 純玩｜擋板反彈清磚");
    expect(goSamDescription({ title: "打磚塊", blurb: "" })).toBe(
      "在山姆鍋遊樂場純玩「打磚塊」。打開即可玩。"
    );
  });

  it("builds canonical /s/ url", () => {
    expect(goSamCanonicalUrl("pg-breakout")).toBe(
      "https://go.samkuo.me/s/pg-breakout"
    );
  });

  it("uses brand-first home title and a fuller play-focused description", () => {
    expect(GO_HOME_DOCUMENT_TITLE).toBe(
      "山姆鍋遊樂場 · 純玩｜打開就能玩的瀏覽器小品"
    );
    expect(GO_HOME_DESCRIPTION.length).toBeGreaterThanOrEqual(80);
    expect(GO_HOME_DESCRIPTION).toContain("免安裝");
    expect(GO_HOME_DESCRIPTION).toContain("離線");
    expect(GO_HOME_DESCRIPTION).toContain("Let's dash, go, and play!");
    expect(GO_HOME_LEAD).toBe("純玩 — Let's dash, go, and play!");
  });

  it("uses neutral invite preview copy", () => {
    expect(GO_INVITE_DOCUMENT_TITLE).toBe("接受邀請 · 山姆鍋遊樂場");
    expect(GO_INVITE_DESCRIPTION).toBe(
      "用邀請連結進入山姆鍋遊樂場純玩。"
    );
    expect(GO_INVITE_DOCUMENT_TITLE).not.toMatch(/對弈|對局/);
    expect(GO_INVITE_DESCRIPTION).not.toMatch(/對弈|對局/);
    expect(goInviteCanonicalUrl("Ab12Cd")).toBe(
      "https://go.samkuo.me/i/Ab12Cd"
    );
  });

  it("brands help document title", () => {
    expect(GO_HELP_DOCUMENT_TITLE).toBe("使用說明 · 山姆鍋遊樂場");
  });

  it("builds og meta fields with site og:image and alt", () => {
    const og = goOgMeta({
      title: GO_HOME_DOCUMENT_TITLE,
      description: GO_HOME_DESCRIPTION,
      url: "https://go.samkuo.me/",
    });
    expect(og.siteName).toBe(GO_SITE_NAME);
    expect(GO_TWITTER_SITE).toBe("@sampotkuo");
    expect(og).toEqual({
      title: GO_HOME_DOCUMENT_TITLE,
      description: GO_HOME_DESCRIPTION,
      url: "https://go.samkuo.me/",
      siteName: "山姆鍋遊樂場",
      image: "https://go.samkuo.me/og.png",
      imageAlt: GO_OG_IMAGE_ALT,
      imageWidth: 1200,
      imageHeight: 630,
      twitterSite: GO_TWITTER_SITE,
    });
    expect(og.imageAlt.length).toBeGreaterThan(8);
  });

  it("builds WebSite JSON-LD for the home origin", () => {
    const ld = goWebsiteJsonLd();
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("WebSite");
    expect(ld.url).toBe("https://go.samkuo.me/");
    expect(ld.name).toBe("山姆鍋遊樂場 · 純玩");
    expect(ld.inLanguage).toBe("zh-Hant");
    expect(ld.description).toBe(GO_HOME_DESCRIPTION);
    expect(ld.image).toBe("https://go.samkuo.me/og.png");
  });

  it("builds WebPage JSON-LD for indexable routes", () => {
    const ld = goWebPageJsonLd({
      title: "使用說明 · 山姆鍋遊樂場",
      description: "說明文案",
      url: "https://go.samkuo.me/help",
    });
    expect(ld).toEqual({
      "@context": "https://schema.org",
      "@type": "WebPage",
      name: "使用說明 · 山姆鍋遊樂場",
      description: "說明文案",
      url: "https://go.samkuo.me/help",
      isPartOf: {
        "@type": "WebSite",
        name: "山姆鍋遊樂場 · 純玩",
        url: "https://go.samkuo.me/",
      },
      inLanguage: "zh-Hant",
    });
  });

  it("indexes only listed catalog entries", () => {
    expect(goSamIsIndexable({ status: "listed" })).toBe(true);
    expect(goSamIsIndexable({ status: "unlisted" })).toBe(false);
    expect(goSamIsIndexable(null)).toBe(false);
  });

  it("labels catalog kinds in zh", () => {
    expect(goSamKindLabel("game")).toBe("遊戲");
    expect(goSamKindLabel("media")).toBe("影音繪圖");
    expect(goSamKindLabel(null)).toBe("");
  });

  it("builds kind-aware JSON-LD for catalog solo pages", () => {
    const game = goSamJsonLd({
      title: "打磚塊",
      blurb: "擋板反彈清磚",
      kind: "game",
      series: "懷舊",
      status: "listed",
      id: "pg-breakout",
    });
    expect(game["@type"]).toBe("VideoGame");
    expect(game.name).toBe("打磚塊");
    expect(game.description).toBe("擋板反彈清磚");
    expect(game.url).toBe("https://go.samkuo.me/s/pg-breakout");
    expect(game.genre).toBe("懷舊");
    expect(game.isPartOf).toEqual({
      "@type": "WebSite",
      name: "山姆鍋遊樂場 · 純玩",
      url: "https://go.samkuo.me/",
    });

    const tool = goSamJsonLd({
      title: "正規實驗室",
      blurb: "測 regex",
      kind: "tool",
      status: "listed",
      id: "pg-regexlab",
    });
    expect(tool["@type"]).toBe("WebApplication");
    expect(tool.applicationCategory).toBe("UtilitiesApplication");
  });
});
