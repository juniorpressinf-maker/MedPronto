/** Login de acesso ao MedPronto — nunca um endereço de e-mail. */
export function loginPareceEmail(valor: string): boolean {
  return valor.trim().includes("@");
}

export const LOGIN_NAO_EMAIL_MSG =
  "Não use o e-mail da clínica como usuário. Defina um login (ex.: admin). O e-mail será cadastrado na tela da clínica, só para recuperar senha.";
