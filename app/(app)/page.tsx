import { getSessionUser } from "@/lib/auth/session";

export default async function Inicio() {
  const user = (await getSessionUser())!;
  const primeiroNome = user.nome.split(" ")[0];
  return (
    <section className="space-y-4">
      <h1 className="font-titulo text-2xl text-vinho">Paz e bem, {primeiroNome}!</h1>
      <div className="rounded-2xl border border-borda bg-cartao p-4">
        <h2 className="font-medium">Próximos eventos</h2>
        <p className="mt-1 text-sm text-tinta/60">Nenhum evento disponível para você no momento.</p>
      </div>
      <div className="rounded-2xl border border-borda bg-cartao p-4">
        <h2 className="font-medium">Comunicados</h2>
        <p className="mt-1 text-sm text-tinta/60">Nenhum comunicado para você no momento.</p>
      </div>
    </section>
  );
}
