const { igdl } = require('btch-downloader');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

// Helper function to validate Instagram URL
function validateInstagramUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname === 'www.instagram.com' && 
           (parsedUrl.pathname.includes('/reel/') || parsedUrl.pathname.includes('/p/'));
  } catch {
    return false;
  }
}

// Helper function to sanitize filename
function sanitizeFilename(filename) {
  return filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

// Helper function to extract post ID from URL
function extractPostId(url) {
  const match = url.match(/\/(reel|p)\/([a-zA-Z0-9_-]+)/);
  return match ? match[2] : null;
}

// Function to download video without spinner (for bot usage)
async function downloadVideoQuiet(videoUrl, outputPath, onProgress) {
  try {
    const response = await axios({
      method: 'GET',
      url: videoUrl,
      responseType: 'stream',
      onDownloadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      }
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    throw new Error(`Failed to download video: ${error.message}`);
  }
}

// Main download function without CLI-specific features
async function downloadInstagramReel(url, outputDir = './downloads', options = {}) {
  const { quiet = false, onProgress = null } = options;
  
  // Validate URL
  if (!validateInstagramUrl(url)) {
    throw new Error('Invalid Instagram URL. Please provide a valid Instagram post or reel URL.');
  }

  try {
    // Use btch-downloader to fetch Instagram data
    const result = await igdl(url);
    
    // Extract video URL
    let videoUrl = null;
    let thumbnailUrl = null;
    
    if (Array.isArray(result) && result.length > 0) {
      // btch-downloader returns an array directly
      const firstItem = result[0];
      if (firstItem.url) {
        videoUrl = firstItem.url;
      }
      if (firstItem.thumbnail) {
        thumbnailUrl = firstItem.thumbnail;
      }
    } else if (result && result.data && result.data.length > 0) {
      // Alternative response format
      const videoItem = result.data.find(item => item.url && (item.url.includes('.mp4') || item.type === 'video'));
      if (videoItem) {
        videoUrl = videoItem.url;
      } else if (result.data[0].url) {
        videoUrl = result.data[0].url;
      }
    }
    
    if (!videoUrl) {
      throw new Error('Could not find video URL in the response');
    }
    
    // Create filename based on post ID or timestamp
    const postId = extractPostId(url);
    const filename = postId 
      ? `instagram_reel_${postId}`
      : `instagram_reel_${Date.now()}`;
    
    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Download the video
    const outputPath = path.join(outputDir, `${sanitizeFilename(filename)}.mp4`);
    await downloadVideoQuiet(videoUrl, outputPath, onProgress);
    
    return {
      path: outputPath,
      filename: `${sanitizeFilename(filename)}.mp4`,
      thumbnailUrl,
      videoUrl
    };
  } catch (error) {
    throw new Error(`Failed to process reel: ${error.message}`);
  }
}

module.exports = {
  downloadInstagramReel,
  validateInstagramUrl,
  extractPostId
};