import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("E-mail inválido").max(190);
export const senhaNovaSchema = z
  .string()
  .min(10, "A senha deve ter ao menos 10 caracteres")
  .max(128, "A senha é muito longa")
  .refine((s) => /[a-zA-Z]/.test(s) && /\d/.test(s), "Use letras e números");

export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1, "Informe a senha").max(128),
});
