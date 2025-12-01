import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { QueryType } from '@/services/sparql/queryDetector';
import {
  getViewPreference,
  setViewPreference,
  type SelectView,
  type ConstructView,
  type AskView,
} from '@/services/preferences/viewPreferences';
import { useConnectionStore } from './connection';

export const useQueryStore = defineStore('query', () => {
  const currentQuery = ref(`PREFIX dbo: <http://dbpedia.org/ontology/>
PREFIX dbr: <http://dbpedia.org/resource/>

SELECT ?city ?population
WHERE {
  ?city a dbo:City ;
        dbo:country dbr:United_States ;
        dbo:populationTotal ?population .
  FILTER (?population > 1000000)
}
ORDER BY DESC(?population)
LIMIT 10`);

  const results = ref<any>(null);
  const error = ref<string | null>(null);
  const isExecuting = ref(false);

  // Query type detection (only updated on execution)
  const queryType = ref<QueryType | null>(null);

  // View preferences per query type
  const currentSelectView = ref<SelectView>(getViewPreference('select'));
  const currentConstructView = ref<ConstructView>(getViewPreference('construct'));
  const currentAskView = ref<AskView>(getViewPreference('ask'));

  // Computed: get selected backend from connection store
  const connectionStore = useConnectionStore();
  const selectedBackend = computed(() => connectionStore.selectedBackend);

  async function executeQuery() {
    if (!currentQuery.value.trim()) {
      error.value = 'Query cannot be empty';
      return;
    }

    // Check if a backend is selected
    if (!connectionStore.selectedBackendId) {
      error.value = 'No backend selected. Please select a backend in the connection panel.';
      return;
    }

    isExecuting.value = true;
    error.value = null;
    results.value = null;

    try {
      // Use the Electron API to execute the query with selected backend
      const response = await window.electronAPI.query.execute(
        currentQuery.value,
        connectionStore.selectedBackendId
      );
      results.value = response;

      // Update query type from the response
      queryType.value = response.queryType as QueryType;
    } catch (err: any) {
      error.value = err.message || 'Failed to execute query';
      console.error('Query execution error:', err);
    } finally {
      isExecuting.value = false;
    }
  }

  function setQuery(query: string) {
    currentQuery.value = query;
  }

  function setSelectView(view: SelectView) {
    currentSelectView.value = view;
    setViewPreference('select', view);
  }

  function setConstructView(view: ConstructView) {
    currentConstructView.value = view;
    setViewPreference('construct', view);
  }

  function setAskView(view: AskView) {
    currentAskView.value = view;
    setViewPreference('ask', view);
  }

  return {
    currentQuery,
    results,
    error,
    isExecuting,
    queryType,
    currentSelectView,
    currentConstructView,
    currentAskView,
    selectedBackend,
    executeQuery,
    setQuery,
    setSelectView,
    setConstructView,
    setAskView,
  };
});
