/**
 * Ambient module declarations for the RDF/JS packages that ship without
 * TypeScript types.
 *
 * Only the surface actually used by `services/rdf/rdfProcessor.ts` is declared
 * here - these are deliberately narrow rather than complete typings.
 */

declare module 'rdf-ext' {
  import type { DatasetCore, Quad } from '@rdfjs/types'

  /** A dataset as produced by rdf-ext, which adds streaming on top of DatasetCore. */
  export interface RdfExtDataset extends DatasetCore<Quad, Quad> {
    toStream(): unknown
    import(stream: unknown): Promise<RdfExtDataset>
  }

  interface RdfExtFactory {
    dataset(quads?: Quad[]): RdfExtDataset
  }

  const rdf: RdfExtFactory
  export default rdf
}

declare module '@rdfjs/parser-n3' {
  export default class ParserN3 {
    constructor(options?: { factory?: unknown })
    import(stream: unknown): unknown
  }
}

declare module '@rdfjs/serializer-turtle' {
  export default class SerializerTurtle {
    constructor(options?: Record<string, unknown>)
    import(stream: unknown): unknown
  }
}

declare module '@rdfjs/serializer-ntriples' {
  export default class SerializerNTriples {
    constructor(options?: Record<string, unknown>)
    import(stream: unknown): unknown
  }
}

declare module '@rdfjs/serializer-jsonld' {
  export default class SerializerJsonLd {
    constructor(options?: Record<string, unknown>)
    import(stream: unknown): unknown
  }
}
