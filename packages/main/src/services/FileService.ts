import { dialog } from 'electron'
import { promises as fs } from 'fs'

interface BackendMetadata {
  id: string
  name: string
}

interface QueryFileData {
  content: string
  metadata: BackendMetadata | null
  filePath: string
}

export class FileService {
  /**
   * Show save dialog and save query to .rq file with backend metadata
   */
  async saveQuery(
    query: string,
    backendMetadata: BackendMetadata | null,
    currentFilePath?: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save SPARQL Query',
        defaultPath: currentFilePath || 'query.rq',
        filters: [
          { name: 'SPARQL Query', extensions: ['rq', 'sparql'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })

      if (canceled || !filePath) {
        return { success: false }
      }

      // Build file content with metadata comment
      let fileContent = ''
      if (backendMetadata) {
        const metadataJson = JSON.stringify(backendMetadata)
        fileContent = `# Shiny Backend: ${metadataJson}\n`
      }
      fileContent += query

      await fs.writeFile(filePath, fileContent, 'utf-8')

      return { success: true, filePath }
    } catch (error) {
      console.error('Error saving query:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Show open dialog and read .rq file with metadata parsing
   */
  async openQuery(): Promise<QueryFileData | { error: string }> {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Open SPARQL Query',
        filters: [
          { name: 'SPARQL Query', extensions: ['rq', 'sparql'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      })

      if (canceled || filePaths.length === 0) {
        return { error: 'No file selected' }
      }

      const filePath = filePaths[0]
      return await this.readQueryFile(filePath)
    } catch (error) {
      console.error('Error opening query:', error)
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Read and parse a query file (used for file association handling)
   */
  async readQueryFile(filePath: string): Promise<QueryFileData | { error: string }> {
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8')
      const { content, metadata } = this.parseQueryFile(fileContent)

      return {
        content,
        metadata,
        filePath,
      }
    } catch (error) {
      console.error('Error reading query file:', error)
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Show open dialog and read .ttl prefix file
   */
  async openPrefixFile(): Promise<{ content: string } | { error: string }> {
    try {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'Open Turtle Prefix File',
        filters: [
          { name: 'Turtle', extensions: ['ttl'] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile'],
      })

      if (canceled || filePaths.length === 0) {
        return { error: 'No file selected' }
      }

      const filePath = filePaths[0]
      const content = await fs.readFile(filePath, 'utf-8')

      return { content }
    } catch (error) {
      console.error('Error opening prefix file:', error)
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Show save dialog and save query results to file
   */
  async saveResults(
    content: string,
    _queryType: string,
    format: string
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      // Determine file extension based on format
      const extensionMap: Record<string, string> = {
        csv: 'csv',
        json: 'json',
        turtle: 'ttl',
        trig: 'trig',
        ntriples: 'nt',
        nquads: 'nq',
        jsonld: 'jsonld',
      }

      const extension = extensionMap[format] || 'txt'
      const defaultFileName = `results.${extension}`

      // Determine filter name based on format
      const filterNames: Record<string, string> = {
        csv: 'CSV',
        json: 'JSON',
        turtle: 'Turtle',
        trig: 'TriG',
        ntriples: 'N-Triples',
        nquads: 'N-Quads',
        jsonld: 'JSON-LD',
      }

      const filterName = filterNames[format] || 'Text'

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Query Results',
        defaultPath: defaultFileName,
        filters: [
          { name: filterName, extensions: [extension] },
          { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['createDirectory', 'showOverwriteConfirmation'],
      })

      if (canceled || !filePath) {
        return { success: false }
      }

      await fs.writeFile(filePath, content, 'utf-8')

      return { success: true, filePath }
    } catch (error) {
      console.error('Error saving results:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Parse query file content and extract metadata
   */
  private parseQueryFile(fileContent: string): {
    content: string
    metadata: BackendMetadata | null
  } {
    const lines = fileContent.split('\n')
    let metadata: BackendMetadata | null = null
    let contentStartIndex = 0

    // Check first line for metadata comment
    if (lines.length > 0 && lines[0].trim().startsWith('# Shiny Backend:')) {
      try {
        const metadataLine = lines[0].trim()
        const jsonStart = metadataLine.indexOf('{')
        if (jsonStart !== -1) {
          const jsonStr = metadataLine.substring(jsonStart)
          metadata = JSON.parse(jsonStr)
        }
        contentStartIndex = 1
      } catch (error) {
        console.warn('Failed to parse backend metadata:', error)
      }
    }

    // Extract query content (everything after metadata line)
    const content = lines.slice(contentStartIndex).join('\n').trim()

    return { content, metadata }
  }
}

// Singleton instance
export const fileService = new FileService()
