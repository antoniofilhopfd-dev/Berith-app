/** Erro de regra de negócio com mensagem segura para exibir ao usuário. */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}
export class NotFoundError extends Error {
  constructor() {
    super("Não encontrado.");
    this.name = "NotFoundError";
  }
}
