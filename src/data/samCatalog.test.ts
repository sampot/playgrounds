import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SAM_CATALOG_JSON_PATH,
  SAM_PLAYGROUNDS_PICK_REPOS,
  catalogBrowseShareHref,
  catalogProtocolMatches,
  catalogSeriesOptions,
  catalogUrlSearchParams,
  listRegisteredCatalogEntries,
  samCatalogRegistered,
  entryMatchesCatalogQuery,
  entrySupportsProtocol,
  filterCatalogEntries,
  findCatalogBySource,
  getCatalogEntry,
  isSampotCatalogSource,
  listCatalogEntries,
  listRegisteredCatalogEntries,
  matchCatalogForProtocol,
  matchInstalledForProtocol,
  normalizeCatalogSource,
  parseCatalogUrlSearch,
  resolveCatalogInviteCandidates,
  resolveInviteCandidates,
  samCatalog,
  samCatalogRegistered,
  samEntryOpenSource,
  samOpenHref,
  samOpenShareHref,
  pickRandomCatalogEntry,
  samPlaygroundsPicks,
  samSourceHref,
  type SamEntry,
  type SessionProtocolSpec,
} from "./samCatalog";
import { PLAYGROUNDS_CANONICAL_ORIGIN } from "../utils/playgroundsUrls";

describe("samPlaygroundsPicks", () => {
  it("resolves curated ids in order from the live catalog", () => {
    const picks = samPlaygroundsPicks();
    expect(picks.map(p => p.id)).toEqual([...SAM_PLAYGROUNDS_PICK_REPOS]);
    expect(picks.length).toBeGreaterThan(0);
    for (const pick of picks) {
      expect(samCatalog.some(e => e.id === pick.id)).toBe(true);
    }
  });

  it("skips unknown ids", () => {
    expect(
      samPlaygroundsPicks(samCatalog, [
        "pg-breakout",
        "pg-nope",
        "pg-hashlab",
      ]).map(p => p.id)
    ).toEqual(["pg-breakout", "pg-hashlab"]);
  });
});

describe("pickRandomCatalogEntry", () => {
  it("prefers picks and can exclude current source", () => {
    const picks = samPlaygroundsPicks();
    expect(picks.length).toBeGreaterThan(1);
    const current = picks[0]!;
    const next = pickRandomCatalogEntry({
      excludeSource: current.source,
      random: () => 0,
    });
    expect(next).toBeTruthy();
    expect(next!.id).not.toBe(current.id);
    expect(picks.some(p => p.id === next!.id)).toBe(true);
  });

  it("falls back to full catalog when prefer pool is empty", () => {
    const base = samCatalog[0]!;
    const a: SamEntry = {
      ...base,
      id: "try-a",
      repo: "try-a",
      title: "A",
      source: "sampot/try-a",
    };
    const b: SamEntry = {
      ...base,
      id: "try-b",
      repo: "try-b",
      title: "B",
      source: "sampot/try-b",
    };
    // Neither id is in curated picks → prefer pool empty → full catalog.
    expect(
      pickRandomCatalogEntry({
        catalog: [a, b],
        preferPicks: true,
        excludeId: "try-a",
        random: () => 0,
      })?.id
    ).toBe("try-b");
  });
});

describe("catalog query API", () => {
  it("listCatalogEntries returns listed catalog", () => {
    expect(listCatalogEntries().length).toBe(samCatalog.length);
    expect(listCatalogEntries()[0]?.id).toBeTruthy();
    expect(samCatalog.every(e => e.status === "listed")).toBe(true);
  });

  it("registered includes listed and is the resolve universe", () => {
    expect(listRegisteredCatalogEntries().length).toBe(
      samCatalogRegistered.length
    );
    expect(samCatalogRegistered.length).toBeGreaterThanOrEqual(
      samCatalog.length
    );
    expect(
      samCatalogRegistered.every(
        e => e.status === "listed" || e.status === "unlisted"
      )
    ).toBe(true);
  });

  it("getCatalogEntry by id", () => {
    expect(getCatalogEntry("pg-breakout")?.source).toBe("sampot/pg-breakout");
    expect(getCatalogEntry("pg-breakout")?.status).toBe("listed");
    expect(getCatalogEntry("nope")).toBeUndefined();
    expect(getCatalogEntry("  ")).toBeUndefined();
  });

  it("unlisted is registered but not in public browse list", () => {
    const unlisted: SamEntry = {
      id: "pg-secret-egg",
      repo: "pg-secret-egg",
      title: "隱藏彩蛋",
      kind: "game",
      series: "精緻可玩",
      blurb: "測試用",
      source: "sampot/pg-secret-egg",
      status: "unlisted",
    };
    const registered = [...samCatalogRegistered, unlisted];
    const listed = registered.filter(e => e.status === "listed");
    expect(listed.some(e => e.id === "pg-secret-egg")).toBe(false);
    expect(getCatalogEntry("pg-secret-egg", registered)?.title).toBe(
      "隱藏彩蛋"
    );
    expect(
      findCatalogBySource("sampot/pg-secret-egg", registered)?.id
    ).toBe("pg-secret-egg");
  });

  it("normalizeCatalogSource collapses github URLs", () => {
    expect(normalizeCatalogSource("sampot/pg-breakout")).toBe(
      "sampot/pg-breakout"
    );
    expect(
      normalizeCatalogSource("https://github.com/sampot/pg-breakout")
    ).toBe("sampot/pg-breakout");
    expect(
      normalizeCatalogSource("https://github.com/sampot/pg-breakout.git")
    ).toBe("sampot/pg-breakout");
  });

  it("findCatalogBySource matches owner/repo and URL forms", () => {
    expect(findCatalogBySource("sampot/pg-breakout")?.id).toBe("pg-breakout");
    expect(
      findCatalogBySource("https://github.com/sampot/pg-breakout")?.id
    ).toBe("pg-breakout");
    expect(findCatalogBySource("pg-breakout")?.id).toBe("pg-breakout");
    expect(findCatalogBySource("acme/missing")).toBeUndefined();
  });
});

describe("matchCatalogForProtocol", () => {
  const coding: SessionProtocolSpec = {
    protocolId: "coding-orchestration.v1",
    apiVersion: "1",
    role: "worker",
  };

  it("matches pg-llm-agent for coding-orchestration worker", () => {
    const hits = matchCatalogForProtocol(coding);
    expect(hits.some(e => e.id === "pg-llm-agent")).toBe(true);
    expect(entrySupportsProtocol(getCatalogEntry("pg-llm-agent")!, coding)).toBe(
      true
    );
  });

  it("does not match entries without protocols", () => {
    expect(entrySupportsProtocol(getCatalogEntry("pg-breakout")!, coding)).toBe(
      false
    );
  });

  it("rejects wrong apiVersion or role", () => {
    expect(
      matchCatalogForProtocol({ ...coding, apiVersion: "99" }).map(e => e.id)
    ).not.toContain("pg-llm-agent");
    expect(
      matchCatalogForProtocol({ ...coding, role: "host" }).map(e => e.id)
    ).not.toContain("pg-llm-agent");
  });

  it("orders hinted catalogId first among matches", () => {
    const toy: SamEntry = {
      id: "pg-toy-worker",
      repo: "pg-toy-worker",
      title: "Toy",
      kind: "agent",
      series: "子代理",
      blurb: "t",
      source: "acme/toy",
      status: "listed",
      protocols: [
        {
          protocolId: "coding-orchestration.v1",
          apiVersion: "1",
          roles: ["worker"],
        },
      ],
    };
    const llm = getCatalogEntry("pg-llm-agent")!;
    const hits = matchCatalogForProtocol(
      { ...coding, catalogId: "pg-toy-worker" },
      [llm, toy]
    );
    expect(hits.map(e => e.id)).toEqual(["pg-toy-worker", "pg-llm-agent"]);
  });

  it("catalogProtocolMatches allows any role when roles omitted", () => {
    expect(
      catalogProtocolMatches(
        { protocolId: "x.v1", apiVersion: "1" },
        { protocolId: "x.v1", apiVersion: "1", role: "anything" }
      )
    ).toBe(true);
  });

  it("resolveCatalogInviteCandidates aliases matchCatalogForProtocol", () => {
    expect(resolveCatalogInviteCandidates(coding).map(e => e.id)).toEqual(
      matchCatalogForProtocol(coding).map(e => e.id)
    );
  });
});

describe("resolveInviteCandidates (catalog + installed)", () => {
  const coding: SessionProtocolSpec = {
    protocolId: "coding-orchestration.v1",
    apiVersion: "1",
    role: "worker",
  };

  it("matchInstalledForProtocol gates on head protocols", () => {
    const hits = matchInstalledForProtocol(coding, [
      {
        sandboxId: "local-1",
        name: "Local LLM",
        protocols: [
          {
            protocolId: "coding-orchestration.v1",
            apiVersion: "1",
            roles: ["worker"],
          },
        ],
      },
      {
        sandboxId: "local-2",
        name: "No protocols",
      },
      {
        sandboxId: "local-3",
        name: "Wrong role",
        protocols: [
          {
            protocolId: "coding-orchestration.v1",
            apiVersion: "1",
            roles: ["host"],
          },
        ],
      },
    ]);
    expect(hits.map(h => h.sandboxId)).toEqual(["local-1"]);
  });

  it("merges installed-only with catalog and prefers installed", () => {
    const candidates = resolveInviteCandidates(coding, {
      installed: [
        {
          sandboxId: "sbx-custom",
          name: "Custom worker",
          protocols: [
            {
              protocolId: "coding-orchestration.v1",
              apiVersion: "1",
              roles: ["worker"],
            },
          ],
        },
        {
          sandboxId: "sbx-llm",
          name: "Installed LLM",
          source: "sampot/pg-llm-agent",
          protocols: [
            {
              protocolId: "coding-orchestration.v1",
              apiVersion: "1",
              roles: ["worker"],
            },
          ],
        },
      ],
    });
    expect(candidates[0]?.origin).not.toBe("catalog");
    expect(candidates.some(c => c.origin === "both" && c.sandboxId === "sbx-llm")).toBe(
      true
    );
    expect(
      candidates.some(c => c.origin === "installed" && c.sandboxId === "sbx-custom")
    ).toBe(true);
    // pg-llm-agent catalog row is covered by installed — not duplicated as catalog-only
    expect(
      candidates.filter(c => c.catalogId === "pg-llm-agent" && c.origin === "catalog")
    ).toHaveLength(0);
  });

  it("returns catalog-only when nothing installed", () => {
    const candidates = resolveInviteCandidates(coding, { installed: [] });
    expect(candidates.some(c => c.catalogId === "pg-llm-agent")).toBe(true);
    expect(candidates.every(c => c.origin === "catalog")).toBe(true);
  });
});

describe("public/catalog/v1.json", () => {
  it("matches bundled catalog entries and schema v1", () => {
    const raw = readFileSync(
      join(process.cwd(), "public/catalog/v1.json"),
      "utf8"
    );
    const doc = JSON.parse(raw) as {
      v: number;
      entries: {
        id: string;
        source: string;
        protocols?: { protocolId: string; apiVersion: string }[];
      }[];
      picks: string[];
    };
    expect(doc.v).toBe(1);
    expect(SAM_CATALOG_JSON_PATH).toBe("/catalog/v1.json");
    expect(doc.entries.map(e => e.id).sort()).toEqual(
      samCatalogRegistered.map(e => e.id).sort()
    );
    expect(
      doc.entries.filter(e => (e as { status?: string }).status === "listed")
        .map(e => e.id)
        .sort()
    ).toEqual(samCatalog.map(e => e.id).sort());
    expect(doc.picks).toEqual([...SAM_PLAYGROUNDS_PICK_REPOS]);
    const llm = doc.entries.find(e => e.id === "pg-llm-agent");
    expect(llm?.protocols?.[0]?.protocolId).toBe("coding-orchestration.v1");
    expect((llm as { status?: string })?.status).toBe("listed");
  });
});

describe("sam open helpers", () => {
  it("builds open source and same-origin field href from entry.source", () => {
    const entry = samCatalog.find(e => e.id === "pg-breakout");
    expect(entry).toBeTruthy();
    expect(samEntryOpenSource(entry!)).toBe("sampot/pg-breakout");
    expect(samOpenHref(entry!)).toBe(
      "/?open=sampot%2Fpg-breakout&name=%E6%89%93%E7%A3%9A%E5%A1%8A"
    );
  });

  it("supports non-sampot owner/repo and full URLs", () => {
    expect(
      samEntryOpenSource({ source: "acme/cool-sam" })
    ).toBe("acme/cool-sam");
    expect(
      samSourceHref("acme/cool-sam")
    ).toBe("https://github.com/acme/cool-sam");
    expect(
      samSourceHref("https://gitlab.com/acme/cool-sam")
    ).toBe("https://gitlab.com/acme/cool-sam");
    expect(samOpenHref({ title: "Cool", source: "acme/cool-sam" })).toBe(
      "/?open=acme%2Fcool-sam&name=Cool"
    );
  });
});

describe("isSampotCatalogSource", () => {
  it("matches sampot owner forms", () => {
    expect(isSampotCatalogSource("sampot/pg-breakout")).toBe(true);
    expect(isSampotCatalogSource("https://github.com/sampot/pg-breakout")).toBe(
      true
    );
    expect(isSampotCatalogSource("playgrounds-agent-starter")).toBe(false);
    expect(isSampotCatalogSource(null)).toBe(false);
  });
});

describe("generated catalog smoke", () => {
  it("has unique ids and steward source", () => {
    const ids = samCatalog.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const steward = samCatalog.find(e => e.id === "pg-steward");
    expect(steward?.source).toBe("sampot/pg-steward");
  });
});

describe("catalog human filter (UX)", () => {
  it("matches query against title／id／blurb／series／kind", () => {
    const entry = getCatalogEntry("pg-breakout")!;
    expect(entryMatchesCatalogQuery(entry, "磚")).toBe(true);
    expect(entryMatchesCatalogQuery(entry, "pg-breakout")).toBe(true);
    expect(entryMatchesCatalogQuery(entry, "遊戲")).toBe(true);
    expect(entryMatchesCatalogQuery(entry, "nope-xyz")).toBe(false);
    expect(entryMatchesCatalogQuery(entry, "  ")).toBe(true);
  });

  it("filters by q＋kind＋series (AND)", () => {
    const byKind = filterCatalogEntries(samCatalog, {
      q: "",
      kinds: ["game"],
      series: [],
    });
    expect(byKind.length).toBeGreaterThan(0);
    expect(byKind.every(e => e.kind === "game")).toBe(true);

    const bySeries = filterCatalogEntries(samCatalog, {
      q: "",
      kinds: [],
      series: ["街機"],
    });
    expect(bySeries.every(e => e.series === "街機")).toBe(true);

    const hit = filterCatalogEntries(samCatalog, {
      q: "breakout",
      kinds: ["game"],
      series: [],
    });
    expect(hit.map(e => e.id)).toContain("pg-breakout");
  });

  it("round-trips URL search params", () => {
    const parsed = parseCatalogUrlSearch("?q=hash&kind=tool,game&series=日常");
    expect(parsed).toEqual({
      q: "hash",
      kinds: ["tool", "game"],
      series: ["日常"],
    });
    expect(catalogUrlSearchParams(parsed).toString()).toBe(
      "q=hash&kind=tool%2Cgame&series=%E6%97%A5%E5%B8%B8"
    );
    expect(parseCatalogUrlSearch("").q).toBe("");
    expect(parseCatalogUrlSearch("kind=nope").kinds).toEqual([]);
  });

  it("lists series options scoped by kind", () => {
    const all = catalogSeriesOptions();
    expect(all.length).toBeGreaterThan(5);
    const tools = catalogSeriesOptions(samCatalog, ["tool"]);
    expect(tools.every(s => samCatalog.some(e => e.kind === "tool" && e.series === s))).toBe(
      true
    );
  });

  it("builds absolute share hrefs for open and browse", () => {
    const entry = getCatalogEntry("pg-breakout")!;
    expect(samOpenShareHref(entry)).toBe(
      "https://go.samkuo.me/s/pg-breakout"
    );
    expect(samOpenShareHref(entry, "https://go.example.test")).toBe(
      "https://go.example.test/s/pg-breakout"
    );
    expect(
      catalogBrowseShareHref(
        { q: "hash", kinds: ["tool"], series: [] },
        PLAYGROUNDS_CANONICAL_ORIGIN
      )
    ).toBe("https://play.samkuo.me/sam/?q=hash&kind=tool");
    expect(
      catalogBrowseShareHref(
        { q: "", kinds: [], series: [] },
        PLAYGROUNDS_CANONICAL_ORIGIN
      )
    ).toBe("https://play.samkuo.me/sam/");
  });
});
