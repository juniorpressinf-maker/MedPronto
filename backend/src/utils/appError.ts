/** Erro com status HTTP: o errorHandler devolve `{ error: message }` com esse status. */
export class AppError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}
