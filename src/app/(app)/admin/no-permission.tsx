/** Tela para quem abre um endereço de administração sem ter o perfil (o servidor já bloqueou). */
export function NoPermission() {
  return (
    <div className="flex max-w-xl flex-col gap-2">
      <h1 className="text-3xl font-bold">Sem permissão</h1>
      <p className="text-lg">
        Seu perfil não tem acesso a esta tela. Fale com o gerente se precisar.
      </p>
    </div>
  );
}
