import { afterEach, describe, expect, it } from "vitest";
import {
  clearAdmittedCapabilities,
  getAdmittedCapabilities,
  hydrateAdmittedFromMeta,
  resolveAdmittedCapabilities,
  setAdmittedCapabilities,
} from "./admittedCapabilities";

describe("admittedCapabilities resolve／hydrate", () => {
  afterEach(() => {
    clearAdmittedCapabilities("adm-test");
  });

  it("resolveAdmittedCapabilities reloads from disk when memory empty", async () => {
    clearAdmittedCapabilities("adm-test");
    const admitted = await resolveAdmittedCapabilities("adm-test", async () => ({
      admittedCapabilities: ["compute:python"],
    }));
    expect(admitted).toEqual(["compute:python"]);
    expect(getAdmittedCapabilities("adm-test")).toEqual(["compute:python"]);
  });

  it("resolveAdmittedCapabilities prefers non-empty memory", async () => {
    setAdmittedCapabilities("adm-test", ["compute:cmd"]);
    const admitted = await resolveAdmittedCapabilities("adm-test", async () => ({
      admittedCapabilities: ["compute:python"],
    }));
    expect(admitted).toEqual(["compute:cmd"]);
  });

  it("hydrate does not wipe memory with stale empty meta", () => {
    setAdmittedCapabilities("adm-test", ["compute:python"]);
    hydrateAdmittedFromMeta({ id: "adm-test", admittedCapabilities: [] });
    expect(getAdmittedCapabilities("adm-test")).toEqual(["compute:python"]);
  });

  it("hydrate applies non-empty disk over memory", () => {
    setAdmittedCapabilities("adm-test", ["compute:cmd"]);
    hydrateAdmittedFromMeta({
      id: "adm-test",
      admittedCapabilities: ["compute:python"],
    });
    expect(getAdmittedCapabilities("adm-test")).toEqual(["compute:python"]);
  });
});
