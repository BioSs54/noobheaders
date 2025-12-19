#!/usr/bin/env node
// In CI we require GITHUB_TOKEN to be present. For local dry-runs (non-CI), skip strict verification.
if (process.env.CI === 'true') {
  const required = ['GITHUB_TOKEN'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing required release environment variables:', missing.join(', '));
    process.exit(1);
  }
  console.log('✅ Release environment looks good');
} else {
  console.log('⚠️ Running outside CI — skipping release environment verification (dry-run allowed)');
}
