import rdf from 'rdf-ext';
import ParserN3 from '@rdfjs/parser-n3';
import SerializerTurtle from '@rdfjs/serializer-turtle';
import SerializerNTriples from '@rdfjs/serializer-ntriples';
import SerializerJsonLd from '@rdfjs/serializer-jsonld';
import type { DatasetCore, Quad } from '@rdfjs/types';
import { Readable } from 'readable-stream';

export interface EntityTriple {
  predicate: string;
  object: string;
  objectType: 'uri' | 'literal' | 'bnode';
  datatype?: string;
  language?: string;
}

export interface EntityGroup {
  subject: string;
  subjectType: 'uri' | 'bnode';
  triples: EntityTriple[];
}

export class RDFProcessor {
  /**
   * Parse Turtle format string into an RDF dataset
   */
  async parseTurtle(turtleString: string): Promise<DatasetCore> {
    const parser = new ParserN3({ factory: rdf });
    const stream = parser.import(Readable.from([turtleString]));
    return rdf.dataset().import(stream);
  }

  /**
   * Serialize RDF dataset to Turtle format
   */
  async serializeToTurtle(dataset: DatasetCore): Promise<string> {
    try {
      // Validate all quads have proper term structures before serializing
      for (const quad of dataset) {
        if (!quad.subject || !quad.subject.termType) {
          throw new Error('Invalid quad: subject missing or malformed');
        }
        if (!quad.predicate || !quad.predicate.termType) {
          throw new Error('Invalid quad: predicate missing or malformed');
        }
        if (!quad.object || !quad.object.termType) {
          throw new Error('Invalid quad: object missing or malformed');
        }
      }

      const serializer = new SerializerTurtle();
      const stream = serializer.import(dataset.toStream());
      return this.streamToString(stream);
    } catch (error: any) {
      // Provide more context for debugging
      console.error('Turtle serialization error:', error);
      console.error('Dataset size:', dataset.size);
      throw new Error(`Turtle serialization failed: ${error.message}`);
    }
  }

  /**
   * Serialize RDF dataset to N-Triples format
   */
  async serializeToNTriples(dataset: DatasetCore): Promise<string> {
    const serializer = new SerializerNTriples();
    const stream = serializer.import(dataset.toStream());
    return this.streamToString(stream);
  }

  /**
   * Serialize RDF dataset to N-Quads format
   */
  async serializeToNQuads(dataset: DatasetCore): Promise<string> {
    const quads = Array.from(dataset);
    return quads.map((quad) => this.quadToNQuad(quad)).join('\n');
  }

  /**
   * Serialize RDF dataset to JSON-LD format
   */
  async serializeToJsonLD(dataset: DatasetCore): Promise<string> {
    const serializer = new SerializerJsonLd();
    const stream = serializer.import(dataset.toStream());
    const jsonld = await this.streamToJsonLd(stream);
    return JSON.stringify(jsonld, null, 2);
  }

  /**
   * Group triples by subject for entity-centric table view
   */
  groupByEntity(dataset: DatasetCore): EntityGroup[] {
    const entityMap = new Map<string, EntityGroup>();

    for (const quad of dataset) {
      const subjectValue = quad.subject.value;

      if (!entityMap.has(subjectValue)) {
        entityMap.set(subjectValue, {
          subject: subjectValue,
          subjectType: quad.subject.termType === 'NamedNode' ? 'uri' : 'bnode',
          triples: [],
        });
      }

      const entity = entityMap.get(subjectValue)!;
      entity.triples.push({
        predicate: quad.predicate.value,
        object: quad.object.value,
        objectType:
          quad.object.termType === 'NamedNode'
            ? 'uri'
            : quad.object.termType === 'Literal'
            ? 'literal'
            : 'bnode',
        datatype:
          quad.object.termType === 'Literal' ? quad.object.datatype?.value : undefined,
        language: quad.object.termType === 'Literal' ? quad.object.language : undefined,
      });
    }

    return Array.from(entityMap.values());
  }

  /**
   * Convert a readable stream to string
   */
  private streamToString(stream: any): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: string[] = [];
      stream.on('data', (chunk: any) => chunks.push(chunk.toString()));
      stream.on('end', () => resolve(chunks.join('')));
      stream.on('error', reject);
    });
  }

  /**
   * Convert a JSON-LD stream to object (JSON-LD serializer emits objects, not strings)
   */
  private streamToJsonLd(stream: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const chunks: any[] = [];
      stream.on('data', (chunk: any) => chunks.push(chunk));
      stream.on('end', () => {
        // If we have a single object, return it
        if (chunks.length === 1) {
          resolve(chunks[0]);
        } else {
          // If we have multiple chunks, combine them
          resolve(chunks);
        }
      });
      stream.on('error', reject);
    });
  }

  /**
   * Convert a quad to N-Quad format string
   */
  private quadToNQuad(quad: Quad): string {
    const s = this.termToNTriples(quad.subject);
    const p = this.termToNTriples(quad.predicate);
    const o = this.termToNTriples(quad.object);
    const g =
      quad.graph.termType !== 'DefaultGraph' ? ' ' + this.termToNTriples(quad.graph) : '';
    return `${s} ${p} ${o}${g} .`;
  }

  /**
   * Convert an RDF term to N-Triples format string
   */
  private termToNTriples(term: any): string {
    if (term.termType === 'NamedNode') {
      return `<${term.value}>`;
    } else if (term.termType === 'Literal') {
      const escaped = term.value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      let literal = `"${escaped}"`;
      if (term.language) {
        literal += `@${term.language}`;
      } else if (
        term.datatype &&
        term.datatype.value &&
        term.datatype.value !== 'http://www.w3.org/2001/XMLSchema#string'
      ) {
        literal += `^^<${term.datatype.value}>`;
      }
      return literal;
    } else if (term.termType === 'BlankNode') {
      return `_:${term.value}`;
    }
    return term.value;
  }
}

// Export singleton instance
export const rdfProcessor = new RDFProcessor();
