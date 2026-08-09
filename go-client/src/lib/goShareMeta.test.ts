import { describe, expect, it } from "vitest";
import {
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

  it("prefers blurb for description", () => {
    expect(
      goSamDescription({ title: "打磚塊", blurb: "擋板反彈清磚" })
    ).toBe("擋板反彈清磚");
    expect(goSamDescription({ title: "打磚塊", blurb: "" })).toContain(
      "打磚塊"
    );
  });

  it("builds canonical /s/ url", () => {
    expect(goSamCanonicalUrl("pg-breakout")).toBe(
      "https://go.samkuo.me/s/pg-breakout"
    );
  });
});
