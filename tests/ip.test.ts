import { describe, it, expect } from "vitest";
import { ipDe } from "@/lib/auth/ip";

const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;
describe("IP do cliente (anti-falsificação do X-Forwarded-For)", () => {
  it("usa o último item (anexado pelo proxy), não o primeiro (controlado pelo cliente)", () => {
    expect(ipDe(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(ipDe(h({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 198.51.100.4" }))).toBe("198.51.100.4");
  });
  it("sem proxy usa X-Real-IP; sem nada, valor neutro", () => {
    expect(ipDe(h({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(ipDe(h({}))).toBe("0.0.0.0");
  });
  it("aceita IPv6 e recusa lixo (injeção em log/SQL)", () => {
    expect(ipDe(h({ "x-forwarded-for": "2001:db8::1" }))).toBe("2001:db8::1");
    for (const ruim of ["'; DROP TABLE users;--", "<script>", "a".repeat(80), ""]) expect(ipDe(h({ "x-forwarded-for": ruim }))).toBe("0.0.0.0");
  });
  it("forjar o cabeçalho não permite burlar o limite: o IP efetivo é o do proxy", () => {
    const a = ipDe(h({ "x-forwarded-for": "9.9.9.1, 203.0.113.50" })), b = ipDe(h({ "x-forwarded-for": "9.9.9.2, 203.0.113.50" }));
    expect(a).toBe(b);
  });
});
