import { redirect } from 'next/navigation';

/** /catalogo abre a lista de produtos. */
export default function CatalogPage() {
  redirect('/catalogo/produtos');
}
