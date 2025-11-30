export type SelectView = 'table' | 'json';
export type ConstructView = 'entity-table' | 'turtle' | 'ntriples' | 'nquads' | 'jsonld';
export type AskView = 'badge' | 'json';

interface ViewPreferences {
  select: SelectView;
  construct: ConstructView;
  ask: AskView;
}

const STORAGE_KEY = 'shiny:query:view-preferences';

const DEFAULT_PREFERENCES: ViewPreferences = {
  select: 'table',
  construct: 'entity-table',
  ask: 'badge',
};

/**
 * Get all view preferences from localStorage
 * @returns View preferences with defaults for missing values
 */
export function getViewPreferences(): ViewPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
    }
  } catch (error) {
    console.error('Failed to load view preferences:', error);
  }
  return DEFAULT_PREFERENCES;
}

/**
 * Set a view preference for a specific query type
 * @param queryType - The query type (select, construct, or ask)
 * @param view - The view preference to set
 */
export function setViewPreference<T extends keyof ViewPreferences>(
  queryType: T,
  view: ViewPreferences[T]
): void {
  try {
    const prefs = getViewPreferences();
    prefs[queryType] = view;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    console.error('Failed to save view preference:', error);
  }
}

/**
 * Get the view preference for a specific query type
 * @param queryType - The query type (select, construct, or ask)
 * @returns The current view preference for that query type
 */
export function getViewPreference<T extends keyof ViewPreferences>(
  queryType: T
): ViewPreferences[T] {
  return getViewPreferences()[queryType];
}
