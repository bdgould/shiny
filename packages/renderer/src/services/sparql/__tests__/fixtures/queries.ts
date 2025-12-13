/**
 * Sample SPARQL queries for testing the formatter
 */

export const SIMPLE_SELECT = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name ?email WHERE { ?person foaf:name ?name . ?person foaf:mbox ?email }`

export const SIMPLE_SELECT_WITH_TYPE = `PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?s WHERE { ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> skos:Concept }`

export const MINIMAL_QUERY = `SELECT * WHERE { ?s ?p ?o }`

export const COMPLEX_SELECT = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>
SELECT DISTINCT ?name ?age (COUNT(?friend) AS ?friendCount)
WHERE {
  ?person rdf:type foaf:Person .
  ?person foaf:name ?name .
  OPTIONAL { ?person ex:age ?age }
  OPTIONAL {
    ?person foaf:knows ?friend .
    ?friend rdf:type foaf:Person
  }
  FILTER(?age > 18)
}
GROUP BY ?name ?age
ORDER BY DESC(?friendCount)
LIMIT 10`

export const WITH_UNION = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE {
  { ?person foaf:firstName ?name }
  UNION
  { ?person foaf:lastName ?name }
}`

export const WITH_SUBQUERY = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
CONSTRUCT {
  ?s ?p ?o.
  ?s <urn://test> "Thing".
}
WHERE {
  {
    SELECT ?s ?p ?o
 WHERE { ?s ?p ?o. }
    LIMIT 100
  }
  ?s <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> skos:Concept.
  FILTER(!(ISBLANK(?s)))
}
ORDER BY DESC (?s)
OFFSET 10
LIMIT 100`

export const CONSTRUCT_QUERY = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
CONSTRUCT { ?person foaf:knows ?friend }
WHERE { ?person foaf:knows ?friend }`

export const ASK_QUERY = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
ASK { ?person foaf:name "Alice" }`

export const DESCRIBE_QUERY = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
DESCRIBE ?person WHERE { ?person foaf:name "Alice" }`

export const WITH_SERVICE = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE {
  SERVICE <http://example.org/sparql> {
    ?person foaf:name ?name
  }
}`

export const WITH_BIND = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?fullName WHERE {
  ?person foaf:firstName ?first ;
          foaf:lastName ?last .
  BIND(CONCAT(?first, " ", ?last) AS ?fullName)
}`

export const WITH_VALUES = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?person ?status WHERE {
  ?person foaf:name ?name .
  VALUES ?status { "active" "pending" }
}`

export const WITH_GRAPH = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE {
  GRAPH <http://example.org/graph> {
    ?person foaf:name ?name
  }
}`

export const WITH_DECIMALS = `SELECT ?value WHERE {
  ?s ?p ?value .
  FILTER(?value > 1.5 && ?value < 100.25)
}`

export const WITH_SEMICOLONS = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?person WHERE {
  ?person foaf:name ?name ;
          foaf:age ?age ;
          foaf:email ?email .
}`

export const MULTIPLE_PREFIXES = `PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX foaf: <http://xmlns.com/foaf/0.1/>
PREFIX ex: <http://example.org/>
PREFIX skos: <http://www.w3.org/2004/02/skos/core#>
SELECT ?s WHERE { ?s rdf:type foaf:Person }`

export const MALFORMED_QUERY = `SELECT ?name WHERE { ?person`

export const EMPTY_QUERY = ``

export const WHITESPACE_ONLY = `   \n  \t  \n  `

export const NO_PREFIXES = `SELECT ?s ?p ?o WHERE { ?s ?p ?o } LIMIT 10`

export const MIXED_CASE_KEYWORDS = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
select ?name where { ?person foaf:name ?name }`

export const WITH_FILTER_FUNCTIONS = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?name WHERE {
  ?person foaf:name ?name .
  FILTER(REGEX(?name, "^A", "i") && STRLEN(?name) > 3)
}`

export const WITH_AGGREGATES = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT (COUNT(?person) AS ?count) (AVG(?age) AS ?avgAge) (MIN(?age) AS ?minAge) (MAX(?age) AS ?maxAge)
WHERE {
  ?person foaf:age ?age
}
GROUP BY ?person`

export const DEEPLY_NESTED = `SELECT ?x WHERE {
  {
    {
      {
        ?x ?p ?o
      }
    }
  }
}`

export const WITH_PROPERTY_PATHS = `PREFIX foaf: <http://xmlns.com/foaf/0.1/>
SELECT ?ancestor WHERE {
  ?person foaf:knows+ ?ancestor
}`
