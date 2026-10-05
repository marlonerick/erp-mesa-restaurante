import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { login, openMenuIfMobile, TEAM, unique } from './helpers';

// Financeiro, painel e relatórios (Etapa 9). Os três aparelhos rodam ao mesmo tempo no mesmo
// banco: cada teste usa uma descrição única e só confere o que ele mesmo criou.

const noHorizontalScroll = async (page: Page) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
};

test.describe('Financeiro, painel e relatórios (Etapa 9)', () => {
  test.describe.configure({ timeout: 60_000 });

  test('o gerente lança uma despesa a pagar, paga e depois cancela com motivo', async ({
    page,
  }) => {
    const description = unique('Conta de luz');
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await openMenuIfMobile(page);
    await page.getByRole('link', { name: 'Financeiro', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Financeiro', level: 1 })).toBeVisible();

    // Despesa a pagar (é o padrão) com vencimento hoje
    const form = page.getByRole('region', { name: 'Novo lançamento' });
    await form.getByLabel('Categoria').selectOption({ label: 'Contas de consumo' });
    await form.getByLabel('Descrição').fill(description);
    await form.getByLabel('Valor (R$)').fill('350,00');
    await form.getByRole('button', { name: 'Lançar' }).click();
    await expect(form.getByRole('status')).toHaveText('Despesa lançada.');

    const entry = page.getByRole('listitem').filter({ hasText: description });
    await expect(entry).toContainText('R$ 350,00');
    await expect(entry.getByText('Previsto', { exact: true })).toBeVisible();

    // Pago: o formulário de pagamento sai da tela e a situação muda
    await entry.getByRole('button', { name: 'Marcar como paga' }).click();
    await expect(entry.getByText('Pago', { exact: true })).toBeVisible();
    await expect(entry.getByRole('button', { name: 'Marcar como paga' })).toHaveCount(0);

    // Cancelar exige motivo
    await entry.getByText('Cancelar lançamento', { exact: true }).first().click();
    await entry.getByRole('button', { name: 'Cancelar lançamento' }).click();
    await expect(entry.getByRole('alert')).toContainText('Explique o motivo');
    await entry.getByLabel('Motivo').fill('lançado em dobro');
    await entry.getByRole('button', { name: 'Cancelar lançamento' }).click();
    await expect(entry).toContainText('Cancelado: lançado em dobro');

    await page.getByRole('link', { name: 'Fluxo de caixa' }).click();
    await expect(page.getByRole('heading', { name: /A pagar e a receber até/ })).toBeVisible();
    await noHorizontalScroll(page);
  });

  test('o gerente vê os relatórios, troca de aba, baixa o CSV e imprime', async ({ page }) => {
    await page.addInitScript(() => {
      const counter = window as unknown as { printed: number };
      counter.printed = 0;
      window.print = () => {
        counter.printed += 1;
      };
    });
    await login(page, TEAM.gerente.username, TEAM.gerente.password);
    await page.goto('/relatorios');
    await expect(page.getByRole('heading', { name: 'Relatórios', level: 1 })).toBeVisible();
    await expect(page.getByText('Vendas', { exact: true }).first()).toBeVisible();
    await noHorizontalScroll(page);

    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: 'Baixar vendas por dia (CSV)' }).click();
    const file = await (await download).path();
    const csv = await readFile(file, 'utf8');
    // BOM + separador ";" (abre direto no Excel brasileiro — RN-REP-09)
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).split('\r\n')[0]).toBe(
      'Dia;Contas;Itens;Descontos;Taxa de serviço;Total;Ticket médio',
    );

    await page.getByRole('button', { name: 'Imprimir' }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);

    for (const tab of ['Produtos', 'Caixa', 'Estoque', 'Operação', 'Auditoria']) {
      await page
        .getByRole('navigation', { name: 'Relatórios' })
        .getByRole('link', { name: tab })
        .click();
      await expect(page.getByRole('heading', { name: tab, level: 2 })).toBeVisible();
    }
    await expect(page.getByRole('table').first()).toBeVisible();
    await noHorizontalScroll(page);

    // Período ao contrário: aviso na tela, sem erro 500
    await page.goto('/relatorios?aba=vendas&de=2026-03-15&ate=2026-03-14');
    await expect(
      page.getByRole('alert').filter({ hasText: 'Escolha um período de até 366 dias' }),
    ).toBeVisible();
  });

  test('o caixa vê o painel do dia, mas não o financeiro nem os relatórios', async ({ page }) => {
    await login(page, TEAM.caixa.username, TEAM.caixa.password);
    await page.goto('/inicio');
    await expect(page.getByRole('heading', { name: 'Painel de hoje' })).toBeVisible();
    await expect(page.getByText('Ticket médio')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver relatórios' })).toHaveCount(0);
    await noHorizontalScroll(page);
    await page.goto('/financeiro');
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
    await page.goto('/relatorios');
    await expect(page.getByRole('heading', { name: 'Sem permissão' })).toBeVisible();
    const csv = await page.request.get('/relatorios/csv/vendas');
    expect(csv.status()).toBe(403);
  });

  test('o garçom não vê o painel', async ({ page }) => {
    // Ana (e não João): mais de 5 logins SIMULTÂNEOS do mesmo usuário esbarram no limite de
    // tentativas (RN-AUTH-04), e o João já entra em vários testes do salão e da cozinha
    await login(page, TEAM.ana.username, TEAM.ana.password);
    await page.goto('/inicio');
    await expect(page.getByRole('heading', { name: /^Olá/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Painel de hoje' })).toHaveCount(0);
    const api = await page.request.get('/api/painel');
    expect(api.status()).toBe(403);
  });
});
