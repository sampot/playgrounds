import { describe, expect, it } from "vitest";
import {
  GO_HELP_DOCUMENT_TITLE,
  GO_HOME_DESCRIPTION,
  GO_HOME_DOCUMENT_TITLE,
  GO_HOME_LEAD,
  GO_INVITE_DESCRIPTION,
  GO_INVITE_DOCUMENT_TITLE,
  GO_SITE_NAME,
  goInviteCanonicalUrl,
  goOgMeta,
  goSamCanonicalUrl,
  goSamDescription,
  goSamDocumentTitle,
  goSamShareTitle,
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

  it("uses brand-first home title and slogan description", () => {
    expect(GO_HOME_DOCUMENT_TITLE).toBe("山姆鍋遊樂場 · 純玩");
    expect(GO_HOME_DESCRIPTION).toBe(
      "山姆鍋遊樂場 · 純玩 — Let's dash, go, and play!"
    );
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

  it("builds og meta fields without image", () => {
    const og = goOgMeta({
      title: GO_HOME_DOCUMENT_TITLE,
      description: GO_HOME_DESCRIPTION,
      url: "https://go.samkuo.me/",
    });
    expect(og.siteName).toBe(GO_SITE_NAME);
    expect(og).toEqual({
      title: GO_HOME_DOCUMENT_TITLE,
      description: GO_HOME_DESCRIPTION,
      url: "https://go.samkuo.me/",
      siteName: "山姆鍋遊樂場",
    });
  });
});
