import bcrypt from "bcryptjs";

const COST = 12;
// Hash fixo para igualar o tempo de resposta quando o e-mail não existe.
const DUMMY = bcrypt.hashSync("senha-ficticia-para-tempo-constante", COST);

export const hashPassword = (senha: string) => bcrypt.hash(senha, COST);
export const verifyPassword = (senha: string, hash: string) => bcrypt.compare(senha, hash);
export const verifyDummy = (senha: string) => bcrypt.compare(senha, DUMMY);
