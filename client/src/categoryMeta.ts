// Each category's icon and colour tokens (tokens.css). Chips and charts share these, so a category looks the same everywhere.
import { Car, Clapperboard, House, Plane, Receipt, ShoppingBag, ShoppingCart, UtensilsCrossed, type LucideIcon } from 'lucide-react';
import type { Category } from '@splitbot/shared';

export const CATEGORY_META: Record<Category, { Icon: LucideIcon; token: string }> = {
  'Food & Drink': { Icon: UtensilsCrossed, token: 'food' },
  Groceries: { Icon: ShoppingCart, token: 'groceries' },
  Transport: { Icon: Car, token: 'transport' },
  'Housing & Utilities': { Icon: House, token: 'housing' },
  Entertainment: { Icon: Clapperboard, token: 'entertainment' },
  Travel: { Icon: Plane, token: 'travel' },
  Shopping: { Icon: ShoppingBag, token: 'shopping' },
  Other: { Icon: Receipt, token: 'other' },
};

export const categoryChartColor = (category: Category) => `var(--cat-${CATEGORY_META[category].token})`;
