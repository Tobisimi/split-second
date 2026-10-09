// Helpers that run in the YouTube watch page next to capture.js (paste-run both via javascript_tool).
// __udQueue([{id, start, end, name}, ...]) captures several videos one after another in the same page with
// loadVideoById, saving each as a .tar download (ud_<id>.tar unless a name is given). Progress: window.__udQ.
// __udSample(id, t0, t1, step, name) saves a .tar of 640x360 stills every `step` seconds (or, when t1 <= 1, at
// fractions of the duration) to look at a video's layout before capturing it.
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const P = () => document.getElementById('movie_player'), V = () => document.querySelector('video');
  async function load(id, t) {
    const p = P(), v = V(); p.loadVideoById(id, t || 0);
    for (let k = 0; k < 120 && !(p.getVideoData().video_id === id && v.duration > 60 && v.readyState >= 2); k++) await sleep(500);
    try { p.setPlaybackQualityRange('hd1080', 'hd1080'); } catch (e) {}
    v.muted = true; return v.duration;
  }
  window.__udQueue = async (list) => {
    const Q = window.__udQ = { list, i: 0, saved: [], log: [], done: false };
    window.__udKeep = window.__udKeep || {};
    for (const it of list) {
      const dur = await load(it.id, it.start || 0); Q.log.push(`loaded ${it.id} dur ${Math.round(dur)}`);
      window.__udTx = null;   // no transcript: the page's transcript belongs to the video the page was opened on
      window.__udStart({ windows: [[it.start || 0, it.end || dur]] });
      while (!window.__ud.done) await sleep(2000);
      window.__udKeep[it.id] = window.__ud;
      const r = await window.__udSave(it.name || `ud_${it.id}.tar`, it.id);
      Q.saved.push({ id: it.id, ...r, at: new Date().toISOString() }); Q.i++;
      await sleep(20000);   // let the download land before the next video starts
    }
    Q.done = true;
  };
  window.__udResave = async (id, name) => { window.__ud = window.__udKeep[id]; return window.__udSave(name || `ud_${id}.tar`, id); };
  window.__udSample = async (id, t0, t1, step, name) => {
    const dur = await load(id, 0), p = P(), v = V(); p.pauseVideo();
    const c = document.createElement('canvas'); c.width = 640; c.height = 360; const x = c.getContext('2d');
    const times = []; if (t1 <= 1) { for (let f = t0; f <= t1 + 1e-9; f += step) times.push(Math.round(f * dur)); } else { for (let t = t0; t <= t1; t += step) times.push(t); }
    const out = [];
    for (const t of times) {
      p.seekTo(t, true);
      for (let i = 0; i < 60 && (Math.abs(v.currentTime - t) > 0.5 || v.readyState < 2); i++) await sleep(150);
      await sleep(400); x.drawImage(v, 0, 0, 640, 360);
      out.push({ name: 'f_' + String(Math.round(t)).padStart(4, '0') + '.jpg', blob: await new Promise(r => c.toBlob(r, 'image/jpeg', 0.7)) });
    }
    const enc = new TextEncoder();
    const hdr = (nm, size) => { const h = new Uint8Array(512); const put = (s, off, len) => h.set(enc.encode(s).slice(0, len), off);
      put(nm, 0, 100); put('0000644\0', 100, 8); put('0000000\0', 108, 8); put('0000000\0', 116, 8); put(size.toString(8).padStart(11, '0') + '\0', 124, 12); put(Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0', 136, 12);
      for (let i = 148; i < 156; i++) h[i] = 32; h[156] = 48; put('ustar\0', 257, 6); put('00', 263, 2); let sum = 0; for (let i = 0; i < 512; i++) sum += h[i]; put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8); return h; };
    const pad = n => new Uint8Array((512 - (n % 512)) % 512), parts = [];
    for (const it of out) parts.push(hdr(it.name, it.blob.size), it.blob, pad(it.blob.size));
    parts.push(new Uint8Array(1024));
    const tar = new Blob(parts, { type: 'application/x-tar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(tar); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 2000);
    window.__udSampled = { id, n: out.length, mb: +(tar.size / 1e6).toFixed(2), dur };
    return window.__udSampled;
  };
})();
