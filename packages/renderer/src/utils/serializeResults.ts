/**
 * Utilities for serializing SPARQL query results to various formats
 */

import type { QueryType } from '@/services/sparql/queryDetector';
import { rdfProcessor } from '@/services/rdf/rdfProcessor';

/**
 * Serialize SELECT query results to CSV format
 */
export function serializeToCSV(results: any): string {
  // Extract the actual SPARQL JSON results data
  const data = results.data || results;

  if (!data || !data.head || !data.results) {
    throw new Error('Invalid SELECT query results format');
  }

  const variables = data.head.vars || [];
  const bindings = data.results.bindings || [];

  if (variables.length === 0) {
    return '';
  }

  // Header row
  const header = variables.join(',');

  // Data rows
  const rows = bindings.map((binding: any) => {
    return variables.map((variable: string) => {
      const value = binding[variable];
      if (!value) return '';

      // Get the actual value
      let cellValue = value.value || '';

      // Escape quotes and wrap in quotes if contains comma, newline, or quote
      if (cellValue.includes(',') || cellValue.includes('\n') || cellValue.includes('"')) {
        cellValue = '"' + cellValue.replace(/"/g, '""') + '"';
      }

      return cellValue;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

/**
 * Serialize SELECT query results to JSON format
 */
export function serializeToJSON(results: any): string {
  // Extract the actual data, or use results as-is if it's already the data
  const data = results.data || results;
  return JSON.stringify(data, null, 2);
}

/**
 * Serialize ASK query results to JSON format
 */
export function serializeAskToJSON(results: any): string {
  // Extract the actual data, or use results as-is if it's already the data
  const data = results.data || results;
  return JSON.stringify(data, null, 2);
}

/**
 * Get available formats for a given query type
 */
export function getAvailableFormats(queryType: QueryType | null): Array<{value: string, label: string}> {
  switch (queryType) {
    case 'SELECT':
      return [
        { value: 'csv', label: 'CSV' },
        { value: 'json', label: 'JSON' }
      ];
    case 'CONSTRUCT':
    case 'DESCRIBE':
      return [
        { value: 'turtle', label: 'Turtle' },
        { value: 'trig', label: 'TriG' },
        { value: 'ntriples', label: 'N-Triples' },
        { value: 'nquads', label: 'N-Quads' },
        { value: 'jsonld', label: 'JSON-LD' }
      ];
    case 'ASK':
      return [
        { value: 'json', label: 'JSON' }
      ];
    default:
      return [];
  }
}

/**
 * Serialize results based on query type and format
 *
 * @param results - The query results
 * @param queryType - The type of SPARQL query
 * @param format - The desired output format
 * @returns Serialized content as string
 */
export async function serializeResults(
  results: any,
  queryType: QueryType,
  format: string
): Promise<string> {
  if (!results) {
    throw new Error('No results to serialize');
  }

  switch (queryType) {
    case 'SELECT':
      if (format === 'csv') {
        return serializeToCSV(results);
      } else if (format === 'json') {
        return serializeToJSON(results);
      }
      throw new Error(`Unsupported format "${format}" for SELECT query`);

    case 'ASK':
      if (format === 'json') {
        return serializeAskToJSON(results);
      }
      throw new Error(`Unsupported format "${format}" for ASK query`);

    case 'CONSTRUCT':
    case 'DESCRIBE':
      // For CONSTRUCT/DESCRIBE, results.data contains Turtle RDF from the backend
      let turtleData: string;

      if (typeof results === 'string') {
        turtleData = results;
      } else if (results.data && typeof results.data === 'string') {
        turtleData = results.data;
      } else if (results.value && typeof results.value === 'string') {
        turtleData = results.value;
      } else {
        throw new Error('CONSTRUCT/DESCRIBE results are not in expected format');
      }

      // If requesting Turtle format, return as-is
      if (format === 'turtle') {
        return turtleData;
      }

      // For other formats, parse and re-serialize
      const dataset = await rdfProcessor.parseTurtle(turtleData);

      switch (format) {
        case 'trig':
          // TriG is similar to Turtle but supports named graphs
          // For now, fall back to Turtle since most CONSTRUCT results don't use named graphs
          return rdfProcessor.serializeToTurtle(dataset);
        case 'ntriples':
          return rdfProcessor.serializeToNTriples(dataset);
        case 'nquads':
          return rdfProcessor.serializeToNQuads(dataset);
        case 'jsonld':
          return rdfProcessor.serializeToJsonLD(dataset);
        default:
          throw new Error(`Unsupported format "${format}" for CONSTRUCT/DESCRIBE query`);
      }

    default:
      throw new Error(`Unsupported query type: ${queryType}`);
  }
}
