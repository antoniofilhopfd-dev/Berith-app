import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { closePool, execute, query } from "@/lib/db";
import { buscarJson, extrair, ipPrivado, itensDoJson, limparTexto, montarUrl, validarDestino } from "@/lib/liturgia/importador";
import { importar, importarAgora, getProvedor, salvarProvedor, testarProvedor } from "@/lib/services/liturgia-importacao";
import { salvarItem, itensDoDia } from "@/lib/services/liturgia";
import { itemLiturgiaSchema, provedorSchema } from "@/lib/validation/liturgia";
import { ForbiddenError } from "@/lib/permissions";
import { DomainError } from "@/lib/services/errors";
import { addDays, todayLocal } from "@/lib/time";
import { resetTestDb, criarUsuario, criarUnidade, darPapel, vincular } from "./helpers";

const hoje = todayLocal();
const mapa = { evangelho: { titulo: "leituras.evangelho.0.referencia", texto: "leituras.evangelho.0.texto" }, santo: { titulo: "santo.nome" } };
const json = (d: string) => ({ data: d, leituras: { evangelho: [{ referencia: `Ref do dia ${d}`, texto: "<p>Texto &amp; <b>negrito</b></p><script>alert(1)</script>" }] }, santo: { nome: "Santo de teste" } });

describe("extração e limpeza", () => {
  it("segue caminhos com pontos e índices; ausente vira undefined", () => {
    expect(extrair(json("x"), "leituras.evangelho.0.referencia")).toBe("Ref do dia x");
    expect(extrair(json("x"), "leituras.evangelho.5.referencia")).toBeUndefined();
    expect(extrair(json("x"), "santo.nome.inexistente")).toBeUndefined();
    expect(extrair(null, "a.b")).toBeUndefined();
  });
  it("não atravessa __proto__/constructor (poluição de protótipo)", () => {
    for (const c of ["__proto__.polluted", "constructor.prototype.x", "a.__proto__", "toString"]) expect(extrair({ a: {} }, c)).toBeUndefined();
    expect(({} as any).polluted).toBeUndefined();
  });
  it("converte HTML em texto puro, decodifica entidades, remove script/estilo e limita o tamanho", () => {
    const t = limparTexto("<p>Olá &amp; <b>paz</b></p><style>x{}</style><script>alert(1)</script>Linha<br>dois &lt;3 &quot;ok&quot;", 1000)!;
    expect(t).toBe('Olá & paz\n\nLinhadois <3 "ok"'.replace("Linhadois", "Linha\ndois"));
    expect(t).not.toMatch(/<\/?(p|b|script|style)\b|alert\(/);
    expect(limparTexto("a".repeat(500), 50)).toHaveLength(50);
    expect(limparTexto(["um", "dois", 3 as unknown as string], 100)).toBe("um\n\ndois");
    expect(limparTexto({ x: 1 }, 10)).toBeNull(); expect(limparTexto("   ", 10)).toBeNull(); expect(limparTexto(42, 10)).toBe("42");
  });
  it("só copia o texto quando permitido; tipos sem título na data são ignorados", () => {
    const sem = itensDoJson(json("d"), mapa, false), com = itensDoJson(json("d"), mapa, true);
    expect(sem.find((i) => i.tipo === "evangelho")).toEqual({ tipo: "evangelho", titulo: "Ref do dia d", texto: null });
    expect(com.find((i) => i.tipo === "evangelho")!.texto).toContain("Texto & negrito");
    expect(itensDoJson({ santo: {} }, mapa, true)).toEqual([]);
  });
  it("monta a URL com a data", () => {
    expect(montarUrl("https://x.org/{aaaa}/{mm}/{dd}?d={data}", "2026-10-09")).toBe("https://x.org/2026/10/09?d=2026-10-09");
  });
});

describe("proteção contra SSRF", () => {
  it("reconhece endereços privados, locais e reservados", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.1.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "0.0.0.0", "100.64.0.1", "224.0.0.1", "::1", "fe80::1", "fc00::1", "fd12::1", "::ffff:127.0.0.1", "::ffff:10.1.1.1", "999.1.1.1"]) expect(ipPrivado(ip), ip).toBe(true);
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "203.0.113.5", "2606:4700:4700::1111"]) expect(ipPrivado(ip), ip).toBe(false);
  });
  it("recusa http, credenciais na URL, portas fora do padrão e nomes que resolvem para rede interna", async () => {
    const pub = async () => ["93.184.216.34"], priv = async () => ["10.0.0.7"], misto = async () => ["93.184.216.34", "127.0.0.1"];
    expect((await validarDestino("https://exemplo.org/x", pub)).ip).toBe("93.184.216.34");
    await expect(validarDestino("http://exemplo.org/x", pub)).rejects.toThrow(/HTTPS/);
    await expect(validarDestino("https://user:pw@exemplo.org/x", pub)).rejects.toThrow(/usuário/);
    await expect(validarDestino("https://exemplo.org:8443/x", pub)).rejects.toThrow(/Porta/);
    await expect(validarDestino("https://interno.exemplo.org/x", priv)).rejects.toThrow(/rede interna/);
    await expect(validarDestino("https://rebind.exemplo.org/x", misto)).rejects.toThrow(/rede interna/);
    await expect(validarDestino("https://169.254.169.254/latest/meta-data", pub)).rejects.toThrow(/rede interna/);
    await expect(validarDestino("https://[::1]/x", pub)).rejects.toThrow(/rede interna/);
    await expect(validarDestino("https://127.0.0.1/x", pub)).rejects.toThrow(/rede interna/);
    await expect(validarDestino("não é url", pub)).rejects.toThrow(/inválido/);
    await expect(validarDestino("https://nao-resolve.exemplo.org", async () => { throw new Error("x"); })).rejects.toThrow(/resolver/);
  });
  it("sem a chave de desenvolvimento, localhost é recusado de verdade (busca real)", async () => {
    delete process.env.LITURGIA_PERMITIR_REDE_LOCAL;
    await expect(buscarJson("http://127.0.0.1:9/x")).rejects.toThrow(/HTTPS/);
    await expect(buscarJson("https://127.0.0.1/x")).rejects.toThrow(/rede interna/);
  });
});

describe("busca HTTP (servidor local de teste, com a chave de desenvolvimento)", () => {
  let srv: http.Server, base = "";
  beforeAll(async () => {
    srv = http.createServer((req, res) => {
      const u = new URL(req.url!, "http://x");
      if (u.pathname === "/ok") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(json(u.searchParams.get("d") ?? ""))); }
      else if (u.pathname === "/html") res.end("<html>não é json</html>");
      else if (u.pathname === "/erro") { res.statusCode = 503; res.end("{}"); }
      else if (u.pathname === "/redir") { res.statusCode = 302; res.setHeader("Location", "/ok?d=redirecionado"); res.end(); }
      else if (u.pathname === "/laco") { res.statusCode = 302; res.setHeader("Location", "/laco"); res.end(); }
      else if (u.pathname === "/grande") { res.setHeader("Content-Type", "application/json"); res.end('{"x":"' + "a".repeat(1_200_000) + '"}'); }
      else { res.statusCode = 404; res.end(); }
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    process.env.LITURGIA_PERMITIR_REDE_LOCAL = "1";
  });
  afterAll(() => { delete process.env.LITURGIA_PERMITIR_REDE_LOCAL; srv.close(); });
  it("busca e interpreta JSON, segue 1 redirecionamento validado", async () => {
    expect(((await buscarJson(`${base}/ok?d=2026-01-02`)) as any).data).toBe("2026-01-02");
    expect(((await buscarJson(`${base}/redir`)) as any).data).toBe("redirecionado");
  });
  it("falha de forma clara: não-JSON, erro HTTP, laço de redirecionamento, resposta enorme, 404", async () => {
    await expect(buscarJson(`${base}/html`)).rejects.toThrow(/JSON/);
    await expect(buscarJson(`${base}/erro`)).rejects.toThrow(/erro 503/);
    await expect(buscarJson(`${base}/laco`)).rejects.toThrow(/Redirecionamentos/);
    await expect(buscarJson(`${base}/grande`)).rejects.toThrow();
    await expect(buscarJson(`${base}/nada`)).rejects.toThrow(/404/);
  });
  it("expõe o endereço para os testes de serviço", () => { expect(base).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/); (globalThis as any).__base = base; });
});

describe("validação da configuração", () => {
  const ok = { fonteNome: "Fonte X", urlTemplate: "https://exemplo.org/api?d={data}", mapeamento: JSON.stringify(mapa), copiarTexto: "", direitosConfirmados: "", diasAFrente: "2", ativo: "on" };
  it("aceita configuração válida", () => { const p = provedorSchema.parse(ok); expect(p.mapeamento.santo!.titulo).toBe("santo.nome"); expect(p.ativo).toBe(true); });
  it("recusa mapeamento inválido, tipo desconhecido e caminhos suspeitos", () => {
    for (const m of ["não json", "{}", "[]", JSON.stringify({ inventado: { titulo: "a" } }), JSON.stringify({ santo: { titulo: "a b;drop" } }), JSON.stringify({ santo: { titulo: "a", extra: "x" } }), JSON.stringify({ santo: {} })])
      expect(() => provedorSchema.parse({ ...ok, mapeamento: m }), m).toThrow();
  });
  it("copiar o texto exige confirmar a autorização de uso", () => {
    expect(() => provedorSchema.parse({ ...ok, copiarTexto: "on" })).toThrow(/autorização/);
    expect(provedorSchema.parse({ ...ok, copiarTexto: "on", direitosConfirmados: "on" }).copiarTexto).toBe(true);
  });
  it("recusa URL inválida e limita dias", () => {
    expect(() => provedorSchema.parse({ ...ok, urlTemplate: "ftp://x.org" })).toThrow(); expect(() => provedorSchema.parse({ ...ok, urlTemplate: "lixo" })).toThrow();
    expect(() => provedorSchema.parse({ ...ok, diasAFrente: "30" })).toThrow();
  });
});

describe("importação (serviço)", () => {
  let admin = 0, com = 0, coord = 0, membro = 0;
  const cfg = (o: Record<string, unknown> = {}) => provedorSchema.parse({ fonteNome: "Fonte de teste (API)", fonteUrlPublica: "https://exemplo.org", urlTemplate: "https://api.exemplo.org/l?d={data}", mapeamento: JSON.stringify(mapa), copiarTexto: "on", direitosConfirmados: "on", diasAFrente: "1", ativo: "on", ...o });
  const falso = (chamadas: string[] = []) => async (url: string) => { chamadas.push(url); return json(new URL(url).searchParams.get("d")!); };
  beforeAll(async () => {
    await resetTestDb(); admin = await criarUsuario("a@t.com"); com = await criarUsuario("c@t.com"); coord = await criarUsuario("co@t.com"); membro = await criarUsuario("m@t.com");
    await darPapel(admin, "admin_geral"); await darPapel(com, "resp_comunicacao"); const u = await criarUnidade("ministerio", "M"); await darPapel(coord, "coord_ministerio", u); await vincular(membro, u);
  });
  afterEach(async () => { await execute("DELETE FROM liturgia_itens"); await execute("DELETE FROM liturgia_provedor"); });

  it("somente quem edita conteúdos configura, testa e importa", async () => {
    for (const u of [membro, coord]) {
      await expect(getProvedor(u)).rejects.toThrow(ForbiddenError); await expect(salvarProvedor(u, cfg())).rejects.toThrow(ForbiddenError);
      await expect(testarProvedor(u, cfg(), hoje, falso())).rejects.toThrow(ForbiddenError); await expect(importarAgora(u, falso())).rejects.toThrow(ForbiddenError);
    }
    await salvarProvedor(com, cfg()); expect((await getProvedor(admin))!.fonte_nome).toBe("Fonte de teste (API)");
  });
  it("a prévia busca e extrai SEM gravar nada", async () => {
    const r = await testarProvedor(com, cfg(), hoje, falso());
    expect(r.itens.map((i) => i.tipo).sort()).toEqual(["evangelho", "santo"]); expect(r.url).toContain(`d=${hoje}`);
    expect(await query<any>("SELECT id FROM liturgia_itens")).toEqual([]); expect(await query<any>("SELECT id FROM liturgia_provedor")).toEqual([]);
    await expect(testarProvedor(com, cfg({ mapeamento: JSON.stringify({ salmo: { titulo: "nao.existe" } }) }), hoje, falso())).rejects.toThrow(/nenhum campo/);
    await expect(testarProvedor(com, cfg(), hoje, async () => { throw new Error("A fonte respondeu com erro 500."); })).rejects.toThrow(DomainError);
  });
  it("importa hoje e os dias à frente, registrando a fonte e o aviso de direitos em cada item", async () => {
    await salvarProvedor(com, cfg()); const chamadas: string[] = [];
    const r = await importar({ forcar: true, buscador: falso(chamadas) });
    expect(r).toMatchObject({ executado: true, criados: 4, atualizados: 0, preservados: 0, erros: [] }); expect(chamadas).toHaveLength(2);
    const it = (await itensDoDia(hoje)).find((i) => i.tipo === "evangelho")!;
    expect(it).toMatchObject({ titulo: `Ref do dia ${hoje}`, fonte_nome: "Fonte de teste (API)", fonte_url: "https://exemplo.org" });
    expect(it.texto).toContain("Texto & negrito"); expect(it.texto).not.toMatch(/<|alert/); expect(it.direitos).toMatch(/autorizada/);
    expect((await itensDoDia(addDays(hoje, 1))).length).toBe(2);
  });
  it("reimportar atualiza o que veio da importação; cadastro MANUAL é preservado", async () => {
    await salvarProvedor(com, cfg({ diasAFrente: "0" }));
    await salvarItem(admin, itemLiturgiaSchema.parse({ data: hoje, tipo: "santo", titulo: "Cadastrado à mão", fonteNome: "Cadastro manual" }));
    const r1 = await importar({ forcar: true, buscador: falso() }); expect(r1).toMatchObject({ criados: 1, preservados: 1 });
    expect((await itensDoDia(hoje)).find((i) => i.tipo === "santo")).toMatchObject({ titulo: "Cadastrado à mão", fonte_nome: "Cadastro manual" });
    const r2 = await importar({ forcar: true, buscador: async () => ({ leituras: { evangelho: [{ referencia: "Referência corrigida" }] } }) });
    expect(r2).toMatchObject({ criados: 0, atualizados: 1 }); expect((await itensDoDia(hoje)).find((i) => i.tipo === "evangelho")!.titulo).toBe("Referência corrigida");
  });
  it("sem copiar texto (ou sem direitos confirmados no banco) NUNCA grava o texto", async () => {
    await salvarProvedor(com, cfg({ copiarTexto: "", direitosConfirmados: "", diasAFrente: "0" }));
    await importar({ forcar: true, buscador: falso() });
    const e = (await itensDoDia(hoje)).find((i) => i.tipo === "evangelho")!; expect(e.texto).toBeNull(); expect(e.direitos).toMatch(/Apenas referência/);
    await execute("DELETE FROM liturgia_itens"); await execute("UPDATE liturgia_provedor SET copiar_texto = 1, direitos_confirmados = 0");
    await importar({ forcar: true, buscador: falso() });
    expect((await itensDoDia(hoje)).find((i) => i.tipo === "evangelho")!.texto).toBeNull(); // defesa em profundidade
  });
  it("limita a 1 execução a cada 6 horas, a menos que forçada; desativada não executa", async () => {
    await salvarProvedor(com, cfg({ diasAFrente: "0" })); const c: string[] = [];
    expect((await importar({ buscador: falso(c) })).executado).toBe(true);
    expect(await importar({ buscador: falso(c) })).toMatchObject({ executado: false, motivo: expect.stringMatching(/6 horas/) }); expect(c).toHaveLength(1);
    expect((await importar({ forcar: true, buscador: falso(c) })).executado).toBe(true);
    await salvarProvedor(com, cfg({ ativo: "" })); expect(await importar({ forcar: true, buscador: falso(c) })).toMatchObject({ executado: false, motivo: "Importação desativada." });
  });
  it("erro da fonte é registrado no status e não derruba a execução", async () => {
    await salvarProvedor(com, cfg({ diasAFrente: "1" }));
    let n = 0; const r = await importar({ forcar: true, buscador: async (u) => { if (n++ === 0) throw new Error("A fonte respondeu com erro 500."); return json(new URL(u).searchParams.get("d")!); } });
    expect(r.criados).toBe(2); expect(r.erros).toHaveLength(1);
    expect((await getProvedor(admin))!.ultimo_status).toMatch(/1 erro/);
  });
  it("sem configuração, a importação não faz nada", async () => { expect((await importar({ forcar: true })).executado).toBe(false); });
  it("a configuração fica auditada sem expor segredos (só o host da fonte)", async () => {
    await salvarProvedor(com, cfg());
    const a = (await query<any>("SELECT detalhes FROM audit_log WHERE acao = 'liturgia.provedor_salvar'"))[0].detalhes;
    expect(a).toContain("api.exemplo.org"); expect(a).not.toContain("?d=");
  });
});
