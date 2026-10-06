# Administrador (dono) — preparar o sistema para o piloto

O técnico cria o primeiro administrador na instalação. Depois, tudo é feito pelas telas, nesta
ordem (é o mesmo caminho testado automaticamente antes de cada publicação):

1. **Administração → Empresa**: razão social, nome fantasia, CNPJ.
2. **Administração → Lojas**: confira a loja. Configure a **taxa de serviço** (padrão 10%), a
   **virada do dia** (05:00 — vendas depois da meia-noite contam no dia anterior até esse horário),
   a política de **estoque negativo** e quantos **caixas abertos** a loja aceita.
3. **Administração → Terminais**: cadastre o terminal de **Caixa** e, **no próprio computador do
   caixa**, toque em **Usar este aparelho**.
4. **Administração → Usuários**: cadastre a equipe com senha provisória e o perfil de cada um
   (piloto: 1 gerente, 1 caixa, 2 garçons, 1 cozinha).
5. **Cardápio**: categorias, produtos com preço, adicionais.
6. **Estoque**: insumos e a **compra inicial** (quantidade e valor pago — define o custo).
7. **Fichas técnicas**: o que cada produto consome.
8. **Mesas**: número e área de cada mesa.
9. Teste com a equipe antes de abrir: uma mesa de ponta a ponta (abrir, lançar, cozinha, conta,
   pagamento, fechamento do caixa) e confira os relatórios.

Depois disso, o dia a dia é do gerente ([gerente.md](gerente.md)).

## Segurança

- Use senha forte e não compartilhe o usuário de administrador.
- Quem sair da equipe: **desativar** o usuário no mesmo dia.
- Backup diário e teste mensal de restauração ficam com o técnico
  ([docs/deployment/backup.md](../deployment/backup.md)). Pergunte a ele, uma vez por mês, se o
  teste de restauração passou.
