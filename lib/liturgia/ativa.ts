/** A área de liturgia fica oculta até `LITURGIA_ATIVA=1` (código e dados são preservados). */
export const liturgiaAtiva = () => process.env.LITURGIA_ATIVA === "1";
