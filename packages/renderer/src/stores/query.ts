import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { QueryType } from '@/services/sparql/queryDetector';
import {
  getViewPreference,
  setViewPreference,
  type SelectView,
  type ConstructView,
  type AskView,
} from '@/services/preferences/viewPreferences';

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

  const endpoint = ref('https://dbpedia.org/sparql');
  const results = ref<any>(null);
  const error = ref<string | null>(null);
  const isExecuting = ref(false);

  // Query type detection (only updated on execution)
  const queryType = ref<QueryType | null>(null);

  // View preferences per query type
  const currentSelectView = ref<SelectView>(getViewPreference('select'));
  const currentConstructView = ref<ConstructView>(getViewPreference('construct'));
  const currentAskView = ref<AskView>(getViewPreference('ask'));

  async function executeQuery() {
    if (!currentQuery.value.trim()) {
      error.value = 'Query cannot be empty';
      return;
    }

    isExecuting.value = true;
    error.value = null;
    results.value = null;

    try {
      // Use the Electron API to execute the query
      const response = await window.electronAPI.query.execute(
        currentQuery.value,
        endpoint.value
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

  function setEndpoint(url: string) {
    endpoint.value = url;
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
    endpoint,
    results,
    error,
    isExecuting,
    queryType,
    currentSelectView,
    currentConstructView,
    currentAskView,
    executeQuery,
    setQuery,
    setEndpoint,
    setSelectView,
    setConstructView,
    setAskView,
  };
});
