const { igdl, ttdl, fbdown, youtube, twitter } = require('btch-downloader');
const { Downloader: TiktokDownloader } = require('@tobyg74/tiktok-api-dl');
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
            parsedUrl.hostname === 'vm.tiktok.com' ||
            parsedUrl.hostname === 'vt.tiktok.com') &&
           (parsedUrl.pathname.includes('/video/') ||
            parsedUrl.pathname.match(/\/@[\w.-]+\/video\/\d+/) ||
            parsedUrl.hostname === 'vm.tiktok.com' ||
            parsedUrl.hostname === 'vt.tiktok.com');
  } catch {
    return false;
  }
}

// Helper function to extract TikTok video ID
function extractTikTokId(url) {
  // Handle vm.tiktok.com and vt.tiktok.com short URLs
  if (url.includes('vm.tiktok.com') || url.includes('vt.tiktok.com')) {
    const match = url.match(/v[mt]\.tiktok\.com\/([a-zA-Z0-9]+)/);
    return match ? match[1] : null;
  }
  // Handle regular tiktok.com URLs
  const match = url.match(/video\/(\d+)/);
  return match ? match[1] : null;
}

// Helper function to resolve TikTok short URLs (vm.tiktok.com, vt.tiktok.com)
async function resolveTikTokShortUrl(url) {
  if (!url.includes('vm.tiktok.com') && !url.includes('vt.tiktok.com')) {
    return url; // Not a short URL, return as-is
  }

  try {
    const response = await axios.get(url, {
      maxRedirects: 5,
      validateStatus: (status) => status >= 200 && status < 400,
      timeout: 10000
    });

    // Return the final URL after redirects
    return response.request.res.responseUrl || url;
  } catch (error) {
    // If redirect resolution fails, return original URL
    console.error('Failed to resolve short URL:', error.message);
    return url;
  }
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
    // Resolve short URLs (vm.tiktok.com, vt.tiktok.com) to full URLs
    const resolvedUrl = await resolveTikTokShortUrl(url);
    if (resolvedUrl !== url && !quiet) {
      console.log(`Resolved short URL to: ${resolvedUrl}`);
    }

    // Try btch-downloader first, fall back to alternative if it fails
    const fetchStartTime = Date.now();
    let videoUrl = null;
    let thumbnailUrl = null;
    let usedFallback = false;

    try {
      const result = await ttdl(resolvedUrl);
      timings.fetchMs = Date.now() - fetchStartTime;

      // Check if btch-downloader returned an error
      if (result && result.status === false) {
        throw new Error(result.message || 'btch-downloader failed');
      }

      // Extract video URL from btch-downloader response
      if (result && result.video && Array.isArray(result.video) && result.video.length > 0) {
        videoUrl = result.video[0];
        thumbnailUrl = result.thumbnail;
      } else if (Array.isArray(result) && result.length > 0) {
        const firstItem = result[0];
        videoUrl = firstItem.url;
        thumbnailUrl = firstItem.thumbnail;
      } else if (result && result.data && result.data.length > 0) {
        const videoItem = result.data.find(item => item.url && (item.url.includes('.mp4') || item.type === 'video'));
        videoUrl = videoItem ? videoItem.url : result.data[0].url;
      }

      if (!videoUrl) {
        throw new Error('No video URL in btch-downloader response');
      }
    } catch (primaryError) {
      // Fallback to alternative TikTok downloader
      if (!quiet) {
        console.log(`Primary downloader failed, trying fallback method...`);
      }

      try {
        const fallbackStartTime = Date.now();
        const fallbackResult = await TiktokDownloader(resolvedUrl, { version: "v3" });
        timings.fetchMs = Date.now() - fallbackStartTime;
        usedFallback = true;

        if (fallbackResult.status === 'success' && fallbackResult.result) {
          // Prefer HD, fallback to SD
          videoUrl = fallbackResult.result.videoHD || fallbackResult.result.videoSD;
          thumbnailUrl = fallbackResult.result.author?.avatar;

          if (!quiet) {
            console.log(`Successfully retrieved video using fallback method`);
          }
        } else {
          throw new Error('Fallback downloader returned no video');
        }
      } catch (fallbackError) {
        // Both methods failed
        throw new Error(`Failed to download TikTok video. Primary error: ${primaryError.message}, Fallback error: ${fallbackError.message}`);
      }
    }

    if (!videoUrl) {
      throw new Error('Could not find video URL. The video might be private or unavailable.');
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
    const fetchStart = Date.now();
    const result = await twitter(url);
    timings.fetchMs = Date.now() - fetchStart;

    // ---------- Primary btch-downloader handling ----------
    if (result && result.status !== false) {
      const tweetText = result.title || '';

      // ---- Images ----
      let imageUrls = [];
      if (Array.isArray(result.image) && result.image.length) imageUrls = result.image;
      else if (typeof result.image === 'string') imageUrls = [result.image];
      if (imageUrls.length) {
        const statusId = extractTwitterId(url);
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const imagePaths = [];
        const dlStart = Date.now();
        for (let i = 0; i < imageUrls.length; i++) {
          const fname = statusId
            ? `twitter_image_${statusId}_${i + 1}`
            : `twitter_image_${Date.now()}_${i + 1}`;
          const out = path.join(outputDir, `${sanitizeFilename(fname)}.jpg`);
          await downloadImageQuiet(imageUrls[i], out, onProgress);
          imagePaths.push(out);
        }
        timings.downloadMs = Date.now() - dlStart;
        timings.totalMs = Date.now() - startTime;
        return {
          hasMedia: true,
          mediaType: 'image',
          paths: imagePaths,
          imageUrls,
          tweetText,
          platform: 'twitter',
          timings,
        };
      }

      // ---- Video ----
      if (result.url && (Array.isArray(result.url) ? result.url.length : true)) {
        let videoUrl = null;
        if (Array.isArray(result.url)) {
          const hd = result.url.find(i => i.hd);
          const sd = result.url.find(i => i.sd);
          videoUrl = hd?.hd || sd?.sd || (typeof result.url[0] === 'string' && result.url[0]);
        } else if (typeof result.url === 'string') {
          videoUrl = result.url;
        }
        if (videoUrl) {
          const statusId = extractTwitterId(url);
          const fname = statusId ? `twitter_video_${statusId}` : `twitter_video_${Date.now()}`;
          if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
          const outPath = path.join(outputDir, `${sanitizeFilename(fname)}.mp4`);
          const dlStart = Date.now();
          await downloadVideoQuiet(videoUrl, outPath, onProgress);
          timings.downloadMs = Date.now() - dlStart;
          timings.totalMs = Date.now() - startTime;
          return {
            hasMedia: true,
            mediaType: 'video',
            path: outPath,
            filename: `${sanitizeFilename(fname)}.mp4`,
            videoUrl,
            tweetText,
            platform: 'twitter',
            timings,
          };
        }
      }

      // ----- Proceed to fallback mechanisms (scraper‑twitter / oEmbed) -----
      // Note: if btch-downloader found text but no media, we still try fallbacks
      // to extract images that might have been missed.
    }

    // ---------- Fallback to fxtwitter API ----------
    try {
      // fxtwitter provides a reliable API for extracting tweet content
      const fxUrl = url.replace('twitter.com', 'api.fxtwitter.com').replace('x.com', 'api.fxtwitter.com');
      const fxResponse = await fetch(fxUrl);
      const fxData = await fxResponse.json();

      if (fxData && fxData.code === 200 && fxData.tweet) {
        const tweet = fxData.tweet;
        const tweetText = tweet.text || '';

        // Check for images
        if (tweet.media && tweet.media.photos && Array.isArray(tweet.media.photos) && tweet.media.photos.length > 0) {
          const statusId = extractTwitterId(url);
          if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

          const imagePaths = [];
          const imageUrls = [];
          const dlStart = Date.now();

          for (let i = 0; i < tweet.media.photos.length; i++) {
            const photo = tweet.media.photos[i];
            const imageUrl = photo.url;
            imageUrls.push(imageUrl);

            const fname = statusId
              ? `twitter_image_${statusId}_${i + 1}`
              : `twitter_image_${Date.now()}_${i + 1}`;

            // Detect extension from URL (usually .png or .jpg)
            const ext = imageUrl.includes('.png') ? 'png' : 'jpg';
            const outPath = path.join(outputDir, `${sanitizeFilename(fname)}.${ext}`);

            await downloadImageQuiet(imageUrl, outPath, onProgress);
            imagePaths.push(outPath);
          }

          timings.downloadMs = Date.now() - dlStart;
          timings.totalMs = Date.now() - startTime;

          return {
            hasMedia: true,
            mediaType: 'image',
            paths: imagePaths,
            imageUrls,
            tweetText,
            platform: 'twitter',
            timings,
          };
        }

        // Check for video
        if (tweet.media && tweet.media.videos && Array.isArray(tweet.media.videos) && tweet.media.videos.length > 0) {
          const video = tweet.media.videos[0];
          const videoUrl = video.url;
          const statusId = extractTwitterId(url);
          const fname = statusId ? `twitter_video_${statusId}` : `twitter_video_${Date.now()}`;
          if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
          const outPath = path.join(outputDir, `${sanitizeFilename(fname)}.mp4`);
          const dlStart = Date.now();
          await downloadVideoQuiet(videoUrl, outPath, onProgress);
          timings.downloadMs = Date.now() - dlStart;
          timings.totalMs = Date.now() - startTime;

          return {
            hasMedia: true,
            mediaType: 'video',
            path: outPath,
            filename: `${sanitizeFilename(fname)}.mp4`,
            videoUrl,
            tweetText,
            platform: 'twitter',
            timings,
          };
        }

        // If fxtwitter found text but no media, continue to next fallback
      }
    } catch (_) {
      // fxtwitter failed, try next fallback
    }

    // ---------- Fallback to @bochilteam/scraper-twitter ----------
    try {
      const { twitter: scrTwitter } = require('@bochilteam/scraper-twitter');
      const scr = await scrTwitter(url);
      const tweetText = scr.title || '';
      if (scr.media && Array.isArray(scr.media) && scr.media.length) {
        const first = scr.media[0];
        const isVideo = first.toLowerCase().endsWith('.mp4');
        const statusId = extractTwitterId(url);
        const fname = statusId
          ? `twitter_${isVideo ? 'video' : 'image'}_${statusId}`
          : `twitter_${isVideo ? 'video' : 'image'}_${Date.now()}`;
        if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
        const outPath = path.join(outputDir, `${sanitizeFilename(fname)}${isVideo ? '.mp4' : '.jpg'}`);
        const dlStart = Date.now();
        if (isVideo) await downloadVideoQuiet(first, outPath, onProgress);
        else await downloadImageQuiet(first, outPath, onProgress);
        timings.downloadMs = Date.now() - dlStart;
        timings.totalMs = Date.now() - startTime;
        return {
          hasMedia: true,
          mediaType: isVideo ? 'video' : 'image',
          path: outPath,
          filename: path.basename(outPath),
          videoUrl: isVideo ? first : undefined,
          tweetText,
          platform: 'twitter',
          timings,
        };
      }
      // Only text from scraper
      return { hasMedia: false, tweetText, platform: 'twitter', timings };
    } catch (_) {
      // ---------- Final fallback: oEmbed for plain text ----------
      try {
        const o = await (await fetch(`https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}&omit_script=1`)).json();
        // Attempt to extract image URL from the returned HTML (image‑only tweets)
        if (o.html) {
          const imgMatch = o.html.match(/<img[^>]+src=['"]([^'"]+)['"]/i);
          if (imgMatch && imgMatch[1]) {
            const imageUrl = imgMatch[1];
            const statusId = extractTwitterId(url);
            const filename = statusId ? `twitter_image_${statusId}` : `twitter_image_${Date.now()}`;
            if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
            const outPath = path.join(outputDir, `${sanitizeFilename(filename)}.jpg`);
            const dlStart = Date.now();
            await downloadImageQuiet(imageUrl, outPath, onProgress);
            timings.downloadMs = Date.now() - dlStart;
            timings.totalMs = Date.now() - startTime;
            return {
              hasMedia: true,
              mediaType: 'image',
              paths: [outPath],
              imageUrls: [imageUrl],
              tweetText: '',
              platform: 'twitter',
              timings,
            };
          }
          // Fallback to plain text if no image found
          const plain = o.html.replace(/<[^>]*>/g, '').trim();
          if (plain) {
            return { hasMedia: false, tweetText: plain, platform: 'twitter', timings };
          }
        }
      } catch (_) {}

      // ----- Additional fallback: scrape the tweet page for description and image -----
      try {
        const pageHtml = await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
        // Extract full tweet text from og:description
        let description = '';
        const descMatch = pageHtml.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        if (descMatch && descMatch[1]) {
          description = descMatch[1]
            .replace(/&amp;/g, '&')
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>');
        }

        // Extract image URL from og:image (covers single‑image tweets)
        const imgMatch = pageHtml.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (imgMatch && imgMatch[1]) {
          const imageUrl = imgMatch[1];
          const statusId = extractTwitterId(url);
          const filename = statusId ? `twitter_image_${statusId}` : `twitter_image_${Date.now()}`;
          if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
          const outPath = path.join(outputDir, `${sanitizeFilename(filename)}.jpg`);
          const dlStart = Date.now();
          await downloadImageQuiet(imageUrl, outPath, onProgress);
          timings.downloadMs = Date.now() - dlStart;
          timings.totalMs = Date.now() - startTime;
          return {
            hasMedia: true,
            mediaType: 'image',
            paths: [outPath],
            imageUrls: [imageUrl],
            tweetText: description,
            platform: 'twitter',
            timings,
          };
        }

        // If only description was found, return it
        if (description) {
          return { hasMedia: false, tweetText: description, platform: 'twitter', timings };
        }
      } catch (_) {}

      // If all fallbacks fail, return text from btch-downloader (if available)
      const tweetText = result?.title || '';
      return { hasMedia: false, tweetText, platform: 'twitter', timings };
    }
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
