import type { CategoryView, ModifierGroupView } from '@/modules/catalog';

/** "Escolher 1", "Até 3", "De 1 a 2" — como a pessoa lê os limites do grupo. */
export function limitsText(group: { readonly minSelect: number; readonly maxSelect: number }) {
  const { minSelect: min, maxSelect: max } = group;
  if (min === max) return `Escolher ${String(min)}`;
  if (min === 0) return `Opcional, até ${String(max)}`;
  return `De ${String(min)} a ${String(max)}`;
}

/** Categorias para escolher no produto: as ativas e, na edição, a atual (mesmo desativada). */
export function categoryOptions(categories: readonly CategoryView[], currentId?: string) {
  return categories
    .filter((item) => item.active || item.id === currentId)
    .map((item) => ({ id: item.id, name: item.active ? item.name : `${item.name} (desativada)` }));
}

/** Grupos para marcar no produto: os ativos e os que já estão ligados. */
export function groupOptions(groups: readonly ModifierGroupView[], linked: readonly string[] = []) {
  return groups
    .filter((group) => group.active || linked.includes(group.id))
    .map((group) => ({
      id: group.id,
      name: group.active ? group.name : `${group.name} (desativado)`,
      limits: `${limitsText(group)} · ${String(group.modifiers.filter((m) => m.active).length)} opções`,
    }));
}
