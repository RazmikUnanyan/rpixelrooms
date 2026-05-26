const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFile } = require('child_process');

const isDev = process.env.NODE_ENV === 'development';
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1000, minHeight: 680,
    backgroundColor: '#101113',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#141517', symbolColor: '#A6A7AB', height: 38 },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
    },
    show: false,
  });
  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
  }
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.webContents.session.setPermissionRequestHandler(
      (_wc, permission, cb) => cb(['media', 'camera', 'microphone'].includes(permission))
  );
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

const TMP_DIR = path.join(os.tmpdir(), 'pixel-rooms');
const ASSETS_DIR = path.join(__dirname, 'assets');

function ensureTmp() { if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true }); }
function cleanTmp() { try { fs.rmSync(TMP_DIR, { recursive: true, force: true }); } catch {} }
app.on('before-quit', cleanTmp);

function w(p) { return p.replace(/\\/g, '/'); }
function tmp(name) { ensureTmp(); return w(path.join(TMP_DIR, name)); }

ipcMain.handle('save-temp-clip', async (_e, { buffer, clipId }) => {
  try {
    const fp = tmp(`clip_${clipId}.webm`);
    fs.writeFileSync(fp, Buffer.from(buffer));
    return { ok: true, filePath: fp };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('save-temp-image', async (_e, { buffer, name }) => {
  try {
    const fp = tmp(name);
    fs.writeFileSync(fp, Buffer.from(buffer));
    return { ok: true, filePath: fp };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('pick-file', async (_e, { filters, title }) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title, filters, properties: ['openFile'],
  });
  if (canceled || !filePaths.length) return { ok: false };
  return { ok: true, filePath: filePaths[0] };
});

ipcMain.handle('get-default-assets', () => ({
  defaultExportDir: w(path.join(os.homedir(), 'Videos')),
}));

ipcMain.handle('export-video', async (_e, opts) => {
  const { clipPaths, outputFormat, introConfig, outroConfig, musicConfig, defaultName } = opts;

  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save video',
    defaultPath: path.join(os.homedir(), 'Videos', `${defaultName}.mp4`),
    filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
  });
  if (canceled || !filePath) return { ok: false };

  if (introConfig?.filePath) introConfig.filePath = w(introConfig.filePath);
  if (outroConfig?.filePath) outroConfig.filePath = w(outroConfig.filePath);
  if (musicConfig?.filePath) musicConfig.filePath = w(musicConfig.filePath);

  try {
    let ffmpegPath;
    try { ffmpegPath = require('@ffmpeg-installer/ffmpeg').path; }
    catch { ffmpegPath = 'ffmpeg'; }

    await runExport({
      ffmpegPath,
      clipPaths: clipPaths.map(p => w(p)),
      outputFormat, introConfig, outroConfig, musicConfig,
      outPath: w(filePath),
    });

    return { ok: true, filePath };
  } catch (e) {
    console.error('[export] FAILED:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('show-in-folder', async (_e, { filePath }) => {
  shell.showItemInFolder(filePath);
  return { ok: true };
});

ipcMain.handle('get-app-version', () => app.getVersion());

async function runExport({ ffmpegPath, clipPaths, outputFormat, introConfig, outroConfig, musicConfig, outPath }) {
  ensureTmp();
  // Delete only stale encoded files, not the saved clip webms
  ['intro.mp4','outro.mp4','intro_slide.png','outro_slide.png','concat.mp4','final.mp4'].forEach(f => {
    try { fs.unlinkSync(tmp(f)); } catch {}
  });
  for (let i = 0; i < 50; i++) { try { fs.unlinkSync(tmp(`seg_${i}.mp4`)); } catch {} }

  const isPortrait = outputFormat === 'portrait_9_16';
  const W = isPortrait ? 1080 : 1920;
  const H = isPortrait ? 1920 : 1080;

  // Portrait: crop to fill (no letterbox) — scale height to H, then crop width to W from center
  // Landscape: scale+pad with letterbox
  const scaleVf = isPortrait
      ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`
      : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

  // Encode each camera clip
  async function encodeClip(inp, out) {
    await ff(ffmpegPath, [
      '-y', '-i', inp,
      '-vf', scaleVf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '128k',
      '-ar', '44100', '-ac', '2',
      '-r', '30', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', out,
    ]);
  }

  // Encode clip segments
  const segments = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const out = tmp(`seg_${i}.mp4`);
    console.log(`[export] encoding clip ${i}`);
    await encodeClip(clipPaths[i], out);
    segments.push(out);
  }

  console.log('[export] clips done, concatenating...');

  // Concat clips first (no slides yet)
  let basePath;
  if (segments.length === 1) {
    basePath = segments[0];
  } else {
    basePath = tmp('base.mp4');
    const inputs = segments.flatMap(p => ['-i', p]);
    const n = segments.length;
    const filterStr = segments.map((_, i) => `[${i}:v][${i}:a]`).join('') + `concat=n=${n}:v=1:a=1[v][a]`;
    await ff(ffmpegPath, [
      '-y', ...inputs,
      '-filter_complex', filterStr,
      '-map', '[v]', '-map', '[a]',
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '128k',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
      basePath,
    ]);
  }

  // Apply intro/outro as animated overlays on top of the video
  let withSlides = basePath;

  if (introConfig?.enabled || outroConfig?.enabled) {
    // Get base video duration
    const dur = await getVideoDuration(ffmpegPath, basePath);
    console.log('[export] base duration:', dur);

    withSlides = tmp('with_slides.mp4');
    await applySlideOverlays({
      ffmpegPath, inputVideo: basePath, outPath: withSlides,
      introConfig, outroConfig, W, H, totalDur: dur,
    });
  }

  // Apply music
  let finalPath = withSlides;

  if (musicConfig?.enabled && musicConfig.filePath && fs.existsSync(musicConfig.filePath)) {
    console.log('[export] applying music...');
    finalPath = tmp('final.mp4');
    const vol = musicConfig.volume ?? 0.8;
    if (musicConfig.mode === 'replace') {
      await ff(ffmpegPath, [
        '-y', '-i', withSlides,
        '-stream_loop', '-1', '-i', musicConfig.filePath,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-filter:a', `volume=${vol}`, '-shortest', finalPath,
      ]);
    } else {
      await ff(ffmpegPath, [
        '-y', '-i', withSlides,
        '-stream_loop', '-1', '-i', musicConfig.filePath,
        '-filter_complex',
        `[0:a]volume=1.0[a0];[1:a]volume=${vol}[a1];[a0][a1]amix=inputs=2:duration=first[aout]`,
        '-map', '0:v:0', '-map', '[aout]',
        '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
        '-shortest', finalPath,
      ]);
    }
  }

  console.log('[export] copying to output...');
  fs.copyFileSync(finalPath, outPath);
  console.log('[export] DONE');
}

// Get video duration in seconds
function getVideoDuration(ffmpegPath, inputPath) {
  return new Promise((resolve) => {
    const proc = execFile(ffmpegPath, ['-i', inputPath], { maxBuffer: 10 * 1024 * 1024 }, (_err, _out, stderr) => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      if (m) {
        const secs = parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]);
        resolve(secs);
      } else {
        resolve(10); // fallback
      }
    });
  });
}

// Render a slide image to PNG at target size
async function renderSlideToPng(ffmpegPath, cfg, name, W, H) {
  const imgPath = cfg.filePath ? w(cfg.filePath) : null;
  const useImage = imgPath && fs.existsSync(imgPath);
  const outPng = tmp(`${name}_slide.png`);

  // Scale image to fill W×H (cover, crop center) with transparent bg support
  const scaleFilter = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`;

  if (useImage) {
    await ff(ffmpegPath, [
      '-y', '-i', imgPath,
      '-vf', scaleFilter,
      '-frames:v', '1', outPng,
    ]);
  } else {
    const hex = (cfg.color || '#000000').replace('#', '');
    await ff(ffmpegPath, [
      '-y',
      '-f', 'lavfi', '-i', `color=0x${hex}:size=${W}x${H}:rate=1`,
      '-frames:v', '1', outPng,
    ]);
  }

  // If there's text, overlay it
  if (cfg.text && cfg.text.trim()) {
    const txtPng = tmp(`${name}_slide_txt.png`);
    const t = cfg.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
    const fs2 = Math.round(H * 0.06);
    await ff(ffmpegPath, [
      '-y', '-i', outPng,
      '-vf', `drawtext=text='${t}':fontsize=${fs2}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=3:shadowy=3`,
      '-frames:v', '1', txtPng,
    ]);
    fs.copyFileSync(txtPng, outPng);
  }

  return outPng;
}

// Apply intro/outro as animated slide overlays (slide in from left, hold, slide out to right)
async function applySlideOverlays({ ffmpegPath, inputVideo, outPath, introConfig, outroConfig, W, H, totalDur }) {
  const fps = 30;
  // Animation: 0.5s slide in, hold for (duration-1)s, 0.5s slide out
  const animIn = 0.5;
  const animOut = 0.5;

  const inputs = ['-i', inputVideo];
  let filterParts = [];
  let lastVideo = '0:v';
  let lastAudio = '0:a';
  let inputIdx = 1;

  // INTRO overlay
  if (introConfig?.enabled) {
    const introDur = introConfig.duration || 3;
    const slidePng = await renderSlideToPng(ffmpegPath, introConfig, 'intro', W, H);
    inputs.push('-loop', '1', '-t', String(introDur + 0.1), '-i', slidePng);
    const si = inputIdx++;

    // x position: slide in from -W to 0 over animIn seconds, hold, slide out from 0 to W over animOut seconds
    const holdStart = animIn;
    const holdEnd = introDur - animOut;
    const xExpr = `if(lt(t,${animIn}),${W}-t/${animIn}*${W},if(lt(t,${holdEnd}),0,-(t-${holdEnd})/${animOut}*${W}))`;

    filterParts.push(`[${lastVideo}][${si}:v]overlay=x='${xExpr}':y=0:shortest=0:eof_action=pass[v${si}]`);
    lastVideo = `v${si}`;
  }

  // OUTRO overlay
  if (outroConfig?.enabled) {
    const outroDur = outroConfig.duration || 3;
    const slidePng = await renderSlideToPng(ffmpegPath, outroConfig, 'outro', W, H);
    inputs.push('-loop', '1', '-t', String(outroDur + 0.1), '-i', slidePng);
    const si = inputIdx++;

    // Outro appears near the end of the video
    const outroStart = Math.max(0, totalDur - outroDur);
    const holdEnd = outroDur - animOut;
    // t relative to outroStart
    const xExpr = `if(lt(t-${outroStart},0),-${W},if(lt(t-${outroStart},${animIn}),${W}-(t-${outroStart})/${animIn}*${W},if(lt(t-${outroStart},${holdEnd}),0,-(t-${outroStart}-${holdEnd})/${animOut}*${W})))`;

    filterParts.push(`[${lastVideo}][${si}:v]overlay=x='${xExpr}':y=0:shortest=0:eof_action=pass[v${si}]`);
    lastVideo = `v${si}`;
  }

  const filterComplex = filterParts.join(';');

  await ff(ffmpegPath, [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', `[${lastVideo}]`,
    '-map', `0:a`,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-c:a', 'aac', '-b:a', '128k',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    outPath,
  ]);
}

function ff(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = execFile(bin, args, { maxBuffer: 100 * 1024 * 1024 }, (err, _out, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve();
    });
    proc.stderr?.on('data', d => {
      if (mainWindow) mainWindow.webContents.send('ffmpeg-progress', String(d));
    });
  });
}