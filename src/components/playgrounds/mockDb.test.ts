import { describe, expect, it, beforeEach } from "vitest";
import {
  clearMockDbStore,
  createMockDb,
  resetMockDbMemoryForTests,
} from "./mockDb";

describe("mockDb", () => {
  beforeEach(() => {
    resetMockDbMemoryForTests();
  });

  it("runs prepare / all / first", async () => {
    const db = createMockDb("db-test-1");
    await db.exec(
      "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO t (name) VALUES ('a'), ('b');"
    );
    const all = await db.prepare("SELECT name FROM t ORDER BY id").all<{
      name: string;
    }>();
    expect(all.success).toBe(true);
    expect(all.results.map(r => r.name)).toEqual(["a", "b"]);
    const first = await db
      .prepare("SELECT name FROM t WHERE id = ?")
      .bind(2)
      .first<{ name: string }>();
    expect(first?.name).toBe("b");
  });

  it("isolates per sandbox and clears", async () => {
    const a = createMockDb("db-test-2");
    await a.exec("CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (1);");
    await clearMockDbStore("db-test-2");

    const b = createMockDb("db-test-3");
    await b.exec("CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (9);");
    const again = createMockDb("db-test-3");
    const row = await again.prepare("SELECT id FROM t").first<{ id: number }>();
    expect(row?.id).toBe(9);
  });
});
