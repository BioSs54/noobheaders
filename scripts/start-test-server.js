#!/usr/bin/env node

/**
 * Standalone test server
 * Run this to start the test server for manual testing
 */

import { createTestServer } from '../e2e/test-server.js';

const PORT = process.env.PORT || 3456;

console.log(`🚀 Starting test server on http://localhost:${PORT}`);

const server = await createTestServer(PORT);

console.log(`✅ Test server running on http://localhost:${PORT}`);
console.log('📡 Test endpoints:');
console.log(`   - GET http://localhost:${PORT}/ (homepage)`);
console.log(`   - GET http://localhost:${PORT}/headers (view headers)`);
console.log(`   - GET http://localhost:${PORT}/response-headers (test response headers)`);
console.log('\nPress Ctrl+C to stop\n');

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
