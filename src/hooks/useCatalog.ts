import { useEffect, useCallback } from 'react';
import { useCatalogStore } from '../store';
import { catalogApi } from '../services/api/catalogApi';
import { CatalogCategory, CatalogSubcategory } from '../types';

/**
 * Primary hook for the global category tree.
 *
 * - Serves data instantly from AsyncStorage cache (persisted by Zustand).
 * - Silently re-fetches in the background when cache is older than 24 h.
 * - Call this in any screen that needs categories — safe to call multiple
 *   times; fetch only runs once until TTL expires.
 */
export function useCatalog() {
  const { categories, isLoading, error, isStale, setCategories, setLoading, setError } =
    useCatalogStore();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await catalogApi.getCategories();
      setCategories(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load categories');
    } finally {
      setLoading(false);
    }
  }, [setCategories, setError, setLoading]);

  useEffect(() => {
    // If cache has data and is still fresh, skip the fetch entirely.
    if (categories.length > 0 && !isStale()) return;
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { categories, isLoading, error, refresh };
}

/**
 * Returns a single category by slug name.
 * Requires useCatalog() to have been called at a parent level first.
 */
export function useCatalogCategory(name: string): CatalogCategory | undefined {
  const { categories } = useCatalogStore();
  return categories.find((c) => c.name === name);
}

/**
 * Returns all subcategories for a given parent category slug.
 */
export function useCatalogSubcategories(categoryName: string): CatalogSubcategory[] {
  const cat = useCatalogCategory(categoryName);
  return cat?.subcategories ?? [];
}
