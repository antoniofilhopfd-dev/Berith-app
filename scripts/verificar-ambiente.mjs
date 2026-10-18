// Verifica se o servidor está pronto para produção. Uso:  npm run verificar   (lê as variáveis do ambiente)
// Não imprime segredos. Sai com código 1 se algo CRÍTICO falhar.
import { createHash } from "node:crypto";
import { access, constants, mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import mysql from "mysql2/promise";

const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRACOS = ["dev-only", "troque", "gere-com", "exemplo", "changeme", "senha", "secret-secret"];

export async function verificar(env = process.env, opcoes = {}) {
  const r = [];
  const add = (nome, ok, detalhe = "", critico = true) => r.push({ nome, ok, detalhe, critico });
  const major = Number(process.versions.node.split(".")[0]);
  add("Node.js 20 ou superior", major >= 20, `v${process.versions.node}`);
  add("NODE_ENV=production", env.NODE_ENV === "production", `atual: ${env.NODE_ENV ?? "(vazio)"}`, false);
  for (const k of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) add(`${k} definida`, Boolean(env[k]));
  const s = env.SESSION_SECRET ?? "";
  add("SESSION_SECRET com 48+ caracteres", s.length >= 48, `${s.length} caracteres`);
  add("SESSION_SECRET não parece valor de exemplo", !FRACOS.some((f) => s.toLowerCase().includes(f)) && /[A-Z]/.test(s + "A") );
  add("Senha do banco não é a de exemplo", !FRACOS.some((f) => (env.DB_PASSWORD ?? "").toLowerCase().includes(f)));
  add("CRON_SECRET com 24+ caracteres (agendador/push)", (env.CRON_SECRET ?? "").length >= 24, "", false);
  add("TOKEN_ENC_KEY com 32+ caracteres (cifra dos tokens das redes)", (env.TOKEN_ENC_KEY ?? "").length >= 32, "necessária só para conectar redes sociais", false);
  add("TOKEN_ENC_KEY não parece valor de exemplo", !env.TOKEN_ENC_KEY || !FRACOS.some((f) => env.TOKEN_ENC_KEY.toLowerCase().includes(f)), "", false);
  add("Web Push configurado (VAPID)", Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT), "opcional", false);
  add("E-mail (SMTP) configurado", Boolean(env.SMTP_HOST && env.SMTP_FROM), "sem SMTP, links de senha/convite são entregues manualmente", false);
  add("APP_URL usa HTTPS", /^https:\/\//.test(env.APP_URL ?? ""), env.APP_URL ? "" : "ausente: links usam o host da requisição", false);

  const dir = path.resolve(env.STORAGE_DIR || path.join(raiz, "storage"));
  try {
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const teste = path.join(dir, `.verificacao-${process.pid}`);
    await writeFile(teste, "ok"); await unlink(teste);
    add("Diretório de arquivos privados gravável", true, dir);
  } catch (e) { add("Diretório de arquivos privados gravável", false, `${dir}: ${e.code ?? e.message}`); }
  add("Arquivos privados fora de public/", !dir.startsWith(path.join(raiz, "public")));

  let conn = opcoes.conn;
  try {
    if (!conn && env.DB_HOST) conn = await mysql.createConnection({ host: env.DB_HOST, port: Number(env.DB_PORT ?? 3306), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD });
    if (conn) {
      await conn.query("SELECT 1");
      add("Conexão com o MySQL", true);
      const [[v]] = await conn.query("SELECT VERSION() v");
      add("Versão do banco", true, String(v.v), false);
      const arquivos = (await readdir(path.join(raiz, "db", "migrations"))).filter((f) => f.endsWith(".sql")).sort();
      const [rows] = await conn.query("SELECT id, checksum, resultado FROM schema_migrations").catch(() => [[]]);
      const aplicadas = new Map(rows.map((x) => [x.id, x]));
      const faltando = [], divergentes = [], falhas = [];
      for (const f of arquivos) {
        const id = f.replace(/\.sql$/, ""); const a = aplicadas.get(id);
        const sum = createHash("sha256").update((await readFile(path.join(raiz, "db", "migrations", f), "utf8")).replace(/\r\n/g, "\n")).digest("hex");
        if (!a) faltando.push(id); else if (a.resultado !== "ok") falhas.push(id); else if (a.checksum !== sum) divergentes.push(id);
      }
      add("Migrações aplicadas", faltando.length === 0, faltando.length ? `pendentes: ${faltando.join(", ")} (serão aplicadas ao iniciar o app)` : `${arquivos.length} aplicadas`, false);
      add("Nenhuma migração com falha", falhas.length === 0, falhas.join(", "));
      add("Migrações aplicadas não foram editadas", divergentes.length === 0, divergentes.join(", "));
      const [[adm]] = await conn.query("SELECT COUNT(*) n FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id WHERE r.codigo = 'admin' AND u.status = 'ativo'").catch(() => [[{ n: 0 }]]);
      add("Existe administrador ativo", Number(adm.n) > 0, "crie com: npm run admin:sql", false);
    } else add("Conexão com o MySQL", false, "variáveis ausentes");
  } catch (e) { add("Conexão com o MySQL", false, e.code ?? e.message); }
  finally { if (conn && !opcoes.conn) await conn.end(); }
  return r;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const r = await verificar();
  for (const x of r) console.log(`${x.ok ? "OK    " : x.critico ? "FALHA " : "AVISO "} ${x.nome}${x.detalhe ? ` — ${x.detalhe}` : ""}`);
  const falhas = r.filter((x) => !x.ok && x.critico);
  console.log(falhas.length ? `\n${falhas.length} item(ns) crítico(s) a corrigir antes de publicar.` : "\nNenhum item crítico pendente.");
  process.exit(falhas.length ? 1 : 0);
}
