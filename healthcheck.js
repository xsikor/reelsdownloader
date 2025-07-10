#!/usr/bin/env node

// Simple health check for Docker
// Returns 0 if healthy, 1 if unhealthy

const fs = require('fs');
const path = require('path');

try {
  // Check if the app can write to temp directory
  const tempDir = process.env.DOWNLOAD_DIR || path.join(__dirname, 'temp');
  const testFile = path.join(tempDir, '.healthcheck');
  
  // Try to write a test file
  fs.writeFileSync(testFile, Date.now().toString());
  
  // Try to read it back
  fs.readFileSync(testFile);
  
  // Clean up
  fs.unlinkSync(testFile);
  
  console.log('Health check passed');
  process.exit(0);
} catch (error) {
  console.error('Health check failed:', error.message);
  process.exit(1);
}