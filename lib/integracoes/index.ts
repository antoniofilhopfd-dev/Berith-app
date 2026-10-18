import type { Rede } from "@/lib/editorial";
import { facebook, instagram } from "./meta";
import { tiktok } from "./tiktok";
import { youtube } from "./youtube";
import type { Provedor } from "./tipos";

let registro: Record<Rede, Provedor> = { instagram, facebook, tiktok, youtube };
export const provedor = (r: Rede): Provedor => registro[r];
/** Somente testes: substitui provedores por simulações locais. */
export function definirProvedores(p: Partial<Record<Rede, Provedor>> | null) {
  registro = p ? { ...registro, ...p } : { instagram, facebook, tiktok, youtube };
}
export type { Provedor };
