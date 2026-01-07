import http from 'node:http';

/**
 * Simple HTTP server for testing headers
 * Returns received headers as JSON
 */
export function createTestServer(port = 3456) {
  const server = http.createServer((req, res) => {
    // Enable CORS for extension
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Expose-Headers', '*');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === '/headers') {
      // Return request headers as JSON
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(
        JSON.stringify(
          {
            headers: req.headers,
            method: req.method,
            url: req.url,
          },
          null,
          2
        )
      );
    } else if (req.url === '/response-headers') {
      // Test response headers modification
      res.setHeader('X-Original-Response', 'from-server');
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);

      // Return both request and response headers
      res.end(
        JSON.stringify(
          {
            requestHeaders: req.headers,
            responseHeaders: {
              'X-Original-Response': 'from-server',
              'Content-Type': 'application/json',
            },
          },
          null,
          2
        )
      );
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) {
        reject(err);
      } else {
        console.log(`Test server listening on http://localhost:${port}`);
        resolve(server);
      }
    });
  });
}

export function closeServer(server) {
  return new Promise((resolve) => {
    server.close(() => {
      console.log('Test server closed');
      resolve();
    });
  });
}
