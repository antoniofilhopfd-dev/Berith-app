import { notFound } from "next/navigation";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { getUnit, listUnitMembers, listUnits } from "@/lib/services/estruturas";
import { can } from "@/lib/permissions";
import { listRoles } from "@/lib/services/papeis";
import { query } from "@/lib/db";
import { NotFoundError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/permissions";
import { PAPEL_LABEL, TIPO_LABEL, formatDate } from "@/lib/format";
import { Badge, Card, Empty } from "@/components/ui";
import { ActionForm, Field, inputCls } from "@/components/action-form";
import {
  adicionarIntegranteAction, atribuirPapelAction, desativarEstruturaAction, editarEstruturaAction,
  encerrarVinculoAction, revogarPapelAction, transferirAction,
} from "../actions";
import type { RowDataPacket } from "mysql2/promise";

export default async function EstruturaDetalhe({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  let unit;
  try { unit = await getUnit(user.id, id); } catch (e) {
    if (e instanceof NotFoundError || e instanceof ForbiddenError) notFound();
    throw e;
  }
  const [verMembros, editar, gerirInteg, permissoes] = await Promise.all([
    can(user.id, "membros", "ver", id), can(user.id, "estruturas", "editar", id),
    can(user.id, "estruturas", "integrantes", id), can(user.id, "estruturas", "permissoes", id),
  ]);
  const membros = verMembros ? await listUnitMembers(user.id, id) : [];
  const destinos = gerirInteg ? (await listUnits(user.id)).filter((u) => u.ativo && u.id !== id) : [];
  const papeis = permissoes ? await query<RowDataPacket>(
    `SELECT ur.id, r.codigo, u.nome FROM user_roles ur JOIN roles r ON r.id = ur.role_id JOIN users u ON u.id = ur.user_id
     WHERE ur.scope_unit_id = ? ORDER BY r.nome, u.nome`, [id]) : [];
  const roles = permissoes ? (await listRoles()).filter((r) => !r.e_global) : [];
  return (
    <div className="space-y-4">
      <Link href="/estruturas" className="inline-flex min-h-11 items-center text-sm text-vinho">← Estruturas</Link>
      <header>
        <Badge>{TIPO_LABEL[unit.tipo]}</Badge>
        <h1 className="mt-1 font-titulo text-2xl text-vinho">{unit.nome}</h1>
        {unit.parent_nome && <p className="text-sm text-tinta/60">Subordinada a {unit.parent_nome}</p>}
        {unit.descricao && <p className="mt-2 text-sm">{unit.descricao}</p>}
        {!unit.ativo && <p className="mt-2 text-sm font-medium text-red-700">Estrutura desativada</p>}
      </header>

      {verMembros && (
        <Card title={`Integrantes (${membros.length})`}>
          {membros.length === 0 ? <Empty>Nenhum integrante vinculado.</Empty> : (
            <ul className="divide-y divide-borda">
              {membros.map((m) => (
                <li key={m.membership_id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/membros/${m.user_id}`} className="font-medium text-vinho">{m.nome}</Link>
                    <p className="text-xs text-tinta/60">{m.funcao ?? "Integrante"} · desde {formatDate(m.inicio)}</p>
                  </div>
                  {gerirInteg && (
                    <div className="flex w-full flex-wrap items-center gap-2">
                      {destinos.length > 0 && (
                        <ActionForm action={transferirAction} submit="Transferir" className="flex w-full items-center gap-2 space-y-0">
                          <input type="hidden" name="userId" value={m.user_id} />
                          <input type="hidden" name="fromUnit" value={id} />
                          <select name="toUnit" aria-label="Destino" className={inputCls + " min-w-0 flex-1"}>
                            {destinos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
                          </select>
                        </ActionForm>
                      )}
                      <ActionForm action={encerrarVinculoAction} submit="Remover" danger className="space-y-0">
                        <input type="hidden" name="membershipId" value={m.membership_id} />
                      </ActionForm>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {gerirInteg && unit.ativo && (
        <Card title="Adicionar integrante">
          <p className="mb-2 text-xs text-tinta/60">Informe o e-mail de uma pessoa já cadastrada e ativa.</p>
          <ActionForm action={adicionarIntegranteAction} submit="Adicionar">
            <input type="hidden" name="unitId" value={id} />
            <Field label="E-mail"><input name="email" type="email" required className={inputCls} /></Field>
            <Field label="Função (opcional)"><input name="funcao" maxLength={80} className={inputCls} placeholder="Ex.: Tesoureiro" /></Field>
          </ActionForm>
        </Card>
      )}

      {permissoes && (
        <Card title="Coordenações e responsáveis">
          {papeis.length === 0 ? <Empty>Nenhuma função atribuída nesta estrutura.</Empty> : (
            <ul className="mb-3 divide-y divide-borda">
              {papeis.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span><strong>{p.nome}</strong> — {PAPEL_LABEL[p.codigo] ?? p.codigo}</span>
                  <ActionForm action={revogarPapelAction} submit="Revogar" danger className="space-y-0">
                    <input type="hidden" name="userRoleId" value={p.id} />
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={atribuirPapelAction} submit="Atribuir função">
            <input type="hidden" name="unitId" value={id} />
            <Field label="E-mail da pessoa"><input name="email" type="email" required className={inputCls} /></Field>
            <Field label="Função">
              <select name="codigo" className={inputCls}>
                {roles.map((r) => <option key={r.codigo} value={r.codigo}>{PAPEL_LABEL[r.codigo] ?? r.nome}</option>)}
              </select>
            </Field>
          </ActionForm>
        </Card>
      )}

      {editar && (
        <Card title="Editar estrutura">
          <ActionForm action={editarEstruturaAction} submit="Salvar" resetOnOk={false}>
            <input type="hidden" name="id" value={id} />
            <Field label="Nome"><input name="nome" defaultValue={unit.nome} required className={inputCls} /></Field>
            <Field label="Descrição"><textarea name="descricao" defaultValue={unit.descricao ?? ""} rows={2} className={inputCls + " resize-none py-2"} /></Field>
          </ActionForm>
          {unit.ativo && (
            <ActionForm action={desativarEstruturaAction} submit="Desativar estrutura" danger className="mt-3">
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
