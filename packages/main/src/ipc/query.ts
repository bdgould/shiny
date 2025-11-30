import { ipcMain } from 'electron';
import axios from 'axios';
import { Parser } from 'sparqljs';

const parser = new Parser();

// Detect SPARQL query type
function detectQueryType(query: string): string {
  try {
    const parsed = parser.parse(query);
    // Check if it's a Query (not an Update)
    if ('queryType' in parsed) {
      return parsed.queryType.toUpperCase();
    }
    // If it's an Update or unknown, default to SELECT
    return 'SELECT';
  } catch {
    return 'SELECT';
  }
}

// Get appropriate Accept header based on query type
function getAcceptHeader(queryType: string): string {
  switch (queryType) {
    case 'SELECT':
    case 'ASK':
      return 'application/sparql-results+json';
    case 'CONSTRUCT':
    case 'DESCRIBE':
      // Request Turtle (most readable and parseable RDF format)
      return 'text/turtle';
    default:
      return 'application/sparql-results+json';
  }
}

// Validate sender is authorized
function isAuthorizedSender(frame: Electron.WebFrameMain): boolean {
  const url = frame.url;
  return url.startsWith('file://') || url.startsWith('http://localhost:5173');
}

// Execute SPARQL query
ipcMain.handle('query:execute', async (event, { query, endpoint }) => {
  // 1. Validate sender
  if (!isAuthorizedSender(event.senderFrame)) {
    throw new Error('Unauthorized IPC sender');
  }

  // 2. Validate input
  if (typeof query !== 'string' || typeof endpoint !== 'string') {
    throw new Error('Invalid parameters');
  }

  if (query.length > 100000) {
    throw new Error('Query too large (max 100KB)');
  }

  if (!endpoint.startsWith('http://') && !endpoint.startsWith('https://')) {
    throw new Error('Invalid endpoint URL');
  }

  try {
    // 3. Detect query type and set appropriate headers
    const queryType = detectQueryType(query);
    const acceptHeader = getAcceptHeader(queryType);
    const isRdfResponse = queryType === 'CONSTRUCT' || queryType === 'DESCRIBE';

    // 4. Execute query using SPARQL protocol
    const response = await axios({
      method: 'POST',
      url: endpoint,
      headers: {
        'Content-Type': 'application/sparql-query',
        'Accept': acceptHeader,
      },
      data: query,
      timeout: 30000, // 30 second timeout
      // For RDF responses, get as text; for JSON responses, parse automatically
      responseType: isRdfResponse ? 'text' : 'json',
    });

    // Return structured response with metadata
    return {
      data: response.data,
      queryType,
      contentType: response.headers['content-type'],
    };
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      const statusCode = error.response?.status;
      const message = error.response?.data?.message || error.message;

      throw new Error(
        `SPARQL query failed (${statusCode || 'network error'}): ${message}`
      );
    }

    throw new Error(`Query execution failed: ${error.message}`);
  }
});
