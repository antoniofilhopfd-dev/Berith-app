import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/auth/constants";

describe("destino pós-login (open redirect)", () => {
  it("aceita caminhos internos", () => {
    expect(safeNext("/checkin/abc.def")).toBe("/checkin/abc.def");
    expect(safeNext("/eventos/3?d=2026-10-12")).toBe("/eventos/3?d=2026-10-12");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "evil", "", "/a\r\nSet-Cookie: x=1", undefined, null, 42])("recusa %j", (v) => {
    expect(safeNext(v)).toBe("/");
  });
  it("recusa destinos gigantes", () => expect(safeNext("/" + "a".repeat(500))).toBe("/"));
});
