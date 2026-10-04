import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Display snapshot. Checkout must re-read the live material price. */
export interface MaterialCartItem {
  materialId: string;
  storeId: string;
  name: string;
  image: string;
  unit: string;
  price: number;
  quantity: number;
  minOrderQty: number;
  stock: number;
}

interface MaterialCartState {
  storeId: string | null;
  storeName: string;
  items: MaterialCartItem[];
  addItem: (item: MaterialCartItem, storeName: string) => 'added' | 'needs-switch' | 'unavailable' | 'capped';
  replaceStore: (item: MaterialCartItem, storeName: string) => 'added' | 'unavailable';
  setQuantity: (materialId: string, quantity: number) => void;
  removeItem: (materialId: string) => void;
  clear: () => void;
}

function bounds(item: Pick<MaterialCartItem, 'minOrderQty' | 'stock'>) {
  const min = Math.max(1, Number(item.minOrderQty) || 1);
  const stock = Math.max(0, Number(item.stock) || 0);
  return { min, stock, sellable: stock >= min };
}

function fit(quantity: number, min: number, stock: number) {
  return Math.min(stock, Math.max(min, Math.floor(quantity)));
}

const empty = { storeId: null as string | null, storeName: '', items: [] as MaterialCartItem[] };

export const useMaterialCartStore = create<MaterialCartState>()(
  persist(
    (set, get) => ({
      ...empty,
      addItem: (item, storeName) => {
        const { min, stock, sellable } = bounds(item);
        if (!sellable) return 'unavailable';
        const current = get();
        if (current.storeId && current.items.length > 0 && current.storeId !== item.storeId) {
          return 'needs-switch';
        }
        const existing = current.items.find((row) => row.materialId === item.materialId);
        if (existing && existing.quantity >= stock) return 'capped';
        const quantity = fit(existing ? existing.quantity + item.quantity : item.quantity, min, stock);
        const next: MaterialCartItem = {
          materialId: item.materialId,
          storeId: item.storeId,
          name: item.name,
          image: item.image || '',
          unit: item.unit,
          price: item.price,
          quantity,
          minOrderQty: min,
          stock,
        };
        set({
          storeId: item.storeId,
          storeName: storeName || current.storeName,
          items: existing
            ? current.items.map((row) => (row.materialId === item.materialId ? next : row))
            : [...current.items, next],
        });
        return 'added';
      },
      replaceStore: (item, storeName) => {
        const { min, stock, sellable } = bounds(item);
        if (!sellable) return 'unavailable';
        set({
          storeId: item.storeId,
          storeName,
          items: [{ ...item, quantity: fit(item.quantity, min, stock), minOrderQty: min, stock, image: item.image || '' }],
        });
        return 'added';
      },
      setQuantity: (materialId, quantity) => {
        set((state) => ({
          items: state.items.map((row) => {
            if (row.materialId !== materialId) return row;
            const { min, stock } = bounds(row);
            if (!stock || stock < min) return row;
            return { ...row, quantity: fit(quantity, min, stock) };
          }),
        }));
      },
      removeItem: (materialId) => {
        const items = get().items.filter((row) => row.materialId !== materialId);
        set(items.length ? { items } : empty);
      },
      clear: () => set(empty),
    }),
    {
      name: 'buildmate-material-cart',
      partialize: (state) => ({ storeId: state.storeId, storeName: state.storeName, items: state.items }),
    }
  )
);

export function materialCartCount(items: MaterialCartItem[]) {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}
