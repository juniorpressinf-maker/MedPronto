import { randomSecret } from "./crypto.js";

/** Muda a cada subida do backend — invalida cookies de execuções anteriores. */
export const SERVER_BOOT_ID = randomSecret();

export function getServerBootId(): string {
  return SERVER_BOOT_ID;
}
