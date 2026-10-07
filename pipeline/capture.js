// University Duel frame capture. Paste-run in the YouTube watch page (browser panel), via javascript_tool.
// Detects the question box layout (QB = Quick Buzz, BML/BMR = Brain Match panel left/right), plays at cfg.rate,
// captures a composite crop every cfg.periodic s of media time while a question is on screen, plus one capture
// ~0.25 s after each green answer bar appears, plus 2 end-of-quarter cards. Skips non-quiz stretches by seeking.
// Pilot (5 Oct 2026, LNb9hDxcp1o): 2x real time, ~1 MB per quiz minute, 132 frames / 5.5 min of video.
// v3.1 (7 Oct): pauses while the tab is hidden and resumes when it is visible again.
// v3 (5 Oct night): answer bar captured the moment it is seen (+1 more 0.6 s later); periodic 1.5 s.
// v2 (5 Oct): waits out ads, logs video height per frame (lowQ count), __udSave waits for pending encodes,
// __udGetTranscript() saves the auto transcript into the .tar as transcript.json.
// Usage: await window.__udGetTranscript(); window.__udStart({windows:[[startSec,endSec],...]}); poll window.__ud; when done, await window.__udSave('name.tar', videoId).
(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const v = document.querySelector('video'), p = document.querySelector('#movie_player');
  const A = document.createElement('canvas'); A.width = 480; A.height = 270; const actx = A.getContext('2d', {willReadFrequently: true});
  const R = { QB:[1600,790,80,110], BML:[830,330,60,150], BMR:[1030,335,60,145] };        // light-box probes (1920x1080 coords)
  const G = { QB:[407,921,450,55], BML:[106,972,437,39], BMR:[1390,972,424,39] };          // green answer bar probes
  const light = (r,g,b) => r>195 && g>205 && b>220, green = (r,g,b) => g>100 && g>r+35 && b<150;
  const frac = (rect, test) => { const [x,y,w,h] = rect.map(n => Math.round(n*0.25)); const d = actx.getImageData(x,y,Math.max(1,w),Math.max(1,h)).data; let k=0; for (let i=0;i<d.length;i+=4) if (test(d[i],d[i+1],d[i+2])) k++; return k/(d.length/4); };
  const analyze = () => { actx.drawImage(v,0,0,480,270); const L={}, Gr={}; for (const k in R) L[k]=frac(R[k],light); for (const k in G) Gr[k]=frac(G[k],green); let lay='none', best=0.6; for (const k in L) if (L[k]>best) { best=L[k]; lay=k; } return {lay, L, Gr}; };
  const PARTS = { QB:[[170,40,300,200,0,0],[360,630,1380,400,0,200]], BML:[[90,20,860,1010,0,0],[0,905,1920,55,0,1010,'strip']], BMR:[[970,20,860,1010,0,0],[0,905,1920,55,0,1010,'strip']], CARD:[[0,0,1920,1080,0,0]] };
  const SIZE = { QB:[1380,600], BML:[860,1050], BMR:[860,1050], CARD:[1920,1080] };
  const adOn = () => !!(p && p.classList.contains('ad-showing'));
  const trySkipAd = () => { const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern'); if (b) b.click(); };
  async function waitAds(S) { let n = 0; while (adOn() && n < 240) { if (n === 0) S.log.push('ad at ' + v.currentTime.toFixed(1)); v.muted = true; trySkipAd(); await sleep(500); n++; } if (n) S.adWaits = (S.adWaits || 0) + 1; }
  async function seek(t) { p.seekTo(t, true); for (let i=0; i<50 && (Math.abs(v.currentTime-t)>0.4 || v.readyState<2); i++) await sleep(120); await sleep(200); }
  window.__udStart = (opts = {}) => {
    const S = window.__ud = { items: [], bytes: 0, log: [], done: false, running: true, pending: 0 };
    S.cfg = Object.assign({ rate: 2, periodic: 1.5, scale: 0.75, q: 0.68, windows: [[0, v.duration]], searchAfter: 8, searchStep: 6, maxBytes: 380e6 }, opts);
    v.muted = true; try { p.setPlaybackQualityRange('hd1080','hd1080'); } catch (e) {}
    const st = S.st = { lastProc: -1, lastCap: -99, lastBox: -99, greenOn: false, ansCaps: 0, lastAns: -99, cards: [], wasBox: false, mode: 'play', win: 0 };
    function capture(kind, reason, t, info) {
      if (S.bytes > S.cfg.maxBytes) { S.log.push('maxBytes reached'); return; }
      const sc = kind === 'CARD' ? 1/3 : S.cfg.scale, [W,H] = SIZE[kind], c = document.createElement('canvas'); c.width = Math.round(W*sc); c.height = Math.round(H*sc);
      const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0,0,c.width,c.height); const kx = v.videoWidth/1920, ky = v.videoHeight/1080;
      for (const [sx,sy,sw,sh,dx,dy,mode] of PARTS[kind]) { if (mode === 'strip') { const dw = c.width, dh = Math.round(sh*dw/sw); x.drawImage(v,sx*kx,sy*ky,sw*kx,sh*ky,0,Math.round(dy*sc),dw,dh); } else x.drawImage(v,sx*kx,sy*ky,sw*kx,sh*ky,Math.round(dx*sc),Math.round(dy*sc),Math.round(sw*sc),Math.round(sh*sc)); }
      const i = S.items.length, name = `${String(i).padStart(5,'0')}_${kind}_${reason}_${t.toFixed(2)}.jpg`;
      const vh = v.videoHeight; if (vh && vh < 1080) S.lowQ = (S.lowQ || 0) + 1;
      const rec = { i, name, t: +t.toFixed(2), vh, kind, reason, L: info ? Object.fromEntries(Object.entries(info.L).map(([k,v]) => [k,+v.toFixed(2)])) : null, G: info ? Object.fromEntries(Object.entries(info.Gr).map(([k,v]) => [k,+v.toFixed(2)])) : null };
      S.items.push(rec); S.pending++; c.toBlob(b => { rec.blob = b; rec.bytes = b.size; S.bytes += b.size; S.pending--; }, 'image/jpeg', S.cfg.q);
    }
    function onFrame(now, meta) {
      if (!S.running) return; if (adOn()) { v.requestVideoFrameCallback(onFrame); return; } const t = meta.mediaTime;
      if (st.mode === 'play' && t - st.lastProc >= 0.15) { st.lastProc = t; const info = analyze(), lay = info.lay;
        if (lay !== 'none') { st.lastBox = t; st.wasBox = true; st.cards = []; const g = info.Gr[lay];
          if (g > 0.3) { if (!st.greenOn) { st.greenOn = true; st.ansCaps = 0; }
            // the bar can be gone within a second, so capture at once, then once more after the text has rendered
            if (st.ansCaps === 0 || (st.ansCaps === 1 && t - st.lastAns >= 0.6)) { capture(lay,'a',t,info); st.ansCaps++; st.lastAns = t; st.lastCap = t; } }
          if (g < 0.1) st.greenOn = false;
          if (t - st.lastCap >= S.cfg.periodic) { capture(lay,'p',t,info); st.lastCap = t; }
        } else { if (st.wasBox) { st.wasBox = false; st.cards = [st.lastBox+2.0, st.lastBox+4.5]; } if (st.cards.length && t >= st.cards[0]) { capture('CARD','c',t,info); st.cards.shift(); } }
      }
      v.requestVideoFrameCallback(onFrame);
    }
    (async () => { S.t0 = performance.now();
      for (let w = 0; w < S.cfg.windows.length; w++) { const [ws, we] = S.cfg.windows[w]; st.win = w; p.pauseVideo(); await waitAds(S); await seek(ws); await waitAds(S); st.lastProc = -1; st.lastBox = ws; st.wasBox = false; v.playbackRate = S.cfg.rate; p.playVideo(); await sleep(300); v.playbackRate = S.cfg.rate;
        while (S.running) { await sleep(250); if (document.hidden) { if (!S.hid) { S.hid = 1; p.pauseVideo(); S.log.push('hidden at ' + v.currentTime.toFixed(1)); } continue; } if (S.hid) { S.hid = 0; S.log.push('visible at ' + v.currentTime.toFixed(1)); st.lastBox = v.currentTime; st.lastProc = -1; v.playbackRate = S.cfg.rate; p.playVideo(); } if (adOn()) { await waitAds(S); continue; } const t = v.currentTime; if (v.playbackRate !== S.cfg.rate) v.playbackRate = S.cfg.rate; if (t >= we || v.ended) break;
          if (st.mode === 'play' && t - st.lastBox > S.cfg.searchAfter && !st.cards.length) { st.mode = 'search'; p.pauseVideo(); let T = t, found = false; S.log.push('search from ' + t.toFixed(1));
            while (T + S.cfg.searchStep < we) { T += S.cfg.searchStep; await seek(T); while (document.hidden) await sleep(1000); if (analyze().lay !== 'none') { found = true; break; } }
            if (!found) { st.mode = 'play'; break; }
            await seek(Math.max(ws, T - S.cfg.searchStep)); st.lastBox = v.currentTime; st.lastProc = -1; st.mode = 'play'; v.playbackRate = S.cfg.rate; p.playVideo(); S.log.push('found box near ' + T.toFixed(1)); } } }
      p.pauseVideo(); S.running = false; S.wall = (performance.now() - S.t0) / 1000; S.done = true; })();
    v.requestVideoFrameCallback(onFrame); return { started: true, quality: p.getPlaybackQuality(), duration: v.duration };
  };
  window.__udGetTranscript = async () => {   // opens YouTube's transcript panel and keeps [seconds, text] pairs
    const btn = document.querySelector('ytd-video-description-transcript-section-renderer button'); if (btn) btn.click();
    let segs = [];
    for (let i = 0; i < 30; i++) { await sleep(700); const els = document.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer'); if (els.length > 5) { await sleep(800);
      segs = [...document.querySelectorAll('transcript-segment-view-model, ytd-transcript-segment-renderer')].map(el => { const ts = (el.querySelector('.ytwTranscriptSegmentViewModelTimestamp, .segment-timestamp')?.textContent || '').trim(); const tx = (el.querySelector('span[role="text"], .segment-text')?.textContent || '').replace(/\[music\]/gi, '').replace(/\s+/g, ' ').trim(); const sec = ts.split(':').reduce((a, b) => a * 60 + Number(b), 0); return [sec, tx]; }).filter(s => s[1]); break; } }
    window.__udTx = segs; if (window.__ud) window.__ud.transcriptCount = segs.length; return { segments: segs.length };
  };
  window.__udSave = async (fileName, videoId) => {
    for (let k = 0; k < 200 && window.__ud.pending > 0; k++) await new Promise(r => setTimeout(r, 100));   // packs manifest + frames into a .tar and triggers a browser download (needs the user's OK each time)
    const S = window.__ud, enc = new TextEncoder();
    const hdr = (name, size) => { const h = new Uint8Array(512); const put = (s,off,len) => h.set(enc.encode(s).slice(0,len), off);
      put(name,0,100); put('0000644\0',100,8); put('0000000\0',108,8); put('0000000\0',116,8); put(size.toString(8).padStart(11,'0')+'\0',124,12); put(Math.floor(Date.now()/1000).toString(8).padStart(11,'0')+'\0',136,12);
      for (let i=148;i<156;i++) h[i]=32; h[156]=48; put('ustar\0',257,6); put('00',263,2); let sum=0; for (let i=0;i<512;i++) sum+=h[i]; put(sum.toString(8).padStart(6,'0')+'\0 ',148,8); return h; };
    const pad = n => new Uint8Array((512 - (n % 512)) % 512), parts = [];
    const mb = enc.encode(JSON.stringify({ video: videoId, cfg: S.cfg, wall: S.wall, log: S.log, items: S.items.filter(it => it.blob).map(({blob, ...r}) => r), dropped: S.items.filter(it => !it.blob).length, lowQ: S.lowQ || 0, adWaits: S.adWaits || 0, transcript: S.transcriptCount || 0 }, null, 1));
    if (window.__udTx) { const tb = enc.encode(JSON.stringify(window.__udTx)); parts.push(hdr('transcript.json', tb.length), tb, pad(tb.length)); }
    parts.push(hdr('manifest.json', mb.length), mb, pad(mb.length));
    for (const it of S.items) { if (!it.blob) continue; parts.push(hdr('frames/' + it.name, it.blob.size), it.blob, pad(it.blob.size)); }
    parts.push(new Uint8Array(1024)); const tar = new Blob(parts, { type: 'application/x-tar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(tar); a.download = fileName; document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 2000);
    return { tarMB: +(tar.size/1e6).toFixed(2), files: S.items.filter(it => it.blob).length, lowQ: S.lowQ || 0, adWaits: S.adWaits || 0 };
  };
})();
