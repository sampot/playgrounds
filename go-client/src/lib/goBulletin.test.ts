import { describe, expect, it } from "vitest";
import {
  dismissBulletin,
  filterActiveBulletins,
  GO_BULLETIN_FIXTURE,
  isBulletinActive,
  shouldShowBulletinStrip,
  type GoBulletin,
} from "./goBulletin";

const sample: GoBulletin = {
  id: "maint",
  rev: 1,
  severity: "notice",
  title: "今晚維修",
  body: "短暫停機。",
  startsAt: "2026-01-01T00:00:00Z",
  dismissible: true,
};

describe("goBulletin", () => {
  it("posts that members can invite connected play", () => {
    const list = filterActiveBulletins(GO_BULLETIN_FIXTURE, {
      now: new Date("2026-08-18T12:00:00Z"),
    });
    const invite = list.find((b) => b.id === "invite-play");
    expect(invite?.title).toMatch(/會員/);
    expect(invite?.body).toMatch(/邀請/);
    expect(invite?.body).toMatch(/連線/);
    expect(invite?.dismissible).toBe(false);
  });

  it("filters active bulletins by time and dismiss", () => {
    const now = new Date("2026-08-18T12:00:00Z");
    expect(
      filterActiveBulletins([sample], { now, dismissed: {} })
    ).toHaveLength(1);
    expect(
      filterActiveBulletins([sample], {
        now,
        dismissed: { maint: 1 },
      })
    ).toHaveLength(0);
  });

  it("respects endsAt", () => {
    const ended: GoBulletin = {
      ...sample,
      endsAt: "2026-08-01T00:00:00Z",
    };
    expect(
      isBulletinActive(ended, new Date("2026-08-18T12:00:00Z"), {})
    ).toBe(false);
  });

  it("reappears when rev bumps after dismiss", () => {
    const now = new Date("2026-08-18T12:00:00Z");
    const bumped = { ...sample, rev: 2 };
    expect(
      filterActiveBulletins([bumped], { now, dismissed: { maint: 1 } })
    ).toHaveLength(1);
  });

  it("sorts critical before info", () => {
    const info: GoBulletin = { ...sample, id: "a", severity: "info" };
    const critical: GoBulletin = { ...sample, id: "b", severity: "critical" };
    const list = filterActiveBulletins([info, critical], {
      now: new Date("2026-08-18T12:00:00Z"),
    });
    expect(list[0]?.id).toBe("b");
  });

  it("caps active list", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({
      ...sample,
      id: `b${i}`,
    }));
    expect(
      filterActiveBulletins(many, {
        now: new Date("2026-08-18T12:00:00Z"),
        cap: 3,
      })
    ).toHaveLength(3);
  });

  it("hides strip on canvas except critical on invite", () => {
    expect(
      shouldShowBulletinStrip({
        pathname: "/",
        canvasActive: true,
      })
    ).toBe(false);
    expect(
      shouldShowBulletinStrip({
        pathname: "/i/abc",
        canvasActive: false,
        severity: "info",
      })
    ).toBe(false);
    expect(
      shouldShowBulletinStrip({
        pathname: "/i/abc",
        canvasActive: false,
        severity: "critical",
      })
    ).toBe(true);
  });

  it("persists dismiss to storage", () => {
    let raw = "";
    const storage = {
      getItem: () => raw,
      setItem: (_k: string, v: string) => {
        raw = v;
      },
    };
    dismissBulletin(storage, sample);
    expect(JSON.parse(raw)).toEqual({ maint: 1 });
  });
});
