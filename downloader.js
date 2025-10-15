const { igdl, ttdl, fbdown, youtube, twitter } = require('btch-downloader');
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

// Helper function to validate YouTube URL (supports all YouTube videos)
function validateYouTubeUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    if ([
      'youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be'
    ].includes(hostname)) {
      if (hostname === 'youtu.be') {
        return parsedUrl.pathname.length > 1;
      }

      // Support shorts
      if (parsedUrl.pathname.startsWith('/shorts/')) {
        return true;
      }

      // Support regular watch URLs
      if (parsedUrl.pathname === '/watch' || parsedUrl.pathname.startsWith('/watch')) {
        const videoId = parsedUrl.searchParams.get('v');
        return videoId && videoId.length > 0;
      }

      // Support embed URLs
      if (parsedUrl.pathname.startsWith('/embed/')) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Helper function to extract YouTube video ID
function extractYouTubeId(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    if (hostname === 'youtu.be') {
      return parsedUrl.pathname.replace(/^\//, '').split(/[?&#]/)[0] || null;
    }

    if (parsedUrl.pathname.startsWith('/shorts/')) {
      return parsedUrl.pathname.split('/shorts/')[1]?.split(/[?&#]/)[0] || null;
    }

    const videoId = parsedUrl.searchParams.get('v');
    return videoId || null;
  } catch {
    return null;
  }
}

// Helper function to validate Twitter/X URL
function validateTwitterUrl(url) {
  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.replace(/^www\./, '');

    // Support both twitter.com and x.com
    if (['twitter.com', 'x.com'].includes(hostname)) {
      // Check if it's a status URL
      return parsedUrl.pathname.includes('/status/');
    }
    return false;
  } catch {
    return false;
  }
}

// Helper function to extract Twitter status ID
function extractTwitterId(url) {
  try {
    const match = url.match(/\/status\/(\d+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
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
  const startTime = Date.now();
  const timings = { platform: 'instagram' };
  
  // Validate URL
  if (!validateInstagramUrl(url)) {
    throw new Error('Invalid Instagram URL. Please provide a valid Instagram post or reel URL.');
  }

  try {
    // Use btch-downloader to fetch Instagram data
    const fetchStartTime = Date.now();
    const result = await igdl(url);
    timings.fetchMs = Date.now() - fetchStartTime;

    if (result && result.status === false) {
      throw new Error(result.message || 'Instagram downloader service returned an error');
    }

    // Extract video URL
    let videoUrl = null;
    let thumbnailUrl = null;

    const getCandidateFromItems = (items = []) => {
      if (!Array.isArray(items) || items.length === 0) {
        return null;
      }

      return items.find(item => item && item.url && (item.url.includes('.mp4') || item.type === 'video'))
        || items.find(item => item && item.url)
        || null;
    };

    if (Array.isArray(result) && result.length > 0) {
      // Older btch-downloader versions return an array directly
      const candidate = getCandidateFromItems(result);
      if (candidate?.url) {
        videoUrl = candidate.url;
      }
      if (candidate?.thumbnail) {
        thumbnailUrl = candidate.thumbnail;
      }
    } else if (Array.isArray(result?.result) && result.result.length > 0) {
      // Newer btch-downloader versions wrap results in a "result" array
      const candidate = getCandidateFromItems(result.result);
      if (candidate?.url) {
        videoUrl = candidate.url;
      }
      if (candidate?.thumbnail) {
        thumbnailUrl = candidate.thumbnail;
      }
    } else if (Array.isArray(result?.data) && result.data.length > 0) {
      // Alternative response format
      const candidate = getCandidateFromItems(result.data);
      if (candidate?.url) {
        videoUrl = candidate.url;
      }
      if (candidate?.thumbnail) {
        thumbnailUrl = candidate.thumbnail;
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
    const downloadStartTime = Date.now();
    await downloadVideoQuiet(videoUrl, outputPath, onProgress);
    timings.downloadMs = Date.now() - downloadStartTime;
    timings.totalMs = Date.now() - startTime;
    
    return {
      path: outputPath,
      filename: `${sanitizeFilename(filename)}.mp4`,
      thumbnailUrl,
      videoUrl,
      timings
    };
  } catch (error) {
    throw new Error(`Failed to process reel: ${error.message}`);
  }
}

// TikTok download function
async function downloadTikTokVideo(url, outputDir = './downloads', options = {}) {
  const { quiet = false, onProgress = null } = options;
  const startTime = Date.now();
  const timings = { platform: 'tiktok' };
  
  // Validate URL
  if (!validateTikTokUrl(url)) {
    throw new Error('Invalid TikTok URL. Please provide a valid TikTok video URL.');
  }

  try {
    // Use btch-downloader to fetch TikTok data
    const fetchStartTime = Date.now();
    const result = await ttdl(url);
    timings.fetchMs = Date.now() - fetchStartTime;
    
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
    const downloadStartTime = Date.now();
    await downloadVideoQuiet(videoUrl, outputPath, onProgress);
    timings.downloadMs = Date.now() - downloadStartTime;
    timings.totalMs = Date.now() - startTime;
    
    return {
      path: outputPath,
      filename: `${sanitizeFilename(filename)}.mp4`,
      thumbnailUrl,
      videoUrl,
      timings
    };
  } catch (error) {
    throw new Error(`Failed to process TikTok video: ${error.message}`);
  }
}

// Facebook download function
async function downloadFacebookVideo(url, outputDir = './downloads', options = {}) {
  const { quiet = false, onProgress = null } = options;
  const startTime = Date.now();
  const timings = { platform: 'facebook' };

  if (!validateFacebookUrl(url)) {
    throw new Error('Invalid Facebook URL. Please provide a valid Facebook video URL.');
  }

  try {
    const fetchStartTime = Date.now();
    const result = await fbdown(url);
    timings.fetchMs = Date.now() - fetchStartTime;

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
    const downloadStartTime = Date.now();
    await downloadVideoQuiet(videoUrl, outputPath, onProgress);
    timings.downloadMs = Date.now() - downloadStartTime;
    timings.totalMs = Date.now() - startTime;

    return {
      path: outputPath,
      filename: `${sanitizeFilename(filename)}.mp4`,
      thumbnailUrl: null,
      videoUrl,
      timings
    };
  } catch (error) {
    throw new Error(`Failed to process Facebook video: ${error.message}`);
  }
}

// YouTube download function (supports all YouTube videos)
async function downloadYouTubeShort(url, outputDir = './downloads', options = {}) {
  const { quiet = false, onProgress = null } = options;
  const startTime = Date.now();
  const timings = { platform: 'youtube' };

  if (!validateYouTubeUrl(url)) {
    throw new Error('Invalid YouTube URL. Please provide a valid YouTube video link.');
  }

  try {
    const fetchStartTime = Date.now();
    const result = await youtube(url);
    timings.fetchMs = Date.now() - fetchStartTime;

    if (!result) {
      throw new Error('Could not retrieve YouTube data');
    }

    // Handle error response
    if (result.status === false) {
      throw new Error(result.message || 'Could not retrieve YouTube data');
    }

    // The actual response structure is simple:
    // { developer, title, thumbnail, author, mp3, mp4 }
    let videoUrl = null;

    // Direct string URL in mp4 field
    if (result.mp4) {
      if (typeof result.mp4 === 'string') {
        videoUrl = result.mp4;
      } else if (Array.isArray(result.mp4) && result.mp4.length > 0) {
        // Handle potential array format (backwards compatibility)
        const firstItem = result.mp4[0];
        videoUrl = typeof firstItem === 'string' ? firstItem : firstItem?.url;
      } else if (typeof result.mp4 === 'object') {
        // Handle object format (backwards compatibility)
        videoUrl = result.mp4.url || result.mp4.link || result.mp4.download_url;
      }
    }

    if (!videoUrl) {
      throw new Error('Could not find downloadable MP4 stream for this video');
    }

    const videoId = extractYouTubeId(url);
    const filename = videoId
      ? `youtube_video_${videoId}`
      : `youtube_video_${Date.now()}`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${sanitizeFilename(filename)}.mp4`);
    const downloadStartTime = Date.now();
    await downloadVideoQuiet(videoUrl, outputPath, onProgress);
    timings.downloadMs = Date.now() - downloadStartTime;
    timings.totalMs = Date.now() - startTime;

    return {
      path: outputPath,
      filename: `${sanitizeFilename(filename)}.mp4`,
      thumbnailUrl: result.thumbnail || null,
      videoUrl,
      title: result.title || null,
      author: result.author || null,
      timings
    };
  } catch (error) {
    throw new Error(`Failed to process YouTube video: ${error.message}`);
  }
}

// Helper function to download image without spinner
async function downloadImageQuiet(imageUrl, outputPath, onProgress) {
  try {
    const response = await axios({
      method: 'GET',
      url: imageUrl,
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
    throw new Error(`Failed to download image: ${error.message}`);
  }
}

// Twitter/X download function
async function downloadTwitterVideo(url, outputDir = './downloads', options = {}) {
  const { quiet = false, onProgress = null } = options;
  const startTime = Date.now();
  const timings = { platform: 'twitter' };

  if (!validateTwitterUrl(url)) {
    throw new Error('Invalid Twitter/X URL. Please provide a valid Twitter/X status URL.');
  }

  try {
    const fetchStartTime = Date.now();
    const result = await twitter(url);
    timings.fetchMs = Date.now() - fetchStartTime;

    if (!result) {
      throw new Error('Could not retrieve Twitter/X data');
    }

    // Handle error response
    if (result.status === false) {
      throw new Error(result.message || 'Could not retrieve Twitter/X data');
    }

    // Extract tweet text (title contains the tweet text)
    const tweetText = result.title || '';

    // Check for images first
    let imageUrls = [];
    if (result.image && Array.isArray(result.image) && result.image.length > 0) {
      imageUrls = result.image;
    } else if (result.image && typeof result.image === 'string') {
      imageUrls = [result.image];
    }

    // If images found, download them
    if (imageUrls.length > 0) {
      const statusId = extractTwitterId(url);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const imagePaths = [];
      const downloadStartTime = Date.now();

      for (let i = 0; i < imageUrls.length; i++) {
        const imageUrl = imageUrls[i];
        const filename = statusId
          ? `twitter_image_${statusId}_${i + 1}`
          : `twitter_image_${Date.now()}_${i + 1}`;

        const outputPath = path.join(outputDir, `${sanitizeFilename(filename)}.jpg`);
        await downloadImageQuiet(imageUrl, outputPath, onProgress);
        imagePaths.push(outputPath);
      }

      timings.downloadMs = Date.now() - downloadStartTime;
      timings.totalMs = Date.now() - startTime;

      return {
        hasMedia: true,
        mediaType: 'image',
        paths: imagePaths,
        imageUrls,
        tweetText: tweetText,
        platform: 'twitter',
        timings
      };
    }

    // Check for video URLs
    let hasMedia = false;
    let videoUrl = null;

    if (result.url && Array.isArray(result.url) && result.url.length > 0) {
      hasMedia = true;
      // Prefer HD quality if available
      const hdVideo = result.url.find(item => item.hd);
      const sdVideo = result.url.find(item => item.sd);

      if (hdVideo && hdVideo.hd) {
        videoUrl = hdVideo.hd;
      } else if (sdVideo && sdVideo.sd) {
        videoUrl = sdVideo.sd;
      } else if (typeof result.url[0] === 'string') {
        videoUrl = result.url[0];
      }
    } else if (result.url && typeof result.url === 'string') {
      hasMedia = true;
      videoUrl = result.url;
    }

    // If no media found, return with just the text
    if (!hasMedia || !videoUrl) {
      return {
        hasMedia: false,
        tweetText: tweetText,
        platform: 'twitter',
        timings
      };
    }

    // Download the video
    const statusId = extractTwitterId(url);
    const filename = statusId
      ? `twitter_video_${statusId}`
      : `twitter_video_${Date.now()}`;

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `${sanitizeFilename(filename)}.mp4`);
    const downloadStartTime = Date.now();
    await downloadVideoQuiet(videoUrl, outputPath, onProgress);
    timings.downloadMs = Date.now() - downloadStartTime;
    timings.totalMs = Date.now() - startTime;

    return {
      hasMedia: true,
      mediaType: 'video',
      path: outputPath,
      filename: `${sanitizeFilename(filename)}.mp4`,
      videoUrl,
      tweetText: tweetText,
      platform: 'twitter',
      timings
    };
  } catch (error) {
    throw new Error(`Failed to process Twitter/X post: ${error.message}`);
  }
}

// Generic download function that detects platform
async function downloadVideo(url, outputDir = './downloads', options = {}) {
  const startTime = Date.now();
  let result;
  
  try {
    if (validateInstagramUrl(url)) {
      result = await downloadInstagramReel(url, outputDir, options);
    } else if (validateTikTokUrl(url)) {
      result = await downloadTikTokVideo(url, outputDir, options);
    } else if (validateFacebookUrl(url)) {
      result = await downloadFacebookVideo(url, outputDir, options);
    } else if (validateYouTubeUrl(url)) {
      result = await downloadYouTubeShort(url, outputDir, options);
    } else if (validateTwitterUrl(url)) {
      result = await downloadTwitterVideo(url, outputDir, options);
    } else {
      throw new Error('Invalid URL. Please provide a valid Instagram, TikTok, Facebook, YouTube or Twitter/X URL.');
    }
    
    // Add timing information to result
    const totalTime = Date.now() - startTime;
    result.timings = {
      ...result.timings,
      totalMs: totalTime,
      startTime,
      endTime: Date.now()
    };
    
    return result;
  } catch (error) {
    const totalTime = Date.now() - startTime;
    error.timings = {
      totalMs: totalTime,
      startTime,
      endTime: Date.now(),
      failed: true
    };
    throw error;
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
  downloadYouTubeShort,
  validateYouTubeUrl,
  extractYouTubeId,
  downloadTwitterVideo,
  validateTwitterUrl,
  extractTwitterId,
  downloadVideo
};
