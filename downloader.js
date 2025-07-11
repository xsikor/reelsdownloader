const { igdl, ttdl, fbdown } = require('btch-downloader');
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

// Helper function to validate TikTok URL
function validateTikTokUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return (parsedUrl.hostname === 'www.tiktok.com' || 
            parsedUrl.hostname === 'tiktok.com' ||
            parsedUrl.hostname === 'vm.tiktok.com') &&
           (parsedUrl.pathname.includes('/video/') || 
            parsedUrl.pathname.match(/\/@[\w.-]+\/video\/\d+/) ||
            parsedUrl.hostname === 'vm.tiktok.com');
  } catch {
    return false;
  }
}

// Helper function to extract TikTok video ID
function extractTikTokId(url) {
  // Handle vm.tiktok.com short URLs
  if (url.includes('vm.tiktok.com')) {
    const match = url.match(/vm\.tiktok\.com\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
  // Handle regular tiktok.com URLs
  const match = url.match(/video\/(\d+)/);
  return match ? match[1] : null;
}

// Helper function to validate Facebook URL
function validateFacebookUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.hostname === 'www.facebook.com' ||
      parsedUrl.hostname === 'facebook.com' ||
      parsedUrl.hostname === 'm.facebook.com' ||
      parsedUrl.hostname === 'fb.watch'
    );
  } catch {
    return false;
  }
}

// Helper function to extract Facebook video ID
function extractFacebookId(url) {
  const match = url.match(/(?:videos\/(\d+)|fb\.watch\/([A-Za-z0-9_-]+))/);
  return match ? (match[1] || match[2]) : null;
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

// TikTok download function
async function downloadTikTokVideo(url, outputDir = './downloads', options = {}) {
  const { quiet = false, onProgress = null } = options;
  
  // Validate URL
  if (!validateTikTokUrl(url)) {
    throw new Error('Invalid TikTok URL. Please provide a valid TikTok video URL.');
  }

  try {
    // Use btch-downloader to fetch TikTok data
    const result = await ttdl(url);
    
    // Check for error response
    if (result && result.status === false && result.message) {
      throw new Error(result.message);
    }
    
    // Extract video URL
    let videoUrl = null;
    let thumbnailUrl = null;
    
    if (result && result.video && Array.isArray(result.video) && result.video.length > 0) {
      // TikTok response format with video array
      videoUrl = result.video[0];
      thumbnailUrl = result.thumbnail;
    } else if (Array.isArray(result) && result.length > 0) {
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
      throw new Error('Could not find video URL in the response. The video might be private or the service is temporarily unavailable.');
    }
    
    // Create filename based on video ID or timestamp
    const videoId = extractTikTokId(url);
    const filename = videoId 
      ? `tiktok_video_${videoId}`
      : `tiktok_video_${Date.now()}`;
    
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
    throw new Error(`Failed to process TikTok video: ${error.message}`);
  }
}

// Facebook download function
async function downloadFacebookVideo(url, outputDir = './downloads', options = {}) {
  const { quiet = false, onProgress = null } = options;

  if (!validateFacebookUrl(url)) {
    throw new Error('Invalid Facebook URL. Please provide a valid Facebook video URL.');
  }

  try {
    const result = await fbdown(url);

    if (result && result.status === false && result.message) {
      throw new Error(result.message);
    }

    const videoUrl = result.HD || result.Normal_video;
    if (!videoUrl) {
      throw new Error('Could not find video URL in the response');
    }

    const videoId = extractFacebookId(url);
    const filename = videoId
      ? `facebook_video_${videoId}`
      : `facebook_video_${Date.now()}`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${sanitizeFilename(filename)}.mp4`);
    await downloadVideoQuiet(videoUrl, outputPath, onProgress);

    return {
      path: outputPath,
      filename: `${sanitizeFilename(filename)}.mp4`,
      thumbnailUrl: null,
      videoUrl
    };
  } catch (error) {
    throw new Error(`Failed to process Facebook video: ${error.message}`);
  }
}

// Generic download function that detects platform
async function downloadVideo(url, outputDir = './downloads', options = {}) {
  if (validateInstagramUrl(url)) {
    return await downloadInstagramReel(url, outputDir, options);
  } else if (validateTikTokUrl(url)) {
    return await downloadTikTokVideo(url, outputDir, options);
  } else if (validateFacebookUrl(url)) {
    return await downloadFacebookVideo(url, outputDir, options);
  } else {
    throw new Error('Invalid URL. Please provide a valid Instagram, TikTok or Facebook URL.');
  }
}

module.exports = {
  downloadInstagramReel,
  validateInstagramUrl,
  extractPostId,
  downloadTikTokVideo,
  validateTikTokUrl,
  extractTikTokId,
  downloadFacebookVideo,
  validateFacebookUrl,
  extractFacebookId,
  downloadVideo
};