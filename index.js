#!/usr/bin/env node

const { program } = require('commander');
const ora = require('ora').default;
const fs = require('fs');
const path = require('path');
const { downloadInstagramReel, validateInstagramUrl } = require('./downloader');

// CLI-specific download wrapper with spinner
async function downloadWithSpinner(url, outputDir) {
  console.log(`\nProcessing: ${url}`);
  
  const spinner = ora('Fetching reel data...').start();
  
  try {
    const result = await downloadInstagramReel(url, outputDir, {
      onProgress: (percent) => {
        spinner.text = `Downloading video... ${percent}%`;
      }
    });
    
    spinner.succeed('Video downloaded successfully');
    
    // Display results
    console.log('\nReel Information:');
    if (result.thumbnailUrl) {
      console.log(`- Thumbnail: ${result.thumbnailUrl}`);
    }
    console.log(`- Video saved to: ${result.path}`);
    
    return result.path;
  } catch (error) {
    spinner.fail('Failed to download reel');
    throw error;
  }
}

// Batch download function
async function batchDownload(filePath, outputDir) {
  try {
    const urls = fs.readFileSync(filePath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    
    console.log(`Found ${urls.length} URLs to download\n`);
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };
    
    for (const [index, url] of urls.entries()) {
      console.log(`\n[${index + 1}/${urls.length}] Processing URL...`);
      try {
        await downloadWithSpinner(url, outputDir);
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({ url, error: error.message });
        console.error(`Error: ${error.message}`);
      }
    }
    
    // Summary
    console.log('\n=== Download Summary ===');
    console.log(`Successful: ${results.successful}`);
    console.log(`Failed: ${results.failed}`);
    
    if (results.errors.length > 0) {
      console.log('\nFailed URLs:');
      results.errors.forEach(({ url, error }) => {
        console.log(`- ${url}: ${error}`);
      });
    }
  } catch (error) {
    console.error(`Error reading batch file: ${error.message}`);
    process.exit(1);
  }
}

// CLI setup
program
  .name('instagram-reels-downloader')
  .description('Download Instagram Reels videos')
  .version('1.0.0')
  .argument('[url]', 'Instagram reel URL to download')
  .option('-o, --output <dir>', 'output directory', './downloads')
  .option('-b, --batch <file>', 'batch download from file containing URLs')
  .action(async (url, options) => {
    try {
      if (options.batch) {
        // Batch download mode
        await batchDownload(options.batch, options.output);
      } else if (url) {
        // Single URL download
        await downloadWithSpinner(url, options.output);
      } else {
        // No URL provided
        console.error('Error: Please provide an Instagram URL or use --batch option');
        program.help();
      }
    } catch (error) {
      console.error(`\nError: ${error.message}`);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();