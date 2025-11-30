const COMMON_PREFIXES: Record<string, string> = {
  'http://www.w3.org/1999/02/22-rdf-syntax-ns#': 'rdf:',
  'http://www.w3.org/2000/01/rdf-schema#': 'rdfs:',
  'http://www.w3.org/2002/07/owl#': 'owl:',
  'http://www.w3.org/2001/XMLSchema#': 'xsd:',
  'http://xmlns.com/foaf/0.1/': 'foaf:',
  'http://purl.org/dc/elements/1.1/': 'dc:',
  'http://purl.org/dc/terms/': 'dct:',
  'http://www.w3.org/2004/02/skos/core#': 'skos:',
  'http://dbpedia.org/ontology/': 'dbo:',
  'http://dbpedia.org/resource/': 'dbr:',
  'http://schema.org/': 'schema:',
  'http://www.w3.org/ns/prov#': 'prov:',
  'http://www.w3.org/2006/time#': 'time:',
  'http://www.w3.org/ns/dcat#': 'dcat:',
};

/**
 * Shorten a URI by replacing common namespaces with prefixes
 * @param uri - Full URI string
 * @returns Shortened URI with prefix or abbreviated form
 */
export function shortenURI(uri: string): string {
  // Try to replace with known prefix
  for (const [namespace, prefix] of Object.entries(COMMON_PREFIXES)) {
    if (uri.startsWith(namespace)) {
      return uri.replace(namespace, prefix);
    }
  }

  // If no prefix match, try to extract local name
  const hashIndex = uri.lastIndexOf('#');
  const slashIndex = uri.lastIndexOf('/');
  const splitIndex = Math.max(hashIndex, slashIndex);

  if (splitIndex > 0 && splitIndex < uri.length - 1) {
    return '...' + uri.substring(splitIndex);
  }

  // Return original if no shortening possible
  return uri;
}

/**
 * Check if a string is a URI
 * @param value - String to check
 * @returns True if the string appears to be a URI
 */
export function isURI(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('urn:') ||
    value.startsWith('ftp://')
  );
}
