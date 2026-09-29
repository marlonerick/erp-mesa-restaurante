// Tamanhos de senha (RN-AUTH-08), num lugar só: regra de domínio, validação do servidor e campo da
// tela usam os mesmos números. O máximo segue a recomendação do NIST (aceitar ao menos 64) e impede
// que alguém envie textos enormes para o cálculo do hash.
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
