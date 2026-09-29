import type { Metadata } from 'next';
import { requireSession } from '@/modules/auth/web';
import { orgAdmin } from '@/modules/organizations/web';
import { hasPermission } from '@/shared/kernel';
import { NoPermission } from '../no-permission';
import { CompanyForm } from './company-form';

export const metadata: Metadata = { title: 'Empresa' };

/** "11222333000181" → "11.222.333/0001-81" (só para exibir). */
function formatCnpj(cnpj: string | null): string {
  return cnpj ? cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '';
}

export default async function CompanyPage() {
  const { context } = await requireSession();
  if (!hasPermission(context, 'stores.manage')) {
    return <NoPermission />;
  }
  const [companies, canCreate] = await Promise.all([
    orgAdmin().listCompanies(context),
    orgAdmin().canCreateCompany(context),
  ]);

  return (
    <div className="flex max-w-lg flex-col gap-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">{companies.length > 1 ? 'Empresas' : 'Empresa'}</h1>
        <p className="text-tinta-suave">
          Dados do CNPJ. As lojas ficam dentro da empresa; o CNPJ será usado nas notas fiscais no
          futuro.
        </p>
      </div>

      {companies.length === 0 ? (
        <p>Seu perfil administra só lojas, não a empresa. Fale com o administrador.</p>
      ) : null}

      {companies.map((company) => (
        <section
          key={company.id}
          aria-label={company.tradeName}
          className="flex flex-col gap-4 border-t-2 border-borda pt-6"
        >
          {companies.length > 1 ? (
            <h2 className="text-2xl font-bold">{company.tradeName}</h2>
          ) : null}
          <CompanyForm
            values={{
              legalName: company.legalName,
              tradeName: company.tradeName,
              cnpj: formatCnpj(company.cnpj),
            }}
            company={{ id: company.id, version: company.version }}
          />
        </section>
      ))}

      {canCreate ? (
        <details className="border-t-2 border-borda pt-6">
          <summary className="inline-flex min-h-12 cursor-pointer items-center text-lg font-bold text-azulejo">
            Cadastrar outra empresa (outro CNPJ)
          </summary>
          <div className="pt-4">
            <CompanyForm values={{ legalName: '', tradeName: '', cnpj: '' }} />
          </div>
        </details>
      ) : null}
    </div>
  );
}
