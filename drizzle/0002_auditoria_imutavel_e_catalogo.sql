-- Etapa 2 — migration escrita à mão (revisada).
-- 1) Auditoria somente inclusão: o próprio MySQL recusa UPDATE e DELETE (E2-6, RN-AUDIT-02).
-- 2) Catálogo de permissões e perfis de sistema (README B.7.1, maps/permissions/matriz-rbac.md).
--    Mudanças futuras no catálogo entram por nova migration.

CREATE TRIGGER `trg_audit_log_no_update` BEFORE UPDATE ON `audit_log` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log aceita somente inclusao';
--> statement-breakpoint
CREATE TRIGGER `trg_audit_log_no_delete` BEFORE DELETE ON `audit_log` FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_log aceita somente inclusao';
--> statement-breakpoint
INSERT INTO `permission` (`code`, `description`) VALUES
  ('dashboard.read', 'Ver o painel do dia'),
  ('users.read', 'Ver usuários'),
  ('users.create', 'Cadastrar usuários'),
  ('users.update', 'Alterar usuários, perfis e senhas provisórias'),
  ('users.disable', 'Desativar usuários'),
  ('stores.read', 'Ver dados da loja'),
  ('stores.manage', 'Gerenciar empresa, lojas e configurações'),
  ('products.read', 'Ver produtos'),
  ('products.create', 'Cadastrar produtos'),
  ('products.update', 'Alterar produtos'),
  ('tables.read', 'Ver mesas'),
  ('tables.manage', 'Gerenciar mesas'),
  ('orders.read', 'Ver contas e pedidos'),
  ('orders.create', 'Abrir contas e lançar itens'),
  ('orders.update', 'Alterar contas, transferir e juntar mesas'),
  ('orders.cancel', 'Cancelar itens enviados e contas'),
  ('kds.read', 'Ver a tela da cozinha'),
  ('kds.manage', 'Atualizar pedidos na cozinha'),
  ('cashier.read', 'Ver o caixa'),
  ('cashier.open', 'Abrir o caixa'),
  ('cashier.close', 'Fechar o caixa'),
  ('cashier.movement', 'Fazer sangria, suprimento e ajuste'),
  ('payments.create', 'Receber pagamentos'),
  ('payments.cancel', 'Cancelar pagamentos'),
  ('discounts.apply', 'Dar desconto até o limite do perfil'),
  ('discounts.apply_above_limit', 'Dar desconto acima do limite'),
  ('inventory.read', 'Ver estoque'),
  ('inventory.manage', 'Movimentar estoque'),
  ('recipes.read', 'Ver fichas técnicas'),
  ('recipes.manage', 'Alterar fichas técnicas'),
  ('finance.read', 'Ver financeiro'),
  ('finance.manage', 'Lançar receitas e despesas'),
  ('reports.read', 'Ver relatórios'),
  ('audit.read', 'Ver auditoria');
--> statement-breakpoint
INSERT INTO `role` (`id`, `organization_id`, `code`, `name`, `max_discount_bp`, `is_system`) VALUES
  (UNHEX('01a0e93e47ee703ca803db3504ddbba0'), NULL, 'ADMIN', 'Administrador', 10000, true),
  (UNHEX('01a0e93e47ef74d688923b6a7672a05a'), NULL, 'GERENTE', 'Gerente', 10000, true),
  (UNHEX('01a0e93e47ef74d688923f456b8ce0b3'), NULL, 'CAIXA', 'Caixa', 1000, true),
  (UNHEX('01a0e93e47ef74d688924373aab4c405'), NULL, 'GARCOM', 'Garçom', 0, true),
  (UNHEX('01a0e93e47ef74d68892470c6dcec724'), NULL, 'COZINHA', 'Cozinha', 0, true);
--> statement-breakpoint
-- ADMIN: todas as permissões
INSERT INTO `role_permission` (`role_id`, `permission_code`)
  SELECT UNHEX('01a0e93e47ee703ca803db3504ddbba0'), `code` FROM `permission`;
--> statement-breakpoint
-- GERENTE: todas, exceto gerenciar empresa/lojas
INSERT INTO `role_permission` (`role_id`, `permission_code`)
  SELECT UNHEX('01a0e93e47ef74d688923b6a7672a05a'), `code` FROM `permission`
  WHERE `code` <> 'stores.manage';
--> statement-breakpoint
INSERT INTO `role_permission` (`role_id`, `permission_code`)
  SELECT UNHEX('01a0e93e47ef74d688923f456b8ce0b3'), `code` FROM `permission` WHERE `code` IN (
    'dashboard.read', 'stores.read', 'products.read', 'tables.read', 'tables.manage',
    'orders.read', 'orders.create', 'orders.update', 'cashier.read', 'cashier.open',
    'cashier.close', 'cashier.movement', 'payments.create', 'discounts.apply');
--> statement-breakpoint
INSERT INTO `role_permission` (`role_id`, `permission_code`)
  SELECT UNHEX('01a0e93e47ef74d688924373aab4c405'), `code` FROM `permission` WHERE `code` IN (
    'stores.read', 'products.read', 'tables.read', 'tables.manage', 'orders.read',
    'orders.create', 'orders.update', 'kds.read');
--> statement-breakpoint
INSERT INTO `role_permission` (`role_id`, `permission_code`)
  SELECT UNHEX('01a0e93e47ef74d68892470c6dcec724'), `code` FROM `permission` WHERE `code` IN (
    'stores.read', 'products.read', 'kds.read', 'kds.manage', 'inventory.read', 'recipes.read');
