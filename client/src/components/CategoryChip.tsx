import type { Category } from '@splitbot/shared';
import { CATEGORY_META } from '../categoryMeta';

/** The icon and soft colour for a category, with its name. Icon-only chips keep the name for screen readers. */
export function CategoryChip({ category, iconOnly = false }: { category: Category; iconOnly?: boolean }) {
  const { Icon, token } = CATEGORY_META[category];
  const colours = { color: `var(--cat-${token}-ink)`, background: `var(--cat-${token}-tint)` };

  if (iconOnly) {
    return (
      <span className="category-chip icon-only" style={colours} role="img" aria-label={category}>
        <Icon aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className="category-chip" style={colours}>
      <Icon aria-hidden="true" />
      {category}
    </span>
  );
}
