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
  ['intro_slide.png','outro_slide.png','base.mp4','with_slides.mp4','final.mp4'].forEach(f => {
    try { fs.unlinkSync(tmp(f)); } catch {}
  });
  for (let i = 0; i < 50; i++) { try { fs.unlinkSync(tmp(`seg_${i}.mp4`)); } catch {} }

  const isPortrait = outputFormat === 'portrait_9_16';
  const W = isPortrait ? 1080 : 1920;
  const H = isPortrait ? 1920 : 1080;

  const scaleVf = isPortrait
      ? `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1`
      : `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`;

  async function encodeClip(inp, out) {
    await ff(ffmpegPath, [
      '-y', '-i', inp, '-vf', scaleVf,
      '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
      '-c:a', 'aac', '-b:a', '128k',
      '-ar', '44100', '-ac', '2',
      '-r', '30', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', out,
    ]);
  }

  const segments = [];
  for (let i = 0; i < clipPaths.length; i++) {
    const out = tmp(`seg_${i}.mp4`);
    console.log(`[export] encoding clip ${i}`);
    await encodeClip(clipPaths[i], out);
    segments.push(out);
  }

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
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', basePath,
    ]);
  }

  let withSlides = basePath;
  if (introConfig?.enabled || outroConfig?.enabled) {
    const dur = await getVideoDuration(ffmpegPath, basePath);
    withSlides = tmp('with_slides.mp4');
    await applySlideOverlays({
      ffmpegPath, inputVideo: basePath, outPath: withSlides,
      introConfig, outroConfig, W, H, totalDur: dur,
    });
  }

  let finalPath = withSlides;
  if (musicConfig?.enabled && musicConfig.filePath && fs.existsSync(musicConfig.filePath)) {
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

  fs.copyFileSync(finalPath, outPath);
  console.log('[export] DONE');
}

function getVideoDuration(ffmpegPath, inputPath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-i', inputPath], { maxBuffer: 10 * 1024 * 1024 }, (_err, _out, stderr) => {
      const m = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      resolve(m ? parseInt(m[1]) * 3600 + parseInt(m[2]) * 60 + parseFloat(m[3]) : 10);
    });
  });
}

// Prepare slide image: scale to fit 40%×30% of screen, preserve alpha
// Uses ffmpeg rgba pixel format so alpha is NOT lost
async function prepareSlideImage(ffmpegPath, cfg, name, W, H) {
  const imgPath = cfg.filePath ? w(cfg.filePath) : null;
  const useImage = imgPath && fs.existsSync(imgPath);
  const outPng = tmp(`${name}_slide.png`);

  const logoMaxW = Math.round(W * 0.4);
  const logoMaxH = Math.round(H * 0.3);

  if (useImage) {
    // Scale preserving aspect ratio, output as rgba PNG to keep transparency
    await ff(ffmpegPath, [
      '-y', '-i', imgPath,
      '-vf', `scale=${logoMaxW}:${logoMaxH}:force_original_aspect_ratio=decrease`,
      '-pix_fmt', 'rgba',
      '-frames:v', '1', outPng,
    ]);
  } else {
    const hex = (cfg.color || '#222222').replace('#', '');
    const bh = Math.round(logoMaxH * 0.4);
    await ff(ffmpegPath, [
      '-y', '-f', 'lavfi',
      '-i', `color=0x${hex}FF:size=${logoMaxW}x${bh}:rate=1`,
      '-pix_fmt', 'rgba',
      '-frames:v', '1', outPng,
    ]);
  }

  if (cfg.text && cfg.text.trim()) {
    const txtPng = tmp(`${name}_slide_txt.png`);
    const t = cfg.text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:');
    const fs2 = Math.round(logoMaxH * 0.18);
    await ff(ffmpegPath, [
      '-y', '-i', outPng,
      '-vf', `drawtext=text='${t}':fontsize=${fs2}:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2:shadowcolor=black:shadowx=2:shadowy=2`,
      '-pix_fmt', 'rgba', '-frames:v', '1', txtPng,
    ]);
    fs.copyFileSync(txtPng, outPng);
  }

  return { png: outPng, logoMaxW, logoMaxH };
}

// Overlay slide as animation: slide in from left → hold center → slide out to right
async function applySlideOverlays({ ffmpegPath, inputVideo, outPath, introConfig, outroConfig, W, H, totalDur }) {
  const animIn = 0.4;
  const animOut = 0.4;

  const inputs = ['-i', inputVideo];
  let filterParts = [];
  // Convert base video to yuva444p so overlay alpha works correctly
  filterParts.push(`[0:v]format=yuva444p[base]`);
  let lastVideo = 'base';
  let inputIdx = 1;

  if (introConfig?.enabled) {
    const introDur = introConfig.duration || 3;
    const { png, logoMaxW, logoMaxH } = await prepareSlideImage(ffmpegPath, introConfig, 'intro', W, H);
    const centerX = Math.round((W - logoMaxW) / 2);
    const centerY = Math.round((H - logoMaxH) / 2);

    inputs.push('-loop', '1', '-t', String(introDur + 0.1), '-i', png);
    const si = inputIdx++;

    // Convert overlay to yuva444p to preserve alpha
    filterParts.push(`[${si}:v]format=yuva444p[ov${si}]`);

    const holdEnd = introDur - animOut;
    // slide in from left (-logoMaxW → centerX), hold, slide out to right (centerX → W)
    const xExpr = `if(lt(t,${animIn}),-${logoMaxW}+t/${animIn}*(${centerX}+${logoMaxW}),if(lt(t,${holdEnd}),${centerX},${centerX}+(t-${holdEnd})/${animOut}*${W}))`;

    filterParts.push(`[${lastVideo}][ov${si}]overlay=x='${xExpr}':y=${centerY}:shortest=0:eof_action=pass:format=yuv420[v${si}]`);
    lastVideo = `v${si}`;
  }

  if (outroConfig?.enabled) {
    const outroDur = outroConfig.duration || 3;
    const { png, logoMaxW, logoMaxH } = await prepareSlideImage(ffmpegPath, outroConfig, 'outro', W, H);
    const centerX = Math.round((W - logoMaxW) / 2);
    const centerY = Math.round((H - logoMaxH) / 2);

    inputs.push('-loop', '1', '-t', String(outroDur + 0.1), '-i', png);
    const si = inputIdx++;

    filterParts.push(`[${si}:v]format=yuva444p[ov${si}]`);

    const outroStart = Math.max(0, totalDur - outroDur);
    const holdEnd = outroDur - animOut;
    const tr = `(t-${outroStart})`;
    const xExpr = `if(lt(t,${outroStart}),-${logoMaxW},if(lt(${tr},${animIn}),-${logoMaxW}+${tr}/${animIn}*(${centerX}+${logoMaxW}),if(lt(${tr},${holdEnd}),${centerX},${centerX}+(${tr}-${holdEnd})/${animOut}*${W})))`;

    filterParts.push(`[${lastVideo}][ov${si}]overlay=x='${xExpr}':y=${centerY}:shortest=0:eof_action=pass:format=yuv420[v${si}]`);
    lastVideo = `v${si}`;
  }

  // Final output must be yuv420p for h264
  filterParts.push(`[${lastVideo}]format=yuv420p[vout]`);

  await ff(ffmpegPath, [
    '-y',
    ...inputs,
    '-filter_complex', filterParts.join(';'),
    '-map', '[vout]',
    '-map', '0:a',
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