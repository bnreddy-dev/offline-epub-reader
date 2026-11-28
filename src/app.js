/* =====================================================================
   Offline EPUB Reader — single-file app (v3, Google voices, no freezes)
   Spec: Offline_EPUB_Reader_App_Requirements.md v3 FINAL
   v3 changes (user feedback 2026-11-27):
   - Telugu voice is GOOGLE Telugu (translate_tts web endpoint), NOT Meta MMS.
     MMS is deleted entirely. Google audio plays through <audio> (no CORS
     needed for playback); a Service Worker caches it (opaque) for offline.
   - Language/voice download starts AUTOMATICALLY the moment a book is
     selected, with a progress bar at the TOP of the screen. No waiting for
     Play, no silent failure, retry with backoff, status always visible.
   - Pause works INSTANTLY at all times — controls are decoupled from
     synthesis/loading; Pause stops audio and cancels pending work at once.
   - Slow-connection design: small incremental per-sentence audio, never one
     huge model for Telugu; UI never blocks on a network fetch.
   - Telugu text is NEVER split into per-letter spans (that broke conjuncts
     into achulu/hallulu errors). Highlight is whole-word only.
   - No language list anywhere: book language is auto-detected only; the
     app UI language follows the browser. A "Languages" section manages
     offline voice downloads only (never a reading picker).
   - Real 3D page-curl turn (a leaf that lifts, curls and settles like paper).
   - Loading never hangs: visible progress, timeout + clean retry.
   - Reading text is not selectable (no native OS selection menu while
     reading); tap-a-word speaks that word.
   Kept from v2.1: Kokoro en/hi; no device voice, no speechSynthesis, no
   install dialog; stable page counter/Go; fresh upload starts at sentence 0;
   premium minimal UI with pinned header; stall fix (times/numbers as Telugu
   words, skip-on-failure); sentence prefetch; stable time-left.
   ===================================================================== */
'use strict';

/* ---------------- utilities ---------------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; };
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = ms => new Promise(r => setTimeout(r, ms));
function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.add('hidden'), ms || 2600); }
function fmtTime(sec) { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), s = sec % 60; return m + ':' + String(s).padStart(2, '0'); }
function fmtDur(sec) { const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h > 0 ? h + 'h ' + m + 'm' : m + ' min'; }

/* ---------------- i18n (app chrome: English / Telugu / Hindi) ---------------- */
/* The app UI language follows the BROWSER language automatically (no picker).
   Book language is auto-detected from the book content only. */
const I18N = {
  en: { appTitle: 'Offline EPUB Reader', appSub: 'Read or listen to any book — fully offline, free, private.', openBook: '📖 Open a book', openHint: 'EPUB or PDF — the file never leaves your device.', continueListening: 'Continue listening', continue: '▶ Continue', recentBooks: 'Recent books', noBooksYet: 'No books yet. Open an EPUB or PDF to begin.', backup: '⬇ Backup library', restore: '⬆ Restore library', storage: '🗄 Storage', voices: '🔊 Voices', languages: '🌐 Languages', chapters: 'Chapters', bookmarks: 'Bookmarks', highlights: 'Highlights', searchPh: 'Search in book…', gotoPagePh: 'Page #', go: 'Go', playBelow: '▶ Read aloud', settings: 'Settings', theme: 'Theme', themeBook: 'Book page', themeWhite: 'White', themeDark: 'Dark', direction: 'Page direction', dirVertical: 'Vertical scroll', dirHorizontal: 'Horizontal flip', font: 'Font', fontSerif: 'Serif (book)', fontSans: 'Sans (clean)', fontTelugu: 'Telugu', fontSize: 'Font size', lineSpacing: 'Line spacing', voice: 'Voice', genre: 'Genre', moodFollow: 'Follow mood', sleepDefault: 'Sleep timer default', off: 'Off', largeText: 'Large text', highContrast: 'High contrast', voiceNote: 'Voices in your browser — Kokoro (English/Hindi) + Google Telugu. The book\u2019s language is detected automatically; its voice downloads when you open the book.', exportHighlights: 'Export highlights', nowMood: 'Now:', mood: 'Mood', define: 'Define', hear: '🔊 Hear', highlight: '✎ Highlight', copy: 'Copy' },
  te: { appTitle: 'ఆఫ్‌లైన్ EPUB రీడర్', appSub: 'ఏ పుస్తకాన్నైనా చదవండి లేదా వినండి — పూర్తిగా ఆఫ్‌లైన్, ఉచితం, ప్రైవేట్.', openBook: '📖 పుస్తకం తెరవండి', openHint: 'EPUB లేదా PDF — ఫైల్ మీ పరికరాన్ని వదలదు.', continueListening: 'వినడం కొనసాగించండి', continue: '▶ కొనసాగించు', recentBooks: 'ఇటీవలి పుస్తకాలు', noBooksYet: 'ఇంకా పుస్తకాలు లేవు. ప్రారంభించడానికి EPUB లేదా PDF తెరవండి.', backup: '⬇ లైబ్రరీ బ్యాకప్', restore: '⬆ లైబ్రరీ పునరుద్ధరణ', storage: '🗄 నిల్వ', voices: '🔊 గొంతులు', languages: '🌐 భాషలు', chapters: 'అధ్యాయాలు', bookmarks: 'బుక్‌మార్కులు', highlights: 'హైలైట్లు', searchPh: 'పుస్తకంలో వెతకండి…', gotoPagePh: 'పేజీ #', go: 'వెళ్ళు', playBelow: '▶ బిగ్గరగా చదవండి', settings: 'సెట్టింగులు', theme: 'థీమ్', themeBook: 'పుస్తక పేజీ', themeWhite: 'తెలుపు', themeDark: 'చీకటి', direction: 'పేజీ దిశ', dirVertical: 'నిలువు స్క్రోల్', dirHorizontal: 'అడ్డంగా తిప్పండి', font: 'ఫాంట్', fontSerif: 'సెరిఫ్ (పుస్తకం)', fontSans: 'సాన్స్ (స్పష్టం)', fontTelugu: 'తెలుగు', fontSize: 'అక్షర పరిమాణం', lineSpacing: 'లైన్ అంతరం', voice: 'గొంతు', genre: 'శైలి', moodFollow: 'మూడ్ అనుసరించు', sleepDefault: 'స్లీప్ టైమర్', off: 'ఆపివేయి', largeText: 'పెద్ద అక్షరాలు', highContrast: 'అధిక కాంట్రాస్ట్', voiceNote: 'బ్రౌజర్‌లో గొంతులు — Kokoro (ఇంగ్లీష్/హిందీ) + Google తెలుగు. పుస్తక భాష ఆటోమేటిక్‌గా గుర్తించబడుతుంది; దాని గొంతు పుస్తకం తెరవగానే డౌన్‌లోడ్ అవుతుంది.', exportHighlights: 'హైలైట్లు ఎగుమతి', nowMood: 'ఇప్పుడు:', mood: 'మూడ్', define: 'అర్థం', hear: '🔊 వినండి', highlight: '✎ హైలైట్', copy: 'కాపీ' },
  hi: { appTitle: 'ऑफ़लाइन EPUB रीडर', appSub: 'कोई भी किताब पढ़ें या सुनें — पूरी तरह ऑफ़लाइन, मुफ़्त, निजी।', openBook: '📖 किताब खोलें', openHint: 'EPUB या PDF — फ़ाइल आपके डिवाइस से बाहर नहीं जाती।', continueListening: 'सुनना जारी रखें', continue: '▶ जारी रखें', recentBooks: 'हाल की किताबें', noBooksYet: 'अभी कोई किताब नहीं। शुरू करने के लिए EPUB या PDF खोलें।', backup: '⬇ लाइब्रेरी बैकअप', restore: '⬆ लाइब्रेरी पुनर्स्थापित करें', storage: '🗄 भंडारण', voices: '🔊 आवाज़ें', languages: '🌐 भाषाएँ', chapters: 'अध्याय', bookmarks: 'बुकमार्क', highlights: 'हाइलाइट', searchPh: 'किताब में खोजें…', gotoPagePh: 'पृष्ठ #', go: 'जाएँ', playBelow: '▶ ज़ोर से पढ़ें', settings: 'सेटिंग्स', theme: 'थीम', themeBook: 'किताब का पन्ना', themeWhite: 'सफ़ेद', themeDark: 'अंधेरा', direction: 'पन्ने की दिशा', dirVertical: 'ऊर्ध्व स्क्रॉल', dirHorizontal: 'क्षैतिज पलटें', font: 'फ़ॉन्ट', fontSerif: 'सेरिफ़ (किताब)', fontSans: 'सैन्स (साफ़)', fontTelugu: 'तेलुगु', fontSize: 'अक्षर आकार', lineSpacing: 'पंक्ति अंतर', voice: 'आवाज़', genre: 'शैली', moodFollow: 'मूड का पालन करें', sleepDefault: 'स्लीप टाइमर', off: 'बंद', largeText: 'बड़े अक्षर', highContrast: 'उच्च कंट्रास्ट', voiceNote: 'ब्राउज़र में आवाज़ें — Kokoro (English/Hindi) + Google Telugu. किताब की भाषा अपने आप पहचानी जाती है; उसकी आवाज़ किताब खोलते ही डाउनलोड होती है।', exportHighlights: 'हाइलाइट निर्यात करें', nowMood: 'अभी:', mood: 'मूड', define: 'अर्थ', hear: '🔊 सुनें', highlight: '✎ हाइलाइट', copy: 'कॉपी' }
};
function browserUiLang() {
  const l = (navigator.language || 'en').toLowerCase();
  if (l.indexOf('te') === 0) return 'te';
  if (l.indexOf('hi') === 0) return 'hi';
  return 'en';
}
function t(key) { const lang = settings.uiLang || 'en'; return (I18N[lang] && I18N[lang][key]) || I18N.en[key] || key; }
function applyI18n() {
  $$('[data-i18n]').forEach(n => { n.textContent = t(n.dataset.i18n); });
  $$('[data-i18n-ph]').forEach(n => { n.placeholder = t(n.dataset.i18nPh); });
  document.documentElement.lang = settings.uiLang || 'en';
}

/* ---------------- settings (localStorage) ---------------- */
const SETTINGS_KEY = 'epubreader.settings.v1';
const defaults = { theme: 'book', direction: 'horizontal', font: 'serif', fontSize: 3, lineSpacing: 2, uiLang: 'en', genre: 'thriller', moodFollow: true, sleepDefault: 0, largeText: false, highContrast: false };
let settings = Object.assign({}, defaults);
try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); settings = Object.assign({}, defaults, s); } catch (e) {}
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }

/* ---------------- IndexedDB (book bytes + chapter cache + audio cache) ---------------- */
const DB_NAME = 'epubreader', DB_VER = 2;
let dbPromise = null;
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('books')) db.createObjectStore('books', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chapters')) db.createObjectStore('chapters', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}
function idbPut(store, value) { return openDB().then(db => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value); tx.oncomplete = res; tx.onerror = () => rej(tx.error); })); }
function idbGet(store, key) { return openDB().then(db => new Promise((res, rej) => { const req = db.transaction(store).objectStore(store).get(key); req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); })); }
function idbDelete(store, key) { return openDB().then(db => new Promise((res, rej) => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); })); }
function idbAll(store) { return openDB().then(db => new Promise((res, rej) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess = () => res(req.result || []); req.onerror = () => rej(req.error); })); }
function idbCountChapters(bookId) { return idbAll('chapters').then(all => all.filter(c => c.key.indexOf(bookId + '::') === 0).length); }
function idbClearAudioForBook(bookId) { return idbAll('audio').then(async all => { for (const r of all.filter(r => r.key.indexOf(bookId + '::') === 0)) await idbDelete('audio', r.key).catch(() => {}); }); }

/* ---------------- library index (localStorage) ---------------- */
const LIB_KEY = 'epubreader.library.v1';
let library = [];
try { library = JSON.parse(localStorage.getItem(LIB_KEY) || '[]'); } catch (e) { library = []; }
function saveLibrary() { try { localStorage.setItem(LIB_KEY, JSON.stringify(library)); } catch (e) {} }
function bookIdFor(title, author) { return 'b' + Math.abs([...(title + '|' + author)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)).toString(36); }

/* ---------------- global state ---------------- */
const state = {
  book: null,
  bookType: null,
  meta: null,
  chapters: [],
  currentChapter: 0,
  paragraphs: [],
  sentences: [],
  sentenceIndex: 0,
  playing: false,
  speaking: false,
  speed: 1,
  mood: 'neutral',
  pages: [],
  currentPage: 0,
  totalPages: 0,
  pageTotal: 0,
  pageTotalKey: '',
  cacheCount: 0,
  preloadIdx: -1,
  preloadBusy: false,
  bookmarks: [],
  highlights: [],
  completedChapters: {},
  voice: null,
  voices: [],
  sleepTimerId: null,
  sleepEndsAt: 0,
  lastSpokenAt: 0,
  avgSentenceSec: 4,
  perBook: {},
  resumeRecap: null,
  pdfPages: null,
  searchIndex: [],
};
let pauseTimer = null;

/* ---------------- moods & genres (spec §7) ---------------- */
const MOODS = {
  tense:   { label: 'Tense',    speed: 0.85, pitch: -1, pause: 450, reveal: 900, color: '#8a5a2b' },
  sad:     { label: 'Sad',      speed: 0.80, pitch: -1, pause: 600, reveal: 800, color: '#5b6b8c' },
  warm:    { label: 'Warm',     speed: 0.95, pitch: 0,  pause: 400, reveal: 500, color: '#b3541e' },
  light:   { label: 'Light',    speed: 1.10, pitch: 1,  pause: 250, reveal: 300, color: '#2e7d4f' },
  scary:   { label: 'Scary',    speed: 0.75, pitch: -2, pause: 700, reveal: 1200, color: '#6b2d5b' },
  neutral: { label: 'Neutral',  speed: 1.00, pitch: 0,  pause: 350, reveal: 400, color: '#666666' },
  dialogue:{ label: 'Dialogue', speed: 1.05, pitch: 0,  pause: 200, reveal: 0,   color: '#666666' },
};
const GENRES = {
  thriller:   { mood: 'tense',  base: 0.90, label: 'Thriller / Mystery' },
  romance:    { mood: 'warm',   base: 0.95, label: 'Romance' },
  comedy:     { mood: 'light',  base: 1.10, label: 'Comedy' },
  horror:     { mood: 'scary',  base: 0.80, label: 'Horror' },
  devotional: { mood: 'warm',   base: 0.90, label: 'Devotional' },
  biography:  { mood: 'neutral',base: 1.00, label: 'Biography' },
  selfhelp:   { mood: 'neutral',base: 1.05, label: 'Self-help' },
  children:   { mood: 'light',  base: 1.05, label: "Children's story" },
};
function moodOfChapter(ch) {
  if (!settings.moodFollow) return 'neutral';
  if (ch && ch.mood) return ch.mood;
  return (GENRES[settings.genre] || GENRES.thriller).mood;
}
function setMood(name, announce) {
  state.mood = MOODS[name] ? name : 'neutral';
  const m = MOODS[state.mood];
  const n = $('#moodName'); if (n) n.textContent = m.label;
  const d = $('#moodDot'); if (d) d.style.background = m.color;
  const strip = $('#moodStrip'); if (strip) strip.classList.toggle('hidden', !settings.moodFollow);
  if (announce) toast('Mood: ' + m.label);
}

/* ---------------- TTS engine (v3) ---------------- */
// English/Hindi: Kokoro-82M via kokoro-js. Synthesis runs in a Web Worker
// when possible (the UI never freezes); falls back to the main thread.
// Telugu: GOOGLE Telugu voice (translate_tts web endpoint) — clear, natural,
// no device install, no huge model. Audio plays through <audio> elements
// (media playback needs no CORS); a Service Worker caches the audio so
// repeat listens work offline. MMS is gone entirely — no Meta voice anywhere.
// NO device speechSynthesis voice is used anywhere, and no "install a voice
// on your device" dialog exists.
// PAUSE IS DECOUPLED: Play/Pause handlers are synchronous and never await
// synthesis or a download. Pause stops the audio element at once, bumps the
// tokens (cancelling every in-flight fetch/synthesis), and returns
// immediately — it works even while a voice is still loading.

const NEURAL = {
  kokoro: null, kokoroLoading: null,
  kokoroWorker: null, kokoroWorkerFailed: false, kokoroWorkerReady: null,
  kokoroWorkerSeq: 0, kokoroWorkerPending: new Map(),
  audioEl: null,                 // single <audio> for Kokoro (PCM) playback
  wordTimer: null,
  playToken: 0,                  // bump to cancel in-flight playback
  prefetch: new Map(),           // Kokoro "chapter:sentence" -> clip | Promise
  prefetchToken: 0,              // bump to cancel in-flight prefetch
  narrationToken: 0,             // bump to invalidate a stale narration loop
  consecFail: 0,
  status: '',
  abortCtl: null,                // aborts the in-flight Google fetch
};
const SYNTH_TIMEOUT_MS = 45000;
const PREFETCH_AHEAD = 2;
const MAX_CHUNK_CHARS = 180;
const MAX_CONSEC_FAIL = 3;
const KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const KOKORO_VOICES = {
  en: ['af_bella', 'af_heart', 'af_sky', 'am_adam', 'am_michael'],
  hi: ['hf_alpha', 'hf_beta', 'hm_omega', 'hm_psi'],
};
const KOKORO_SAMPLE_RATE = 24000;
/* Google Telugu: per-sentence audio, small and incremental. One sentence is
   ~10–30 KB — it downloads in seconds even on a slow connection, unlike a
   115 MB model that never finishes. */
const GT_CHUNK_CHARS = 150;
const GT_MIN_GAP_MS = 300;        // throttle between Google requests (no 403)
const GT_FETCH_TIMEOUT_MS = 60000; // a slow connection gets a full minute
const GT_CHARS_PER_SEC = 10.5;    // measured: ~130 chars -> ~11.4s of audio
let gtLastFetchAt = 0;

function langCode(lang) { return (lang || 'en').toLowerCase().slice(0, 2); }
function neuralVoiceFor(lang) {
  const code = langCode(lang);
  if (code === 'hi') return 'hf_alpha';
  return 'af_bella';
}
function hasVoiceFor(lang) { return ['en', 'hi', 'te'].indexOf(langCode(lang)) >= 0; }
function neuralAudioEl() {
  if (!NEURAL.audioEl) {
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    document.body.appendChild(a);
    NEURAL.audioEl = a;
  }
  return NEURAL.audioEl;
}
function floatToWavBlob(samples, sampleRate) {
  const n = samples.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const wstr = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  wstr(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); wstr(8, 'WAVE');
  wstr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
  v.setUint16(22, 1, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  wstr(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] || 0));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------------- top download bar (v3) ---------------- */
/* One slim bar pinned to the very TOP of the screen. It shows what is
   downloading (voice / chapter audio) and its progress, so the user never
   has to hunt in Settings — and never wonders whether anything is happening. */
const DL = { active: false, label: '', done: 0, total: 0, lastPaint: 0 };
function setDlProgress(label, done, total) {
  const bar = $('#dlBar'); if (!bar) return;
  DL.active = true; DL.label = label || ''; DL.done = done || 0; DL.total = total || 0;
  const now = performance.now();
  if (now - DL.lastPaint < 150 && done < total) return; // throttle DOM writes
  DL.lastPaint = now;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  $('#dlLabel').textContent = label + (total > 0 ? ' — ' + done + '/' + total : '');
  $('#dlFill').style.width = pct + '%';
  $('#dlPct').textContent = pct + '%';
  bar.classList.remove('hidden');
}
function setDlMessage(label, pct) {
  const bar = $('#dlBar'); if (!bar) return;
  DL.active = true; DL.label = label || '';
  $('#dlLabel').textContent = label;
  // pct is the HONEST progress (a failure message must not show a full bar)
  $('#dlFill').style.width = (pct != null ? clamp(pct, 0, 100) : 100) + '%';
  $('#dlPct').textContent = pct != null ? Math.round(pct) + '%' : '';
  bar.classList.remove('hidden');
}
function hideDlBar() {
  const bar = $('#dlBar'); if (!bar) return;
  DL.active = false;
  bar.classList.add('hidden');
}
function setNeuralStatus(msg) {
  NEURAL.status = msg || '';
  const n = $('#kokoroNote');
  if (n) n.textContent = msg || 'Voices in your browser — Kokoro (English/Hindi) + Google Telugu. The book\u2019s language is detected automatically; its voice downloads when you open the book.';
  updateVoicePanel();
  updateAudioBar();
}

/* ---------------- Kokoro in a Web Worker (v3) ---------------- */
/* Synthesis runs off the main thread so the UI never freezes while Kokoro
   thinks. If the worker cannot start or fails, the main thread takes over
   (v2.1 behaviour) — the app keeps working either way. */
const KOKORO_WORKER_SRC = `
let model = null;
self.onmessage = async function (e) {
  var d = e.data || {};
  try {
    if (d.type === 'load') {
      var mod = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
      model = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
        dtype: 'q8', device: 'wasm',
        progress_callback: function (p) { try { self.postMessage({ type: 'progress', loaded: p.loaded || 0, total: p.total || 0 }); } catch (err) {} }
      });
      self.postMessage({ type: 'loaded', id: d.id });
    } else if (d.type === 'synth') {
      if (!model) throw new Error('kokoro not loaded');
      var audio = await model.generate(d.text, { voice: d.voice, speed: d.speed || 1 });
      var arr = audio.audio;
      self.postMessage({ type: 'audio', id: d.id, audio: arr, sampling_rate: audio.sampling_rate }, [arr.buffer]);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: d.id, error: String((err && err.message) || err) });
  }
};
`;
function kokoroWorkerStart() {
  if (NEURAL.kokoroWorkerFailed) return null;
  if (NEURAL.kokoroWorker) return NEURAL.kokoroWorker;
  try {
    const blob = new Blob([KOKORO_WORKER_SRC], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const w = new Worker(url, { type: 'module' });
    w.onmessage = (e) => {
      const d = e.data || {};
      if (d.type === 'progress') { setDlProgress('Downloading Kokoro voice', d.loaded || 0, d.total || 0); return; }
      const p = NEURAL.kokoroWorkerPending.get(d.id);
      if (!p) return;
      NEURAL.kokoroWorkerPending.delete(d.id);
      if (d.type === 'error') p.reject(new Error(d.error || 'worker error'));
      else if (d.type === 'loaded') p.resolve(true);
      else if (d.type === 'audio') p.resolve({ samples: d.audio, sampleRate: d.sampling_rate || KOKORO_SAMPLE_RATE });
    };
    w.onerror = () => kokoroWorkerFail(new Error('Kokoro worker error'));
    NEURAL.kokoroWorker = w;
    return w;
  } catch (e) {
    NEURAL.kokoroWorkerFailed = true;
    return null;
  }
}
function kokoroWorkerFail(err) {
  NEURAL.kokoroWorkerFailed = true;
  NEURAL.kokoroWorkerReady = null;
  NEURAL.kokoroWorkerPending.forEach(p => p.reject(err || new Error('Kokoro worker failed')));
  NEURAL.kokoroWorkerPending.clear();
  if (NEURAL.kokoroWorker) { try { NEURAL.kokoroWorker.terminate(); } catch (e) {} NEURAL.kokoroWorker = null; }
}
function kokoroWorkerCall(msg, timeoutMs) {
  const w = kokoroWorkerStart();
  if (!w) return Promise.reject(new Error('worker unavailable'));
  const id = ++NEURAL.kokoroWorkerSeq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      NEURAL.kokoroWorkerPending.delete(id);
      reject(new Error('Kokoro worker timed out'));
    }, timeoutMs || 60000);
    NEURAL.kokoroWorkerPending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
    });
    try { w.postMessage(Object.assign({ id }, msg)); }
    catch (e) { NEURAL.kokoroWorkerPending.delete(id); clearTimeout(timer); reject(e); }
  });
}
async function ensureKokoroWorker() {
  if (NEURAL.kokoroWorkerReady) return NEURAL.kokoroWorkerReady;
  NEURAL.kokoroWorkerReady = (async () => {
    await kokoroWorkerCall({ type: 'load' }, 180000);
    return true;
  })().catch(err => {
    kokoroWorkerFail(err);
    NEURAL.kokoroWorkerReady = null;
    throw err;
  });
  return NEURAL.kokoroWorkerReady;
}
async function ensureKokoro(progressCb) {
  if (NEURAL.kokoro) return NEURAL.kokoro;
  if (NEURAL.kokoroLoading) return NEURAL.kokoroLoading;
  setNeuralStatus('Downloading Kokoro voice… (one-time, about 90 MB)');
  NEURAL.kokoroLoading = (async () => {
    const mod = await import('https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm');
    const KokoroTTS = mod.KokoroTTS;
    const device = (typeof navigator !== 'undefined' && navigator.gpu) ? 'webgpu' : 'wasm';
    const tts = await KokoroTTS.from_pretrained(KOKORO_MODEL, {
      dtype: 'q8',
      device,
      progress_callback: progressCb || null,
    });
    NEURAL.kokoro = tts;
    setNeuralStatus('');
    return tts;
  })().catch(err => {
    NEURAL.kokoroLoading = null;
    setNeuralStatus('Kokoro voice could not load — connect to the internet once to download it.');
    throw err;
  });
  return NEURAL.kokoroLoading;
}
async function synthesizeKokoro(text, voice, rate, cancelled) {
  if (!NEURAL.kokoroWorkerFailed) {
    try {
      await withTimeout(ensureKokoroWorker(), 180000, 'load Kokoro voice');
      const res = await kokoroWorkerCall({ type: 'synth', text, voice, speed: rate }, SYNTH_TIMEOUT_MS);
      if (cancelled && cancelled()) throw new Error('cancelled');
      return res;
    } catch (e) {
      if (cancelled && cancelled()) throw e;
      kokoroWorkerFail(e); // fall back to the main thread, once
    }
  }
  let tts;
  try { tts = await withTimeout(ensureKokoro(), SYNTH_TIMEOUT_MS, 'load Kokoro voice'); }
  catch (e) { const err = new Error('Voice needs one download — connect to the internet once, then it works offline.'); err.voiceLoadFailed = true; throw err; }
  if (cancelled && cancelled()) throw new Error('cancelled');
  const audio = await withTimeout(tts.generate(text, { voice, speed: rate }), SYNTH_TIMEOUT_MS, 'synthesize Kokoro');
  return { samples: audio.audio, sampleRate: audio.sampling_rate || KOKORO_SAMPLE_RATE };
}

/* ---------------- Google Telugu voice (v3) ---------------- */
/* Clear, natural Google Telugu via the translate_tts web endpoint.
   Playback uses <audio> elements (media playback needs no CORS), and a
   pool of audio elements pre-buffers the next sentences so playback is
   smooth. A Service Worker (sw.js) caches the audio so repeat listens work
   offline; if the worker is not active the audio still plays direct. */
function googleTtsUrl(text, lang) {
  const params = new URLSearchParams({ ie: 'UTF-8', tl: langCode(lang) === 'hi' ? 'hi' : 'te', client: 'tw-ob', total: '1', idx: '0', textlen: String(text.length), q: text });
  return 'https://translate.google.com/translate_tts?' + params.toString();
}
function gtEstimateSec(text) {
  const n = String(text || '').length;
  return Math.max(0.6, n / GT_CHARS_PER_SEC);
}
/* Pool of <audio> elements for Google playback + pre-buffering. The element
   that pre-buffered a sentence is the one that plays it, so the buffered
   data is actually reused (the browser does not HTTP-cache this endpoint). */
const GT_POOL = [];
function gtPoolEl() {
  let slot = GT_POOL.find(s => !s.busy);
  if (!slot) {
    const a = document.createElement('audio');
    a.preload = 'auto';
    a.setAttribute('playsinline', '');
    document.body.appendChild(a);
    slot = { el: a, key: '', busy: false };
    GT_POOL.push(slot);
  }
  return slot;
}
function gtAudioFor(key, url) {
  let slot = GT_POOL.find(s => s.key === key);
  if (slot) return slot;
  slot = gtPoolEl();
  slot.key = key;
  slot.busy = true;
  slot.el.src = url;
  try { slot.el.load(); } catch (e) {}
  return slot;
}
function gtRelease(slot) {
  if (!slot) return;
  slot.busy = false;
  slot.key = '';
  try { slot.el.removeAttribute('src'); slot.el.load(); } catch (e) {}
}
function gtReleaseAll() {
  GT_POOL.forEach(s => { try { s.el.pause(); } catch (e) {} gtRelease(s); });
}
function gtSentenceKey(chapter, idx) { return (state.meta ? state.meta.id : 'x') + '::' + chapter + '::' + idx; }
/* Prepare (buffer) one Google sentence in the background. Resolves true
   when the audio is buffered enough to play, false on failure. Never throws
   for a single sentence — the caller decides what a failure means. */
function gtPrepare(key, text, lang) {
  const url = googleTtsUrl(text, lang);
  const slot = gtAudioFor(key, url);
  const a = slot.el;
  if (a.readyState >= 3) return Promise.resolve(true); // already buffered
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (done) return; done = true; a.removeEventListener('canplaythrough', onOk); a.removeEventListener('error', onErr); resolve(v); };
    const onOk = () => finish(true);
    const onErr = () => finish(false);
    a.addEventListener('canplaythrough', onOk);
    a.addEventListener('error', onErr);
    setTimeout(() => finish(a.readyState >= 2), GT_FETCH_TIMEOUT_MS);
  });
}
/* Play one prepared Google sentence through its pooled audio element.
   Resolves true when it ends, false if cancelled. Never hangs: a watchdog
   resolves it from the real duration (or the estimate) if 'ended' never fires. */
async function gtPlay(slot, text, rate, token) {
  const a = slot.el;
  const est = gtEstimateSec(text);
  const dur = (a.duration && isFinite(a.duration) && a.duration > 0) ? a.duration : est;
  const playDur = dur / clamp(rate, 0.5, 2);
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const perWord = words.length ? playDur / words.length : playDur;
  clearTimeout(NEURAL.wordTimer);
  let wi = -1;
  const startAt = performance.now();
  const tick = () => {
    if (token !== NEURAL.playToken) return;
    const elapsed = (performance.now() - startAt) / 1000;
    const idx = Math.min(words.length - 1, Math.floor(elapsed / Math.max(0.05, perWord)));
    if (idx !== wi && idx >= 0) { wi = idx; markWordByIndex(idx); }
    if (elapsed < playDur + 0.2) NEURAL.wordTimer = setTimeout(tick, 60);
  };
  NEURAL.wordTimer = setTimeout(tick, 30);
  a.playbackRate = clamp(rate, 0.5, 2);
  try { await a.play(); } catch (e) { clearTimeout(NEURAL.wordTimer); return false; }
  const finished = await new Promise(res => {
    let done = false;
    let watchdog = null;
    const finish = v => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
      res(v);
    };
    const onEnd = () => finish(true);
    const onErr = () => finish(false);
    watchdog = setTimeout(() => finish(true), Math.max(4000, (playDur + 10) * 1000));
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
  });
  clearTimeout(NEURAL.wordTimer);
  if (token !== NEURAL.playToken) return false;
  return finished;
}

/* ---------------- unified synthesis + playback ---------------- */
/* A "clip" is what one sentence becomes before it is played:
   - Kokoro: {format:'pcm', samples, sampleRate, duration}
   - Google: {format:'gt', slot, text, duration} (slot = pooled <audio>) */
async function synthesizeNeural(text, lang, opts) {
  opts = opts || {};
  const clean = sanitizeForSpeech(text, lang);
  if (!hasSpeakable(clean)) return { empty: true };
  if (langCode(lang) === 'te') {
    // Google Telugu: one audio element per chunk; chunks play back to back.
    const chunks = chunkForSpeech(clean, GT_CHUNK_CHARS);
    const parts = [];
    for (let i = 0; i < chunks.length; i++) {
      if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
      const key = gtSentenceKey(state.currentChapter, state.sentenceIndex) + '::c' + i;
      const slot = gtAudioFor(key, googleTtsUrl(chunks[i], lang));
      parts.push({ slot, text: chunks[i], duration: gtEstimateSec(chunks[i]) });
      // buffer this chunk now (the narration loop waits for it below)
      const ok = await gtPrepare(key, chunks[i], lang);
      if (!ok) { /* a failed chunk is retried on demand by the caller */ }
      if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
    }
    const duration = parts.reduce((a, p) => a + p.duration, 0);
    return { format: 'gt', parts, duration };
  }
  // Kokoro (English/Hindi)
  const voice = neuralVoiceFor(lang);
  const rate = opts.rate || 1;
  const chunks = chunkForSpeech(clean, MAX_CHUNK_CHARS);
  const parts = [];
  let sampleRate = KOKORO_SAMPLE_RATE;
  for (const chunk of chunks) {
    if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
    const res = await synthesizeKokoro(chunk, voice, rate, opts.cancelled);
    parts.push(res.samples);
    sampleRate = res.sampleRate || sampleRate;
    if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
  }
  let total = 0;
  parts.forEach(a => { total += a.length; });
  const merged = new Float32Array(total);
  let off = 0;
  parts.forEach(a => { merged.set(a, off); off += a.length; });
  return { format: 'pcm', samples: merged, sampleRate, duration: total / sampleRate };
}
async function playClip(clip, lang, opts) {
  opts = opts || {};
  const token = ++NEURAL.playToken;
  const rate = opts.rate || 1;
  if (clip.format === 'gt') {
    let allOk = true;
    for (const part of clip.parts) {
      if (token !== NEURAL.playToken) return false;
      // make sure this chunk is buffered before playing it
      const ready = await gtPrepare(part.slot.key, part.text, lang);
      if (!ready) { allOk = false; break; }
      if (token !== NEURAL.playToken) return false;
      const ok = await gtPlay(part.slot, part.text, rate, token);
      gtRelease(part.slot);
      if (!ok) return false;
    }
    return allOk;
  }
  // Kokoro PCM path (v2.1 behaviour, unchanged)
  const samples = clip.samples, sampleRate = clip.sampleRate;
  const blob = floatToWavBlob(samples, sampleRate);
  const url = URL.createObjectURL(blob);
  const a = neuralAudioEl();
  const duration = samples.length / sampleRate;
  const playDur = duration;
  const words = String(opts.text || '').split(/\s+/).filter(Boolean);
  const perWord = words.length ? playDur / words.length : playDur;
  clearTimeout(NEURAL.wordTimer);
  let wi = -1;
  const startAt = performance.now();
  const tick = () => {
    if (token !== NEURAL.playToken) return;
    const elapsed = (performance.now() - startAt) / 1000;
    const idx = Math.min(words.length - 1, Math.floor(elapsed / Math.max(0.05, perWord)));
    if (idx !== wi && idx >= 0) { wi = idx; markWordByIndex(idx); }
    if (elapsed < playDur + 0.2) NEURAL.wordTimer = setTimeout(tick, 60);
  };
  NEURAL.wordTimer = setTimeout(tick, 30);
  try {
    a.playbackRate = 1;
    a.src = url;
    await a.play();
  } catch (e) {
    clearTimeout(NEURAL.wordTimer);
    URL.revokeObjectURL(url);
    return false;
  }
  const finished = await new Promise(res => {
    let done = false;
    let watchdog = null;
    const finish = v => {
      if (done) return;
      done = true;
      clearTimeout(watchdog);
      a.removeEventListener('ended', onEnd);
      a.removeEventListener('error', onErr);
      res(v);
    };
    const onEnd = () => finish(true);
    const onErr = () => finish(false);
    watchdog = setTimeout(() => finish(true), Math.max(3000, (playDur + 8) * 1000));
    a.addEventListener('ended', onEnd);
    a.addEventListener('error', onErr);
  });
  clearTimeout(NEURAL.wordTimer);
  URL.revokeObjectURL(url);
  if (token !== NEURAL.playToken) return false;
  return finished;
}
/* One-off speech (selection "hear", tap-to-hear): synthesize then play. */
async function speakNeural(text, lang, opts) {
  opts = opts || {};
  const tokenBefore = NEURAL.playToken;
  const res = await synthesizeNeural(text, lang, opts);
  if (res.empty) return true;
  if (tokenBefore !== NEURAL.playToken) return false;
  return playClip(res, lang, { rate: opts.rate || 1, text });
}
/* Prefetch: prepare upcoming sentences in the background while the current
   one plays, so playback is continuous instead of speak-then-wait. For
   Google that means buffering the next sentences' audio elements; for
   Kokoro it means synthesizing them ahead. A single bad line is dropped. */
function prefetchKey(chapter, idx) { return chapter + ':' + idx; }
function cancelPrefetch() {
  NEURAL.prefetchToken++;
  NEURAL.prefetch.clear();
}
async function prefetchFrom(startIdx) {
  const myToken = NEURAL.prefetchToken;
  const chapter = state.currentChapter;
  const lang = state.meta ? state.meta.language : 'en';
  const rate = effectiveRate();
  for (let k = 0; k < PREFETCH_AHEAD; k++) {
    const idx = startIdx + k;
    if (idx >= state.sentences.length) break;
    if (myToken !== NEURAL.prefetchToken || chapter !== state.currentChapter || !state.playing) return;
    const s = state.sentences[idx];
    if (!s || s.image) continue;
    if (langCode(lang) === 'te') {
      // Google: buffer the sentence's chunks ahead (cheap, async, off-thread)
      const clean = sanitizeForSpeech(s.text, lang);
      if (!hasSpeakable(clean)) continue;
      const chunks = chunkForSpeech(clean, GT_CHUNK_CHARS);
      for (let i = 0; i < chunks.length; i++) {
        const key = gtSentenceKey(chapter, idx) + '::c' + i;
        gtAudioFor(key, googleTtsUrl(chunks[i], lang));
      }
      continue;
    }
    const key = prefetchKey(chapter, idx);
    if (NEURAL.prefetch.has(key)) continue;
    const cancelled = () => myToken !== NEURAL.prefetchToken || chapter !== state.currentChapter;
    try {
      const p = synthesizeNeural(s.text, lang, { rate, cancelled });
      NEURAL.prefetch.set(key, p);
      const res = await p;
      if (cancelled() || !state.playing) { NEURAL.prefetch.delete(key); return; }
      NEURAL.prefetch.set(key, res);
    } catch (e) {
      NEURAL.prefetch.delete(key);
    }
    if (myToken !== NEURAL.prefetchToken || chapter !== state.currentChapter || !state.playing) return;
  }
}
/* PAUSE / STOP — synchronous, instant, never awaits anything. This is what
   makes the Play/Pause buttons respond within a tap even while a voice is
   loading, downloading, or synthesizing (v2.1 froze here on a slow link). */
function stopNeural() {
  NEURAL.playToken++;
  NEURAL.narrationToken++;
  cancelPrefetch();
  clearTimeout(NEURAL.wordTimer);
  if (NEURAL.abortCtl) { try { NEURAL.abortCtl.abort(); } catch (e) {} NEURAL.abortCtl = null; }
  gtReleaseAll();
  const a = NEURAL.audioEl;
  if (a) { try { a.pause(); } catch (e) {} a.removeAttribute('src'); try { a.load(); } catch (e) {} }
}
/* Highlight the word at (0-based) index inside the currently speaking
   sentence. v3: the WHOLE word gets the bounce — the word is one intact
   text node, never split into per-letter spans, so Telugu conjuncts and
   vowel signs render exactly as the shaping engine intends. */
function markWordByIndex(idx) {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  const node = paraElements().find(n => Number(n.dataset.para) === s.paraIdx);
  if (!node) return;
  const sent = node.querySelector('.sentence');
  if (!sent) return;
  const wEls = sent.querySelectorAll('.w');
  const target = wEls[idx];
  if (!target) return;
  if (target.classList.contains('on')) return;
  sent.querySelectorAll('.w.on').forEach(w => w.classList.remove('on'));
  target.classList.add('on');
}

/* ---------------- language detection (spec §6.1) ---------------- */
function detectScriptLang(text) {
  if (!text) return 'en';
  let te = 0, hi = 0, lat = 0;
  for (const ch of text.slice(0, 2000)) {
    const c = ch.codePointAt(0);
    if (c >= 0x0C00 && c <= 0x0C7F) te++;
    else if (c >= 0x0900 && c <= 0x097F) hi++;
    else if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A)) lat++;
  }
  if (te > hi && te > lat) return 'te';
  if (hi > te && hi > lat) return 'hi';
  return 'en';
}
function normaliseLang(raw) {
  if (!raw) return null;
  const l = String(raw).toLowerCase();
  if (l.indexOf('te') === 0 || l.indexOf('telugu') >= 0) return 'te';
  if (l.indexOf('hi') === 0 || l.indexOf('hindi') >= 0) return 'hi';
  if (l.indexOf('en') === 0 || l.indexOf('english') >= 0) return 'en';
  return null;
}

/* ---------------- sentence splitting (Telugu danda + English + Hindi) ---------------- */
function splitSentences(text) {
  if (!text) return [];
  const clean = String(text).replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const re = /[^.!?।…]+(?:[.!?।…]+["'”’)\]]*)?/g;
  const out = [];
  let m;
  while ((m = re.exec(clean)) !== null) {
    const s = m[0].trim();
    if (s) out.push(s);
  }
  return out.length ? out : [clean];
}
function isDialogue(s) { return /^["'“‘]/.test(s.trim()) || /["'“”]/.test(s.trim().slice(0, 3)); }
function sentenceMood(s, chapterMood, prevLen) {
  if (isDialogue(s)) return 'dialogue';
  return chapterMood;
}
function isReveal(s, prevLen) {
  return prevLen > 120 && s.length < 40;
}

/* ---------------- text preparation before speaking (spec §5.5) ---------------- */
function prepForSpeech(text, lang) {
  let s = String(text || '');
  s = s.replace(/\[image\]/gi, ' ');
  s = s.replace(/\[\d+\]/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  if (langCode(lang) === 'en') {
    s = s.replace(/\bDr\./g, 'Doctor').replace(/\bMr\./g, 'Mister').replace(/\bMrs\./g, 'Missus').replace(/\bSt\./g, 'Saint');
  }
  return s;
}
const TE_DIGITS = ['సున్నా', 'ఒకటి', 'రెండు', 'మూడు', 'నాలుగు', 'ఐదు', 'ఆరు', 'ఏడు', 'ఎనిమిది', 'తొమ్మిది'];
const TE_TENS = { 10: 'పది', 11: 'పదకొండు', 12: 'పన్నెండు', 13: 'పదమూడు', 14: 'పద్నాలుగు', 15: 'పదిహేను', 16: 'పదహారు', 17: 'పదిహేడు', 18: 'పద్దెనిమిది', 19: 'పందొమ్మిది', 20: 'ఇరవై', 30: 'ముప్పై', 40: 'నలభై', 50: 'యాభై', 60: 'అరవై' };
function teNumber(n) {
  if (n < 10) return TE_DIGITS[n];
  if (TE_TENS[n]) return TE_TENS[n];
  const t = Math.floor(n / 10) * 10, o = n % 10;
  return (TE_TENS[t] || String(t)) + (o ? ' ' + TE_DIGITS[o] : '');
}
function teTime(h, m) {
  let out = teNumber(h) + ' గంటల';
  if (m) out += ' ' + teNumber(m) + ' నిమిషాలు';
  return out;
}
function sanitizeForSpeech(text, lang) {
  let s = String(text || '');
  if (langCode(lang) === 'te') {
    s = s.replace(/\b(\d{1,2}):(\d{2})\b/g, (m, h, mn) => teTime(parseInt(h, 10), parseInt(mn, 10)));
    s = s.replace(/\b\d+\b/g, m => { const n = parseInt(m, 10); return n <= 99 ? teNumber(n) : m; });
  }
  s = s.replace(/["'“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}
function hasSpeakable(text) {
  return /[\u0c00-\u0c7f\u0900-\u097fA-Za-z]/.test(String(text || ''));
}
function chunkForSpeech(text, maxLen) {
  const max = maxLen || MAX_CHUNK_CHARS;
  if (text.length <= max) return [text];
  const parts = text.split(/(?<=[,;:—–])\s+|(?<=\s)(?=(?:మరియు|కానీ|అయినా|కాబట్టి)\s)/);
  const chunks = [];
  let cur = '';
  const pushWordSplit = p => {
    p.split(/\s+/).forEach(w => {
      if ((cur + ' ' + w).trim().length <= max) cur = (cur + ' ' + w).trim();
      else { if (cur) chunks.push(cur); cur = w; }
    });
  };
  parts.forEach(p => {
    if ((cur + ' ' + p).trim().length <= max) cur = (cur + ' ' + p).trim();
    else {
      if (cur) chunks.push(cur);
      if (p.length <= max) cur = p;
      else { cur = ''; pushWordSplit(p); }
    }
  });
  if (cur) chunks.push(cur);
  return chunks.length ? chunks : [text];
}
function withTimeout(promise, ms, label) {
  let timer = null;
  const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Timed out: ' + label)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/* ---------------- chapter extraction from an epub.js section ---------------- */
function extractParagraphs(doc) {
  const paras = [];
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
  let node;
  const blocks = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'BLOCKQUOTE', 'LI', 'DIV']);
  while ((node = walker.nextNode())) {
    const tag = (node.tagName || '').toUpperCase();
    if (tag === 'SCRIPT' || tag === 'STYLE') continue;
    if (tag === 'IMG') {
      const src = node.getAttribute('src') || '';
      const alt = node.getAttribute('alt') || '';
      paras.push({ kind: 'img', src, alt, text: '' });
      continue;
    }
    if (blocks.has(tag)) {
      if (tag === 'DIV' && Array.from(node.getElementsByTagName('*')).some(d => ['p','h1','h2','h3','blockquote','li'].indexOf((d.tagName || '').toLowerCase()) >= 0)) continue;
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const html = node.innerHTML;
      paras.push({ kind: tag.toLowerCase(), text, html });
    }
  }
  return paras;
}
function parasToSentences(paras, chapterMood) {
  const out = [];
  let prevLen = 0;
  paras.forEach((p, pi) => {
    if (p.kind === 'img') { out.push({ text: '', paraIdx: pi, mood: chapterMood, image: true }); return; }
    splitSentences(p.text).forEach(s => {
      const mood = sentenceMood(s, chapterMood, prevLen);
      out.push({ text: prepForSpeech(s, state.meta ? state.meta.language : 'en'), paraIdx: pi, mood, reveal: isReveal(s, prevLen) });
      prevLen = s.length;
    });
  });
  return out.filter(s => s.text || s.image);
}

/* ---------------- EPUB loading (epub.js) ---------------- */
async function openEpub(arrayBuffer, fileName) {
  if (typeof ePub !== 'function') throw new Error('EPUB engine failed to load');
  const book = ePub(arrayBuffer);
  await book.ready;
  const md = book.package.metadata || {};
  const title = (md.title || fileName || 'Untitled').toString().replace(/\.epub$/i, '');
  const author = (md.creator || 'Unknown author').toString();
  const subtitle = (md.description || '').toString().slice(0, 200);
  const lang = normaliseLang(md.language) || null;
  const coverUrl = await getCoverUrl(book).catch(() => null);
  const tocFlat = [];
  (function walk(items) { (items || []).forEach(it => { tocFlat.push(it); if (it.subitems) walk(it.subitems); }); })(book.navigation.toc || []);
  const hrefToSpine = {};
  book.spine.items.forEach((it, i) => { hrefToSpine[it.href] = i; hrefToSpine[it.href.split('#')[0]] = i; });
  const chapters = [];
  const seen = new Set();
  tocFlat.forEach(it => {
    const href = (it.href || '').split('#')[0];
    const si = hrefToSpine[href];
    if (si == null || seen.has(si)) return;
    seen.add(si);
    chapters.push({ title: (it.label || 'Chapter').trim(), href, spineIndex: si, kind: classifyChapter(it.label, href), mood: null });
  });
  if (!chapters.length) {
    book.spine.items.forEach((it, i) => {
      if (it.linear === 'no') return;
      chapters.push({ title: 'Part ' + (chapters.length + 1), href: it.href, spineIndex: i, kind: 'chapter', mood: null });
    });
  }
  const id = bookIdFor(title, author);
  state.book = book; state.bookType = 'epub'; state.pdfPages = null;
  state.meta = { id, title, author, subtitle, language: lang || 'en', description: subtitle, coverUrl, fileName };
  state.chapters = chapters;
  state.currentChapter = 0; state.sentenceIndex = 0; state.cacheCount = 0;
  if (!lang) {
    const first = await loadChapterText(0).catch(() => null);
    if (first) state.meta.language = detectScriptLang(first.paras.map(p => p.text).join(' '));
  }
  await registerBook();
  return state.meta;
}
function classifyChapter(label, href) {
  const l = (label || '').toLowerCase();
  const h = (href || '').toLowerCase();
  if (/table of contents|contents|విషయ|సూచిక|toc/.test(l)) return 'toc';
  if (/cover\.xhtml|title\.xhtml|cover|title page/.test(h) || /cover|title page/.test(l)) return 'front';
  if (/intro|about|గురించి|పరిచయం|ముందుమాట|preface|foreword/.test(l) || /about|intro|preface/.test(h)) return 'intro';
  if (/appendix|author|అనుబంధం|రచయిత/.test(l)) return 'back';
  return 'chapter';
}
async function getCoverUrl(book) {
  try {
    const url = await book.coverUrl();
    return url || null;
  } catch (e) { return null; }
}
async function resolveImageUrl(book, src) {
  try {
    if (!src || src.indexOf('data:') === 0 || src.indexOf('http') === 0) return src;
    const url = await book.archive.createUrl(src);
    return url || src;
  } catch (e) { return src; }
}
async function loadChapterText(chIdx) {
  const ch = state.chapters[chIdx];
  if (!ch) return null;
  const cached = await idbGet('chapters', state.meta.id + '::' + chIdx).catch(() => null);
  if (cached && cached.paras) return cached;
  let paras;
  if (state.bookType === 'epub') {
    const section = state.book.spine.get(ch.spineIndex);
    await section.load(state.book.load.bind(state.book));
    paras = extractParagraphs(section.document);
    for (const p of paras) {
      if (p.kind === 'img') p.blobUrl = await resolveImageUrl(state.book, p.src);
    }
    try { section.unload(); } catch (e) {}
  } else {
    paras = state.pdfPages ? state.pdfPages.slice(ch.pageStart, ch.pageEnd).map(t => ({ kind: 'p', text: t, html: '' })) : [];
  }
  const rec = { key: state.meta.id + '::' + chIdx, paras };
  idbPut('chapters', rec).catch(() => {});
  return rec;
}
async function loadChapter(chIdx, opts) {
  opts = opts || {};
  cancelPrefetch();
  const rec = await loadChapterText(chIdx);
  if (!rec) return false;
  state.currentChapter = chIdx;
  state.paragraphs = rec.paras;
  const mood = moodOfChapter(state.chapters[chIdx]);
  state.sentences = parasToSentences(rec.paras, mood);
  state.sentenceIndex = 0;
  if (opts.keepPosition && state.pendingSentence != null) {
    state.sentenceIndex = clamp(state.pendingSentence, 0, Math.max(0, state.sentences.length - 1));
    state.pendingSentence = null;
  }
  renderChapter();
  // v3: wrap the current sentence right away so tap-a-word-to-hear works
  // before Play is ever pressed (and so the whole-word highlight is visible).
  buildSentenceSpans();
  updateChapterList();
  updateCacheInfo();
  updateAudioBar();
  savePosition();
  return true;
}

/* ---------------- PDF loading (pdf.js inlined; local conversion) ---------------- */
async function openPdf(arrayBuffer, fileName) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF engine failed to load');
  if (!window.__pdfWorkerUrl) {
    const blob = new Blob([window.__PDF_WORKER_SRC__ || ''], { type: 'text/javascript' });
    window.__pdfWorkerUrl = URL.createObjectURL(blob);
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = window.__pdfWorkerUrl;
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const meta = await pdf.getMetadata().catch(() => ({ info: {} }));
  const info = (meta && meta.info) || {};
  const title = (info.Title || fileName || 'Untitled').toString().replace(/\.pdf$/i, '');
  const author = (info.Author || 'Unknown author').toString();
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const text = tc.items.map(it => it.str || '').join(' ').replace(/\s+/g, ' ').trim();
    pages.push(text);
  }
  const id = bookIdFor(title, author);
  state.book = null; state.bookType = 'pdf'; state.pdfPages = pages;
  const lang = detectScriptLang(pages.slice(0, 3).join(' '));
  const chapters = [];
  const per = 6;
  for (let i = 0; i < pages.length; i += per) {
    chapters.push({ title: 'Part ' + (chapters.length + 1) + ' (pages ' + (i + 1) + '–' + Math.min(i + per, pages.length) + ')', href: '', spineIndex: -1, kind: 'chapter', mood: null, pageStart: i, pageEnd: Math.min(i + per, pages.length) });
  }
  state.meta = { id, title, author, subtitle: '', language: lang, description: '', coverUrl: null, fileName };
  state.chapters = chapters;
  state.currentChapter = 0; state.sentenceIndex = 0; state.cacheCount = 0;
  await registerBook();
  return state.meta;
}

/* ---------------- library registration ---------------- */
async function registerBook() {
  const m = state.meta;
  const existing = library.find(b => b.id === m.id);
  const entry = existing || { id: m.id, title: m.title, author: m.author, language: m.language, coverUrl: m.coverUrl, chapters: state.chapters.length, progress: 0, lastChapter: 0, lastSentence: 0, updated: Date.now() };
  entry.title = m.title; entry.author = m.author; entry.language = m.language; entry.coverUrl = m.coverUrl; entry.chapters = state.chapters.length; entry.updated = Date.now();
  if (!existing) library.unshift(entry);
  else { library.splice(library.indexOf(existing), 1); library.unshift(entry); }
  library = library.slice(0, 12);
  saveLibrary();
  state.bookmarks = JSON.parse(localStorage.getItem('epubreader.bm.' + m.id) || '[]');
  state.highlights = JSON.parse(localStorage.getItem('epubreader.hl.' + m.id) || '[]');
  state.completedChapters = JSON.parse(localStorage.getItem('epubreader.done.' + m.id) || '{}');
  state.perBook = JSON.parse(localStorage.getItem('epubreader.pb.' + m.id) || '{}');
  applyPerBookSettings();
  renderLibrary();
  renderContinueCard();
}
function savePosition() {
  if (!state.meta) return;
  const entry = library.find(b => b.id === state.meta.id);
  if (entry) {
    entry.lastChapter = state.currentChapter;
    entry.lastSentence = state.sentenceIndex;
    entry.progress = state.chapters.length ? Math.round(((state.currentChapter + (state.sentences.length ? state.sentenceIndex / state.sentences.length : 0)) / state.chapters.length) * 100) : 0;
    entry.updated = Date.now();
    saveLibrary();
  }
  try {
    localStorage.setItem('epubreader.pos.' + state.meta.id, JSON.stringify({ chapter: state.currentChapter, sentence: state.sentenceIndex, at: Date.now() }));
  } catch (e) {}
}
function loadPosition() {
  if (!state.meta) return null;
  try { return JSON.parse(localStorage.getItem('epubreader.pos.' + state.meta.id) || 'null'); } catch (e) { return null; }
}
function applyPerBookSettings() {
  const pb = state.perBook || {};
  if (pb.theme) settings.theme = pb.theme;
  if (pb.font) settings.font = pb.font;
  if (pb.direction) settings.direction = pb.direction;
  if (pb.speed) state.speed = pb.speed;
  applyTheme(); applyFont();
}
function savePerBookSettings() {
  if (!state.meta) return;
  state.perBook = { theme: settings.theme, font: settings.font, direction: settings.direction, speed: state.speed };
  try { localStorage.setItem('epubreader.pb.' + state.meta.id, JSON.stringify(state.perBook)); } catch (e) {}
}

/* ---------------- voice preparation: AUTO-DOWNLOAD on book select (v3) ---------------- */
/* The moment a book is selected, its language's voice starts preparing in
   the background — no waiting for Play, no manual step. Progress shows on
   the TOP bar. For Telugu that means buffering the current chapter's audio
   (small per-sentence downloads, never one huge file). For English/Hindi it
   means downloading the Kokoro model once. The job never blocks the UI: it
   is fully async, it retries a failed fetch with backoff, and it can be
   cancelled (a new book cancels the old job). */
const VOICE_PREP = { token: 0, lang: '', running: false };
function langDisplayName(code) {
  return code === 'te' ? 'Telugu' : code === 'hi' ? 'Hindi' : 'English';
}
async function prepareVoiceForBook() {
  if (!state.meta) return;
  const lang = langCode(state.meta.language);
  const myToken = ++VOICE_PREP.token;
  VOICE_PREP.lang = lang;
  VOICE_PREP.running = true;
  try {
    if (lang === 'te') {
      await warmChapterAudio(state.currentChapter, myToken, true);
      if (myToken !== VOICE_PREP.token) return;
      // keep warming the next chapters quietly (no top bar — the current
      // chapter is what matters for immediate Play)
      for (let c = state.currentChapter + 1; c < state.chapters.length; c++) {
        if (myToken !== VOICE_PREP.token || !state.meta) return;
        await warmChapterAudio(c, myToken, false).catch(() => {});
        await sleep(50);
      }
    } else {
      // Kokoro model, once. Progress shows on the top bar.
      setDlProgress('Downloading ' + langDisplayName(lang) + ' voice', 0, 100);
      try {
        await withTimeout(ensureKokoroWorker(), 180000, 'load Kokoro voice');
        if (myToken !== VOICE_PREP.token) return;
        setDlMessage(langDisplayName(lang) + ' voice ready');
        setTimeout(() => { if (myToken === VOICE_PREP.token) hideDlBar(); }, 1200);
      } catch (e) {
        // worker failed — the main-thread load is the fallback; it shows its
        // own status. Never a silent failure, never a device voice.
        if (myToken !== VOICE_PREP.token) return;
        setDlMessage('Kokoro voice needs one download — connect to the internet once');
        setTimeout(() => { if (myToken === VOICE_PREP.token) hideDlBar(); }, 4000);
      }
    }
  } finally {
    if (myToken === VOICE_PREP.token) VOICE_PREP.running = false;
  }
}
/* Buffer one chapter's Google audio ahead. `showBar` draws the top progress
   bar; the quiet path (later chapters) only buffers. Returns when the chapter
   is fully buffered (or the job was cancelled / failed). A failed sentence
   is retried once after a short backoff; if it still fails the chapter keeps
   going — one bad line never blocks the rest. */
async function warmChapterAudio(chIdx, token, showBar) {
  if (!state.meta || langCode(state.meta.language) !== 'te') return;
  const rec = await loadChapterText(chIdx).catch(() => null);
  if (!rec || token !== VOICE_PREP.token) return;
  const mood = moodOfChapter(state.chapters[chIdx]);
  const sentences = parasToSentences(rec.paras, mood).filter(s => s.text && !s.image);
  const total = sentences.length;
  if (!total) return;
  const label = 'Downloading Telugu voice — Chapter ' + (chIdx + 1);
  let ready = 0; // sentences ACTUALLY buffered — a failed fetch never counts
  // one pass over a list of sentence indices; returns the indices that failed
  const runPass = async (list) => {
    const stillFailed = [];
    for (const i of list) {
      if (token !== VOICE_PREP.token || !state.meta) return null;
      const s = sentences[i];
      const clean = sanitizeForSpeech(s.text, 'te');
      if (!hasSpeakable(clean)) { ready++; if (showBar) setDlProgress(label, ready, total); continue; }
      const chunks = chunkForSpeech(clean, GT_CHUNK_CHARS);
      let ok = true;
      for (let ci = 0; ci < chunks.length; ci++) {
        if (token !== VOICE_PREP.token) return null;
        const key = state.meta.id + '::' + chIdx + '::' + i + '::c' + ci;
        const got = await gtPrepare(key, chunks[ci], 'te');
        if (!got) {
          // retry once after a backoff (slow/flaky link), then move on
          await sleep(2000);
          if (token !== VOICE_PREP.token) return null;
          const got2 = await gtPrepare(key, chunks[ci], 'te');
          if (!got2) { ok = false; break; }
        }
        // throttle so Google never 403s us
        await sleep(GT_MIN_GAP_MS);
      }
      if (ok) { ready++; if (showBar) setDlProgress(label, ready, total); }
      else stillFailed.push(i);
      // yield to the UI thread every sentence — the page must stay responsive
      await sleep(0);
    }
    return stillFailed;
  };
  if (showBar) setDlProgress(label, 0, total);
  let failed = await runPass(sentences.map((_, i) => i));
  if (failed == null) return;
  if (failed.length && token === VOICE_PREP.token) {
    // one quiet background retry for the sentences that failed (slow link);
    // the bar says so honestly while it retries.
    if (showBar) setDlMessage(label + ' — ' + ready + ' of ' + total + ' ready, retrying the rest…', (ready / total) * 100);
    await sleep(5000);
    if (token !== VOICE_PREP.token) return;
    const failed2 = await runPass(failed);
    if (failed2 == null) return;
    failed = failed2;
  }
  // true only when EVERYTHING buffered — a partial download must never be
  // reported as "downloaded" (downloadLanguage relies on this).
  if (!showBar) return failed.length === 0;
  if (!failed.length) {
    setDlMessage('Telugu voice ready — Chapter ' + (chIdx + 1));
    setTimeout(() => { if (token === VOICE_PREP.token) hideDlBar(); }, 1200);
  } else {
    // HONEST failure state: never claim "ready" when it is not. The bar
    // stays visible at the true % so the user SEES the download did not
    // finish — the remaining sentences download when he listens.
    setDlMessage('Telugu voice: ' + ready + ' of ' + total + ' downloaded — connection is slow or offline. The rest will download when you listen.', (ready / total) * 100);
  }
  return failed.length === 0;
}

/* ---------------- Languages download section (v3) ---------------- */
/* A Languages section manages OFFLINE voice downloads only. It is NOT a
   language picker — reading language stays auto-detected from the book.
   Telugu/Hindi/English each show Downloaded / Not downloaded / Downloading
   with %, plus a Download button (and Remove once downloaded). */
const LANG_DL_KEY = 'epubreader.langdl.v1';
function langDlState() {
  try { return JSON.parse(localStorage.getItem(LANG_DL_KEY) || '{}'); } catch (e) { return {}; }
}
function saveLangDlState(s) { try { localStorage.setItem(LANG_DL_KEY, JSON.stringify(s)); } catch (e) {} }
function langDlStatus(code) {
  const s = langDlState();
  if (code === 'te') {
    // Telugu is "downloaded" when the current book's first chapter audio is buffered
    return s.te && s.te.downloaded ? 'downloaded' : 'not';
  }
  if (NEURAL.kokoro) return 'downloaded';
  return (s[code] && s[code].downloaded) ? 'downloaded' : 'not';
}
async function downloadLanguage(code) {
  const s = langDlState();
  if (code === 'te') {
    // Pre-buffer the current book's audio (or the first chapter if no book).
    // Progress shows on the top bar; the Service Worker also caches it.
    if (!state.meta) { toast('Open a book first — Telugu downloads with the book'); return; }
    setDlProgress('Downloading Telugu voice', 0, 100);
    const token = ++VOICE_PREP.token;
    const ok = await warmChapterAudio(state.currentChapter, token, true).catch(() => false);
    if (ok) {
      const st = langDlState(); st.te = { downloaded: true, at: Date.now() }; saveLangDlState(st);
      toast('Telugu voice downloaded for offline');
    } else {
      toast('Telugu download did not finish — check your connection and try again');
    }
    renderLangList();
    return;
  }
  // Kokoro (English/Hindi): download + cache the model once.
  setDlProgress('Downloading ' + langDisplayName(code) + ' voice', 0, 100);
  try {
    await withTimeout(ensureKokoroWorker(), 180000, 'load Kokoro voice');
    const st = langDlState(); st[code] = { downloaded: true, at: Date.now() }; saveLangDlState(st);
    setDlMessage(langDisplayName(code) + ' voice downloaded');
    setTimeout(hideDlBar, 1200);
    toast(langDisplayName(code) + ' voice downloaded for offline');
  } catch (e) {
    setDlMessage('Download failed — connect to the internet and try again');
    setTimeout(hideDlBar, 3000);
    toast('Download failed — check your connection and try again');
  }
  renderLangList();
}
async function removeLanguage(code) {
  const s = langDlState();
  if (code === 'te') {
    // clear the Service Worker TTS cache + the in-memory pool
    try {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'clear-tts' });
      }
      if (window.caches) { const names = await caches.keys(); for (const n of names) { if (n.indexOf('gtts') === 0) await caches.delete(n); } }
    } catch (e) {}
    gtReleaseAll();
    delete s.te;
    saveLangDlState(s);
    toast('Telugu offline voice removed');
  } else {
    delete s[code];
    saveLangDlState(s);
    toast(langDisplayName(code) + ' offline voice removed');
  }
  renderLangList();
}
function renderLangList() {
  const list = $('#langList');
  if (!list) return;
  list.innerHTML = '';
  [['te', 'Telugu', 'Google Telugu voice — clear and natural'], ['hi', 'Hindi', 'Kokoro voice'], ['en', 'English', 'Kokoro voice']].forEach(([code, name, desc]) => {
    const status = langDlStatus(code);
    const row = el('div', 'lang-row');
    const info = el('div', 'lang-info');
    info.appendChild(el('div', 'lang-name', name));
    info.appendChild(el('div', 'lang-desc', desc));
    info.appendChild(el('div', 'lang-status', status === 'downloaded' ? '✓ Downloaded for offline' : 'Not downloaded'));
    row.appendChild(info);
    const btn = el('button', 'mini-btn', status === 'downloaded' ? 'Remove' : '⬇ Download');
    btn.onclick = () => { if (status === 'downloaded') removeLanguage(code); else downloadLanguage(code); };
    row.appendChild(btn);
    list.appendChild(row);
  });
}

/* ---------------- rendering ---------------- */
function renderChapter() {
  const content = $('#pageContent');
  content.innerHTML = '';
  content.classList.remove('two-col');
  const ch = state.chapters[state.currentChapter];
  const firstIsTitle = state.paragraphs.length && ['h1','h2','h3'].indexOf(state.paragraphs[0].kind) >= 0 && state.paragraphs[0].text.replace(/\s+/g, ' ').trim() === (ch ? ch.title : '').replace(/\s+/g, ' ').trim();
  if (!firstIsTitle) {
    const h = el('h1', null, ch ? ch.title : '');
    content.appendChild(h);
  }
  state.paragraphs.forEach((p, pi) => {
    if (p.kind === 'img') {
      const fig = el('div');
      if (p.blobUrl && p.blobUrl.indexOf('blob:') === 0) {
        const img = el('img'); img.src = p.blobUrl; img.alt = p.alt || 'Figure'; fig.appendChild(img);
      } else {
        fig.appendChild(el('div', 'img-note', '[image]'));
      }
      content.appendChild(fig);
      return;
    }
    const tag = (p.kind === 'h1' || p.kind === 'h2' || p.kind === 'h3') ? p.kind : (p.kind === 'blockquote' ? 'blockquote' : (p.kind === 'li' ? 'li' : 'p'));
    const node = el(tag, null, null);
    node.innerHTML = esc(p.text);
    node.dataset.para = pi;
    content.appendChild(node);
  });
  invalidatePageTotal();
  paginate();
  updatePageFooter();
  scheduleSettle();
  content.querySelectorAll('img').forEach(img => {
    if (!img.complete) img.addEventListener('load', scheduleSettle, { once: true });
  });
  updateChapterList();
}
function paraElements() { return Array.from($('#pageContent').children).filter(n => n.dataset && n.dataset.para != null); }
function paginate() {
  const content = $('#pageContent');
  state.pages = [];
  state.totalPages = 0;
  invalidatePageTotal();
  if (settings.direction !== 'horizontal') { state.totalPages = 1; return; }
  const area = $('#flipWrap');
  const pageH = Math.max(200, area.clientHeight - 8);
  const nodes = paraElements();
  let pages = [], cur = [], acc = 0;
  const h1 = content.querySelector('h1');
  if (h1) acc += h1.offsetHeight + 10;
  nodes.forEach(n => {
    const h = n.offsetHeight || 40;
    if (acc + h > pageH && cur.length) { pages.push(cur); cur = []; acc = 0; }
    cur.push(n); acc += h;
  });
  if (cur.length) pages.push(cur);
  state.pages = pages;
  state.totalPages = Math.max(1, pages.length);
  showPage(0, true);
}
/* v3 — a REAL page turn. The old page becomes a leaf that lifts off the
   spine, curls over (with a moving shade, like paper bending) and settles,
   revealing the new page underneath. Not a slide, not a fade. */
function showPage(idx, instant) {
  const content = $('#pageContent');
  if (settings.direction !== 'horizontal' || !state.pages.length) { content.style.display = ''; state.currentPage = 0; updatePageFooter(); return; }
  idx = clamp(idx, 0, state.pages.length - 1);
  const doShow = () => {
    state.currentPage = idx;
    content.innerHTML = '';
    if (idx === 0) {
      const ch = state.chapters[state.currentChapter];
      content.appendChild(el('h1', null, ch ? ch.title : ''));
    }
    state.pages[idx].forEach(n => content.appendChild(n));
    content.scrollTop = 0;
    updatePageFooter();
  };
  if (instant || idx === state.currentPage) { doShow(); return; }
  const dir = idx > state.currentPage ? 1 : -1;
  const wrap = $('#flipWrap');
  // the turning leaf: a clone of the page as it looks right now
  const leaf = el('div', 'turn-leaf' + (dir > 0 ? ' fwd' : ' back'));
  const front = el('div', 'leaf-face leaf-front');
  const clone = content.cloneNode(true);
  clone.removeAttribute('id');
  front.appendChild(clone);
  front.appendChild(el('div', 'leaf-shade'));
  const back = el('div', 'leaf-face leaf-back');
  leaf.appendChild(front);
  leaf.appendChild(back);
  wrap.appendChild(leaf);
  // keep the clone scrolled to the same spot as the real page
  try { clone.scrollTop = content.scrollTop; } catch (e) {}
  // swap the real content underneath (hidden by the leaf until it turns)
  doShow();
  requestAnimationFrame(() => {
    leaf.classList.add('turning');
    leaf.addEventListener('animationend', () => leaf.remove(), { once: true });
    setTimeout(() => leaf.remove(), 750);
  });
}
function pageForSentence(si) {
  if (settings.direction !== 'horizontal' || !state.pages.length) return 0;
  const s = state.sentences[si];
  if (!s) return 0;
  for (let i = 0; i < state.pages.length; i++) {
    if (state.pages[i].some(n => Number(n.dataset.para) === s.paraIdx)) return i;
  }
  return 0;
}
function updatePageFooter() {
  const total = cachedPageTotal();
  const cur = settings.direction === 'horizontal' ? (state.currentPage + 1) : currentScrollPage();
  $('#pageNum').textContent = 'Page ' + cur + ' of ' + total;
  const ch = state.chapters[state.currentChapter];
  $('#chapterPos').textContent = ch ? ('Chapter ' + (state.currentChapter + 1) + ' of ' + state.chapters.length) : '';
}
function pageTotalKey() {
  return [state.currentChapter, settings.direction, window.innerWidth, window.innerHeight, settings.fontSize, settings.lineSpacing, settings.font].join('|');
}
function cachedPageTotal() {
  if (!state.pageTotal || state.pageTotalKey !== pageTotalKey()) {
    state.pageTotal = Math.max(1, settings.direction === 'horizontal' ? (state.totalPages || 1) : estimatePages());
    state.pageTotalKey = pageTotalKey();
  }
  return state.pageTotal;
}
function invalidatePageTotal() { state.pageTotal = 0; state.pageTotalKey = ''; }
let settleTimer = null;
function scheduleSettle() {
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settlePageTotal, 250);
}
function settlePageTotal() {
  const content = $('#pageContent');
  if (!content || !state.meta) return;
  const frac = (content.scrollHeight > content.clientHeight) ? content.scrollTop / (content.scrollHeight - content.clientHeight) : 0;
  invalidatePageTotal();
  cachedPageTotal();
  if (settings.direction === 'vertical' && content.scrollHeight > content.clientHeight) {
    content.scrollTop = frac * (content.scrollHeight - content.clientHeight);
  }
  updatePageFooter();
}
function estimatePages() {
  const content = $('#pageContent');
  if (!content || !content.scrollHeight) return 1;
  return Math.max(1, Math.ceil(content.scrollHeight / Math.max(1, content.clientHeight)));
}
function currentScrollPage() {
  const content = $('#pageContent');
  if (!content || !content.clientHeight) return 1;
  const total = cachedPageTotal();
  if (content.scrollTop + content.clientHeight >= content.scrollHeight - 2) return total;
  return clamp(Math.floor(content.scrollTop / content.clientHeight) + 1, 1, total);
}
function updateChapterList() {
  const ul = $('#chapterList');
  if (!ul || !state.chapters.length) return;
  ul.innerHTML = '';
  state.chapters.forEach((ch, i) => {
    const li = el('li');
    if (state.completedChapters[i]) li.appendChild(el('span', 'done', '✓ '));
    const nm = el('span', 'ch-name', ch.title);
    li.appendChild(nm);
    if (i === state.currentChapter) li.classList.add('active');
    li.onclick = () => { stopNarration(false); loadChapter(i); closeDrawer(); };
    ul.appendChild(li);
  });
  renderBookmarks(); renderHighlights();
}
function updateCacheInfo() {
  const n = $('#cacheInfo');
  if (!n) return;
  n.textContent = state.cacheCount + ' of ' + state.chapters.length + ' chapters saved for offline';
}

/* ---------------- sentence display: WHOLE-WORD spans only (v3) ---------------- */
/* v3 — the achulu/hallulu bug. v2.1 split every word into per-LETTER spans
   (.l) for the bounce, which breaks Telugu complex-script shaping: a
   conjunct (e.g. క్ష) or a vowel sign detaches from its base letter and the
   letter renders as a bare vowel or a broken form. The static text looked
   fine because only the speaking sentence got the letter spans — that is
   why the error was intermittent. Fix: each word is ONE intact text node
   inside its .w span. The bounce animates the whole word. */
function buildSentenceSpans() {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  const nodes = paraElements();
  const node = nodes.find(n => Number(n.dataset.para) === s.paraIdx);
  if (!node) return;
  const para = state.paragraphs[s.paraIdx];
  if (!para) return;
  const ptext = para.text;
  const start = ptext.indexOf(s.text);
  if (start < 0) return;
  const before = ptext.slice(0, start), after = ptext.slice(start + s.text.length);
  const frag = document.createDocumentFragment();
  if (before) frag.appendChild(document.createTextNode(before));
  const sent = el('span', 'sentence speaking');
  s.text.split(/(\s+)/).forEach(part => {
    if (!part) return;
    if (/^\s+$/.test(part)) { sent.appendChild(document.createTextNode(part)); return; }
    const w = el('span', 'w');
    w.textContent = part;   // whole word, intact — never split into letters
    sent.appendChild(w);
  });
  frag.appendChild(sent);
  if (after) frag.appendChild(document.createTextNode(after));
  node.innerHTML = '';
  node.appendChild(frag);
  node.dataset.built = state.sentenceIndex;
}
function clearSentenceSpans() {
  paraElements().forEach(n => {
    const sp = n.querySelector('.sentence');
    if (sp) {
      const p = state.paragraphs[Number(n.dataset.para)];
      n.textContent = p ? p.text : n.textContent;
      delete n.dataset.built;
    }
  });
}
function scrollToSentence() {
  const s = state.sentences[state.sentenceIndex];
  if (!s) return;
  if (settings.direction === 'horizontal') {
    const pg = pageForSentence(state.sentenceIndex);
    if (pg !== state.currentPage) showPage(pg);
  }
  const node = paraElements().find(n => Number(n.dataset.para) === s.paraIdx);
  if (node && settings.direction === 'vertical') node.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

/* ---------------- narration engine (v3) ---------------- */
function currentMoodRule() {
  const s = state.sentences[state.sentenceIndex];
  const moodName = s ? s.mood : state.mood;
  return MOODS[moodName] || MOODS.neutral;
}
function effectiveRate() {
  const genreBase = (GENRES[settings.genre] || GENRES.thriller).base;
  return clamp(state.speed * currentMoodRule().speed * genreBase, 0.4, 2.5);
}
function pauseAfterSentence() {
  const s = state.sentences[state.sentenceIndex];
  const rule = currentMoodRule();
  let ms = rule.pause;
  if (s && s.reveal) ms = Math.max(ms, rule.reveal);
  if (s && /\.\.\.|…/.test(s.text)) ms += 400;
  return ms;
}
function narrAlive(myNarr) { return state.playing && myNarr === NEURAL.narrationToken; }
async function speakCurrent() {
  if (!state.playing) return;
  const myNarr = NEURAL.narrationToken;
  const s = state.sentences[state.sentenceIndex];
  if (!s) { advanceChapterOrStop(); return; }
  if (s.image) { state.sentenceIndex++; setTimeout(() => speakCurrent(), 150); return; }
  const lang = state.meta ? state.meta.language : 'en';
  buildSentenceSpans();
  scrollToSentence();
  setMood(s.mood);
  updateAudioBar();
  const rate = effectiveRate();
  prefetchFrom(state.sentenceIndex + 1);
  const key = prefetchKey(state.currentChapter, state.sentenceIndex);
  let res = null;
  try {
    const cached = NEURAL.prefetch.get(key);
    if (cached) {
      try { res = await withTimeout(Promise.resolve(cached), SYNTH_TIMEOUT_MS, 'prefetched sentence'); }
      finally { if (NEURAL.prefetch.get(key) === cached) NEURAL.prefetch.delete(key); }
    } else {
      res = await synthesizeNeural(s.text, lang, { rate, cancelled: () => !narrAlive(myNarr) });
    }
  } catch (err) {
    if (!narrAlive(myNarr)) return;
    if (err && err.voiceLoadFailed) {
      console.warn('Neural voice failed to load:', err);
      state.speaking = false;
      stopNarration(true);
      toast('Voice needs one download — connect to the internet once, then it works offline.');
      return;
    }
    console.warn('Skipping unspeakable sentence', state.sentenceIndex, err);
    NEURAL.consecFail = (NEURAL.consecFail || 0) + 1;
    if (NEURAL.consecFail >= MAX_CONSEC_FAIL) {
      stopNarration(true);
      toast('Voice stopped — the voice could not speak these lines. Try again.');
      return;
    }
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    speakCurrent();
    return;
  }
  NEURAL.consecFail = 0;
  if (!narrAlive(myNarr)) return;
  if (res.empty) {
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    speakCurrent();
    return;
  }
  const playDur = res.duration || 0;
  if (playDur > 0.3) state.avgSentenceSec = state.avgSentenceSec * 0.7 + playDur * 0.3;
  updateAudioBar();
  state.speaking = true;
  let ok = false;
  try {
    ok = await playClip(res, lang, { rate, text: s.text });
  } catch (err) {
    state.speaking = false;
    if (!narrAlive(myNarr)) return;
    clearSentenceSpans();
    state.sentenceIndex++;
    savePosition();
    if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
    speakCurrent();
    return;
  }
  state.speaking = false;
  if (!narrAlive(myNarr)) return;
  if (!ok) return;
  const pause = pauseAfterSentence();
  clearSentenceSpans();
  state.sentenceIndex++;
  savePosition();
  if (state.sentenceIndex >= state.sentences.length) { advanceChapterOrStop(); return; }
  pauseTimer = setTimeout(() => { buildSentenceSpans(); scrollToSentence(); speakCurrent(); }, pause);
}
/* Play/Pause are synchronous and instant — they never await a download or a
   synthesis. Pause stops the audio at once and cancels pending work. */
function playNarration() {
  if (!state.meta || !state.sentences.length) return;
  if (state.playing) { pauseNarration(); return; }
  NEURAL.narrationToken++;
  NEURAL.consecFail = 0;
  state.playing = true;
  $('#btnPlay').textContent = '⏸';
  $('#btnPlayBelow').textContent = '⏸ Pause';
  startSleepTimer();
  speakCurrent();
}
function pauseNarration() {
  state.playing = false;
  clearTimeout(pauseTimer);
  stopNeural();
  state.speaking = false;
  $('#btnPlay').textContent = '▶';
  $('#btnPlayBelow').textContent = '▶ Read aloud';
  savePosition();
  updateAudioBar();
}
function stopNarration(resetBtn) {
  state.playing = false;
  clearTimeout(pauseTimer);
  stopNeural();
  state.speaking = false;
  clearSentenceSpans();
  if (resetBtn !== false) { $('#btnPlay').textContent = '▶'; $('#btnPlayBelow').textContent = '▶ Read aloud'; }
  savePosition();
}
async function advanceChapterOrStop() {
  markChapterComplete(state.currentChapter);
  const next = nextNarratableChapter(state.currentChapter + 1);
  if (next == null) {
    stopNarration(true);
    toast('Finished the book');
    return;
  }
  await loadChapter(next);
  state.sentenceIndex = 0;
  savePosition();
  if (state.playing) speakCurrent();
}
function nextNarratableChapter(from) {
  for (let i = from; i < state.chapters.length; i++) {
    if (state.chapters[i].kind === 'toc' || state.chapters[i].kind === 'front') continue;
    return i;
  }
  return null;
}
function markChapterComplete(i) {
  state.completedChapters[i] = true;
  try { localStorage.setItem('epubreader.done.' + state.meta.id, JSON.stringify(state.completedChapters)); } catch (e) {}
  updateChapterList(); renderLibrary();
}
function skipSeconds(sec) {
  const n = Math.max(1, Math.round(Math.abs(sec) / Math.max(2, state.avgSentenceSec)));
  const dir = sec < 0 ? -1 : 1;
  state.sentenceIndex = clamp(state.sentenceIndex + dir * n, 0, Math.max(0, state.sentences.length - 1));
  clearSentenceSpans();
  if (state.playing) { stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
  else { buildSentenceSpans(); scrollToSentence(); }
  savePosition();
}
function nextSentence() {
  if (state.sentenceIndex < state.sentences.length - 1) {
    clearSentenceSpans(); state.sentenceIndex++;
    if (state.playing) { stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
    else { buildSentenceSpans(); scrollToSentence(); }
  } else advanceChapterOrStop();
  savePosition();
}
function prevSentence() {
  clearSentenceSpans();
  state.sentenceIndex = Math.max(0, state.sentenceIndex - 1);
  if (state.playing) { stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
  else { buildSentenceSpans(); scrollToSentence(); }
  savePosition();
}
function startSleepTimer() {
  clearTimeout(state.sleepTimerId);
  const mins = settings.sleepDefault || 0;
  if (!mins) return;
  state.sleepEndsAt = Date.now() + mins * 60000;
  state.sleepTimerId = setTimeout(() => { pauseNarration(); toast('Sleep timer stopped playback'); }, mins * 60000);
}
function updateHeader() {
  if (!state.meta) return;
  const t = $('#hdrTitle'), a = $('#hdrAuthor');
  if (t) t.textContent = state.meta.title || '—';
  if (a) a.textContent = state.meta.author || '';
}
function updateAudioBar() {
  updateHeader();
  const info = $('#abInfo');
  if (!info || !state.meta) return;
  if (NEURAL.status) { info.textContent = NEURAL.status; return; }
  const ch = state.chapters[state.currentChapter];
  const total = state.sentences.length || 1;
  const pct = Math.round((state.sentenceIndex / total) * 100);
  $('#abProgressFill').style.width = pct + '%';
  const remaining = Math.max(0, Math.round(((total - state.sentenceIndex) * state.avgSentenceSec) / 5) * 5);
  info.textContent = (ch ? ch.title : '') + ' · ' + state.sentenceIndex + '/' + total + ' · ' + fmtTime(remaining) + ' left in chapter';
}
function timeRemainingBook() {
  let secs = 0;
  for (let i = state.currentChapter; i < state.chapters.length; i++) {
    secs += 0;
  }
  return secs;
}
async function playFromStart() {
  if (!state.meta) return;
  const m = state.meta;
  const openLines = [];
  if (m.title) openLines.push({ text: m.title, paraIdx: -1, mood: 'neutral' });
  if (m.subtitle) openLines.push({ text: m.subtitle, paraIdx: -1, mood: 'neutral' });
  if (m.author) openLines.push({ text: 'by ' + m.author, paraIdx: -1, mood: 'neutral' });
  const introIdx = state.chapters.findIndex(c => c.kind === 'intro');
  const firstIdx = nextNarratableChapter(0);
  const target = introIdx >= 0 ? introIdx : (firstIdx != null ? firstIdx : 0);
  await loadChapter(target);
  state.sentences = openLines.concat(state.sentences);
  state.sentenceIndex = 0;
  state.playing = true;
  $('#btnPlay').textContent = '⏸';
  startSleepTimer();
  speakCurrent();
}
async function startPreload() {
  if (!state.meta || state.preloadBusy) return;
  state.preloadBusy = true;
  try {
    let next = state.currentChapter + 1;
    const done = await idbCountChapters(state.meta.id).catch(() => 0);
    state.cacheCount = done;
    updateCacheInfo();
    while (next < state.chapters.length) {
      const cached = await idbGet('chapters', state.meta.id + '::' + next).catch(() => null);
      if (!cached) await loadChapterText(next).catch(() => null);
      state.cacheCount = await idbCountChapters(state.meta.id).catch(() => state.cacheCount + 1);
      updateCacheInfo();
      next++;
      await sleep(30);
      if (!state.meta) break;
    }
  } finally { state.preloadBusy = false; }
}

/* ---------------- bookmarks ---------------- */
function addBookmark(auto) {
  if (!state.meta) return;
  const s = state.sentences[state.sentenceIndex];
  const bm = { chapter: state.currentChapter, sentence: state.sentenceIndex, text: s ? s.text.slice(0, 90) : '', at: Date.now(), auto: !!auto };
  if (auto) {
    state.autoBookmark = bm;
    try { localStorage.setItem('epubreader.auto.' + state.meta.id, JSON.stringify(bm)); } catch (e) {}
    return;
  }
  const dup = state.bookmarks.findIndex(b => !b.auto && b.chapter === bm.chapter && b.sentence === bm.sentence);
  if (dup >= 0) {
    state.bookmarks.splice(dup, 1);
    try { localStorage.setItem('epubreader.bm.' + state.meta.id, JSON.stringify(state.bookmarks)); } catch (e) {}
    renderBookmarks();
    toast('Bookmark removed');
    return;
  }
  state.bookmarks.unshift(bm);
  state.bookmarks = state.bookmarks.slice(0, 50);
  try { localStorage.setItem('epubreader.bm.' + state.meta.id, JSON.stringify(state.bookmarks)); } catch (e) {}
  renderBookmarks();
  toast('Bookmark added');
}
function renderBookmarks() {
  const ul = $('#bookmarkList');
  if (!ul) return;
  ul.innerHTML = '';
  state.bookmarks.forEach((b, i) => {
    const li = el('li', null, '🔖 ' + (state.chapters[b.chapter] ? state.chapters[b.chapter].title : '') + ' — ' + b.text);
    li.onclick = () => { loadChapter(b.chapter).then(() => { state.pendingSentence = b.sentence; state.sentenceIndex = b.sentence; buildSentenceSpans(); scrollToSentence(); }); closeDrawer(); };
    const del = el('button', 'mini-btn', '✕');
    del.onclick = ev => { ev.stopPropagation(); state.bookmarks.splice(i, 1); try { localStorage.setItem('epubreader.bm.' + state.meta.id, JSON.stringify(state.bookmarks)); } catch (e) {} renderBookmarks(); };
    li.appendChild(del);
    ul.appendChild(li);
  });
}
window.addEventListener('beforeunload', () => { if (state.meta) { addBookmark(true); savePosition(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden && state.meta) { addBookmark(true); savePosition(); } });

/* ---------------- highlights + notes ---------------- */
function addHighlight(text, note) {
  if (!state.meta || !text) return;
  state.highlights.unshift({ chapter: state.currentChapter, sentence: state.sentenceIndex, text: text.slice(0, 400), note: note || '', at: Date.now() });
  state.highlights = state.highlights.slice(0, 200);
  try { localStorage.setItem('epubreader.hl.' + state.meta.id, JSON.stringify(state.highlights)); } catch (e) {}
  renderHighlights();
  toast('Highlighted');
}
function renderHighlights() {
  const ul = $('#highlightList');
  if (!ul) return;
  ul.innerHTML = '';
  state.highlights.forEach(h => {
    const li = el('li', null, '✎ ' + h.text.slice(0, 80) + (h.note ? ' — ' + h.note : ''));
    li.onclick = () => { loadChapter(h.chapter).then(() => { state.pendingSentence = h.sentence; state.sentenceIndex = h.sentence; buildSentenceSpans(); scrollToSentence(); }); closeDrawer(); };
    ul.appendChild(li);
  });
}
function exportHighlights() {
  if (!state.meta) return;
  let out = (state.meta.title || 'Book') + ' — Highlights\n\n';
  state.highlights.forEach(h => { out += '• ' + h.text + (h.note ? '\n  Note: ' + h.note : '') + '\n\n'; });
  downloadText(out, (state.meta.title || 'book').replace(/[^\w\-]+/g, '_') + '-highlights.txt');
}
function downloadText(text, name) {
  const blob = new Blob([text], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------------- mini dictionary (built-in, offline) ---------------- */
const MINI_DICT = {
  the: 'used to point to a specific person or thing', a: 'one; any', an: 'one; any', and: 'joining word', of: 'belonging to', to: 'towards', in: 'inside', is: 'exists; equals', it: 'that thing', you: 'the person spoken to', that: 'the one over there', he: 'a man or boy', she: 'a woman or girl', was: 'past of is', for: 'meant for', on: 'on top of', are: 'plural of is', with: 'together with', his: 'belonging to him', they: 'more than one person', i: 'myself', at: 'in a place', be: 'to exist', this: 'the one here', have: 'to own', from: 'starting at', or: 'either one', one: 'a single thing', had: 'past of have', by: 'near; through', word: 'a unit of language', but: 'however', not: 'no', what: 'which thing', all: 'everything', were: 'past of are', we: 'you and I', when: 'at what time', your: 'belonging to you', can: 'to be able to', said: 'spoke', there: 'in that place', use: 'to make use of', an: 'one', each: 'every one', which: 'what one', she: 'a woman', do: 'to perform', how: 'in what way', their: 'belonging to them', if: 'on condition that', will: 'going to', up: 'towards the top', other: 'different', about: 'concerning', out: 'outside', many: 'a large number', then: 'after that', them: 'those people', these: 'the ones here', so: 'therefore', some: 'a few', her: 'belonging to her', would: 'past of will', make: 'to create', like: 'similar to; to enjoy', him: 'that man', into: 'inside', time: 'the passing of hours', has: 'owns', look: 'to see', two: 'the number 2', more: 'a greater amount', write: 'to put words on paper', go: 'to move', see: 'to notice with the eyes', number: 'a count', no: 'not any', way: 'a path; a manner', could: 'was able to', people: 'human beings', my: 'belonging to me', than: 'compared with', first: 'before all others', water: 'the liquid we drink', been: 'past of be', call: 'to shout; to name', who: 'which person', oil: 'a slippery liquid', its: 'belonging to it', now: 'at this moment', find: 'to discover', long: 'not short', down: 'towards the ground', day: '24 hours', did: 'past of do', get: 'to obtain', come: 'to arrive', made: 'past of make', may: 'possibly', part: 'a piece of something', love: 'a deep feeling of care', life: 'being alive', night: 'the dark part of the day', story: 'a tale of events', book: 'a set of written pages', read: 'to look at words and understand them', listen: 'to hear with attention', voice: 'the sound a person makes when speaking', chapter: 'a part of a book', page: 'one side of a sheet in a book', friend: 'a person you like and trust', home: 'the place where you live', heart: 'the organ that pumps blood; the centre of feelings', light: 'brightness; not heavy', dark: 'without light', world: 'the earth and everything on it', hand: 'the part at the end of your arm', eye: 'the organ you see with', mind: 'the part of you that thinks', dream: 'images in sleep; a hope', truth: 'what is real and true', secret: 'something hidden', fear: 'being afraid', hope: 'wanting something to happen', smile: 'a happy face expression', tear: 'a drop from the eye when sad', memory: 'something remembered', voice: 'sound of speaking', message: 'words sent to someone', phone: 'a device for calling and messaging', midnight: '12 o’clock at night', sister: 'a female sibling', brother: 'a male sibling', mother: 'a female parent', father: 'a male parent', village: 'a small place where people live', river: 'a large stream of water', rain: 'water falling from the sky', fire: 'burning flames', wind: 'moving air', sky: 'the space above the earth', star: 'a bright point of light at night', moon: 'the bright object in the night sky', sun: 'the star that gives us daylight', road: 'a way for vehicles and people', door: 'an entrance', window: 'an opening to see outside', room: 'a part of a house', house: 'a building where people live', school: 'a place for learning', teacher: 'a person who teaches', student: 'a person who learns', question: 'something asked', answer: 'a reply', work: 'a job; effort', money: 'coins and notes used to buy things', morning: 'the early part of the day', evening: 'the late part of the day', today: 'this day', tomorrow: 'the next day', yesterday: 'the day before today'
};
function defineWord(word) {
  const w = (word || '').toLowerCase().replace(/[^a-z\u0c00-\u0c7f\u0900-\u097f]/g, '');
  if (!w) return null;
  return MINI_DICT[w] || null;
}

/* ---------------- themes / fonts / direction ---------------- */
function applyTheme() {
  document.body.dataset.theme = settings.theme;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', settings.theme === 'dark' ? '#141414' : settings.theme === 'white' ? '#ffffff' : '#f6efdd');
  const sel = $('#setTheme'); if (sel) sel.value = settings.theme;
}
function applyFont() {
  document.body.classList.remove('font-serif', 'font-sans', 'font-telugu');
  document.body.classList.add('font-' + (settings.font || 'serif'));
  const fs = [15, 17, 18, 20, 22][clamp(settings.fontSize - 1, 0, 4)];
  const lh = [1.5, 1.7, 1.9][clamp(settings.lineSpacing - 1, 0, 2)];
  document.documentElement.style.setProperty('--fs', fs + 'px');
  document.documentElement.style.setProperty('--lh', lh);
  document.body.classList.toggle('large-text', !!settings.largeText);
  document.body.classList.toggle('high-contrast', !!settings.highContrast);
  const fsz = $('#setFontSize'); if (fsz) fsz.value = settings.fontSize;
  const ls = $('#setLineSpacing'); if (ls) ls.value = settings.lineSpacing;
  const f = $('#setFont'); if (f) f.value = settings.font;
}
function cycleTheme() {
  const order = ['book', 'white', 'dark'];
  settings.theme = order[(order.indexOf(settings.theme) + 1) % order.length];
  saveSettings(); savePerBookSettings(); applyTheme();
  toast('Theme: ' + settings.theme);
}
function setDirection(dir) {
  settings.direction = dir === 'horizontal' ? 'horizontal' : 'vertical';
  saveSettings(); savePerBookSettings();
  const d = $('#setDirection'); if (d) d.value = settings.direction;
  renderChapter();
  toast(dir === 'horizontal' ? 'Horizontal page flip' : 'Vertical scroll');
}

/* ---------------- screens ---------------- */
function showScreen(name) {
  $('#home').classList.toggle('hidden', name !== 'home');
  $('#reader').classList.toggle('hidden', name !== 'reader');
  if (name === 'home') { renderLibrary(); renderContinueCard(); }
}
function openReader() {
  showScreen('reader');
  document.body.classList.remove('focus-mode');
}
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerScrim').classList.add('hidden'); }
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerScrim').classList.remove('hidden'); }

/* ---------------- library UI ---------------- */
function renderLibrary() {
  const list = $('#recentList');
  if (!list) return;
  list.innerHTML = '';
  if (!library.length) { list.appendChild(el('div', 'empty-note', t('noBooksYet'))); return; }
  library.forEach(b => {
    const card = el('button', 'book-card');
    if (b.coverUrl) { const img = el('img', 'book-cover'); img.src = b.coverUrl; img.alt = ''; card.appendChild(img); }
    else card.appendChild(el('div', 'book-cover-ph', '📖'));
    const meta = el('div', 'book-meta');
    meta.appendChild(el('div', 'book-title', b.title));
    meta.appendChild(el('div', 'book-author', b.author || ''));
    const prog = b.chapters ? Math.round((b.progress || 0)) + '% · ' + (b.language || '').toUpperCase() : '';
    meta.appendChild(el('div', 'book-prog', prog));
    card.appendChild(meta);
    card.onclick = () => reopenBook(b.id);
    list.appendChild(card);
  });
}
function renderContinueCard() {
  const card = $('#continueCard');
  if (!card) return;
  const last = library[0];
  if (!last || (last.lastChapter == null && last.lastSentence == null)) { card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  $('#continueTitle').textContent = last.title + ' — ' + (last.author || '');
  $('#continuePos').textContent = 'Chapter ' + ((last.lastChapter || 0) + 1) + ' of ' + (last.chapters || '?') + ' · ' + (last.progress || 0) + '%';
  const recapEl = $('#continueRecap');
  try {
    const pos = JSON.parse(localStorage.getItem('epubreader.pos.' + last.id) || 'null');
    const auto = JSON.parse(localStorage.getItem('epubreader.auto.' + last.id) || 'null');
    if (auto && auto.text) { recapEl.textContent = 'Last time you stopped here: "' + auto.text + '"'; recapEl.classList.remove('hidden'); }
    else recapEl.classList.add('hidden');
  } catch (e) { recapEl.classList.add('hidden'); }
  $('#btnContinue').onclick = () => reopenBook(last.id);
}
async function reopenBook(id) {
  const rec = await idbGet('books', id).catch(() => null);
  if (!rec || !rec.data) { toast('Book file is no longer stored — please open it again'); return; }
  const entry = library.find(b => b.id === id);
  showLoad('Opening book…', 20);
  const token = ++loadToken;
  try {
    if (rec.type === 'pdf') await openPdf(rec.data, entry ? entry.title + '.pdf' : 'book.pdf');
    else await openEpub(rec.data, entry ? entry.title + '.epub' : 'book.epub');
    if (token !== loadToken) return;
    const pos = loadPosition();
    if (pos) {
      await loadChapter(pos.chapter || 0);
      state.pendingSentence = pos.sentence || 0;
      state.sentenceIndex = clamp(pos.sentence || 0, 0, Math.max(0, state.sentences.length - 1));
      buildSentenceSpans(); scrollToSentence();
    } else {
      await loadChapter(nextNarratableChapter(0) || 0);
    }
    if (token !== loadToken) return;
    hideLoad();
    openReader();
    startPreload();
    updateAudioBar();
    prepareVoiceForBook();   // v3: auto-download the book's language
  } catch (e) { if (token === loadToken) showLoadError('Could not reopen book: ' + e.message); }
}

/* ---------------- loading overlay (v3): never hangs, always a way out ---------------- */
let loadToken = 0;
let lastFile = null;
function showLoad(msg, pct) {
  const ov = $('#loadOverlay'); if (!ov) return;
  ov.classList.remove('hidden');
  $('#loadMsg').textContent = msg || 'Loading…';
  $('#loadFill').style.width = (pct || 0) + '%';
  $('#btnLoadRetry').classList.add('hidden');
}
function setLoadProgress(pct, msg) {
  const ov = $('#loadOverlay'); if (!ov || ov.classList.contains('hidden')) return;
  if (msg) $('#loadMsg').textContent = msg;
  $('#loadFill').style.width = (pct || 0) + '%';
}
function showLoadError(msg) {
  const ov = $('#loadOverlay'); if (!ov) return;
  ov.classList.remove('hidden');
  $('#loadMsg').textContent = msg;
  $('#loadFill').style.width = '100%';
  $('#btnLoadRetry').classList.remove('hidden');
  toast(msg);
}
function hideLoad() {
  const ov = $('#loadOverlay'); if (ov) ov.classList.add('hidden');
}
/* ---------------- open book flow ---------------- */
async function handleFile(file) {
  if (!file) return;
  lastFile = file;
  const name = file.name || 'book';
  const isPdf = /\.pdf$/i.test(name) || file.type === 'application/pdf';
  const isEpub = /\.epub$/i.test(name) || file.type === 'application/epub+zip';
  if (!isPdf && !isEpub) { toast('Please pick an EPUB or PDF file'); return; }
  const token = ++loadToken;
  showLoad('Opening ' + (isPdf ? 'PDF' : 'book') + '…', 5);
  // a stalled load fails CLEANLY after 30s with a retry — it never hangs
  const loadTimer = setTimeout(() => {
    if (token === loadToken) showLoadError('Opening is taking too long — your connection may be slow. Try again.');
  }, 30000);
  try {
    const buf = await file.arrayBuffer();
    if (token !== loadToken) { clearTimeout(loadTimer); return; }
    setLoadProgress(30, 'Reading the file…');
    await sleep(0); // yield so the progress bar actually paints
    let meta;
    if (isPdf) meta = await openPdf(buf, name);
    else meta = await openEpub(buf, name);
    if (token !== loadToken) { clearTimeout(loadTimer); return; }
    setLoadProgress(70, 'Building chapters…');
    idbPut('books', { id: meta.id, type: isPdf ? 'pdf' : 'epub', data: buf, title: meta.title }).catch(() => {});
    try { localStorage.removeItem('epubreader.pos.' + meta.id); } catch (e) {}
    try { localStorage.removeItem('epubreader.auto.' + meta.id); } catch (e) {}
    await loadChapter(nextNarratableChapter(0) || 0);
    if (token !== loadToken) { clearTimeout(loadTimer); return; }
    setLoadProgress(100, 'Ready');
    clearTimeout(loadTimer);
    hideLoad();
    openReader();
    startPreload();
    updateAudioBar();
    prepareVoiceForBook();   // v3: the book's language downloads NOW, top bar
    if (isPdf) {
      toast('PDF converted — starting read-aloud');
      setTimeout(() => playFromStart(), 600);
    }
  } catch (e) {
    clearTimeout(loadTimer);
    if (token !== loadToken) return;
    console.error(e);
    showLoadError('Could not open this file: ' + (e.message || e));
  }
}

/* ---------------- search in book ---------------- */
async function searchBook(q) {
  const res = $('#searchResults');
  res.innerHTML = '';
  q = (q || '').trim();
  if (q.length < 2) return;
  const hits = [];
  for (let i = 0; i < state.chapters.length && hits.length < 20; i++) {
    const rec = await loadChapterText(i).catch(() => null);
    if (!rec) continue;
    rec.paras.forEach((p, pi) => {
      if (p.text && p.text.toLowerCase().indexOf(q.toLowerCase()) >= 0 && hits.length < 20) {
        hits.push({ ch: i, text: p.text });
      }
    });
  }
  if (!hits.length) { res.appendChild(el('div', null, 'No matches')); return; }
  hits.forEach(h => {
    const d = el('div', null, (state.chapters[h.ch] ? state.chapters[h.ch].title : '') + ' — ' + h.text.slice(0, 80));
    d.onclick = () => { loadChapter(h.ch); closeDrawer(); };
    res.appendChild(d);
  });
}

/* ---------------- selection menu (define / hear / highlight / copy) ---------------- */
let selText = '';
document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  const menu = $('#selectionMenu');
  if (!sel || sel.isCollapsed || !sel.toString().trim()) { menu.classList.add('hidden'); return; }
  const range = sel.getRangeAt(0);
  const area = $('#pageContent');
  if (!area.contains(range.commonAncestorContainer)) { menu.classList.add('hidden'); return; }
  selText = sel.toString().trim();
  const r = range.getBoundingClientRect();
  menu.style.left = clamp(r.left, 8, window.innerWidth - 260) + 'px';
  menu.style.top = clamp(r.top - 48, 8, window.innerHeight - 60) + 'px';
  menu.classList.remove('hidden');
});
$('#selectionMenu') && $('#selectionMenu').addEventListener('click', ev => {
  const act = ev.target.dataset && ev.target.dataset.act;
  if (!act || !selText) return;
  const popup = $('#definePopup');
  if (act === 'copy') { navigator.clipboard && navigator.clipboard.writeText(selText).catch(() => {}); toast('Copied'); }
  if (act === 'hear') {
    const lang = state.meta ? state.meta.language : 'en';
    pauseNarration();
    speakNeural(selText, lang, { rate: 1 }).catch(() => toast('Voice needs one download — connect to the internet once, then it works offline.'));
  }
  if (act === 'highlight') {
    const note = prompt('Add a note (optional):', '') || '';
    addHighlight(selText, note);
  }
  if (act === 'define') {
    const def = defineWord(selText);
    popup.innerHTML = '<h4>' + esc(selText) + '</h4>' +
      (def ? '<p>' + esc(def) + '</p>' : '<p>Not in the offline dictionary. <a href="https://www.google.com/search?q=define+' + encodeURIComponent(selText) + '" target="_blank" rel="noopener">Search online</a> (needs internet).</p>');
    popup.classList.remove('hidden');
    const r = $('#selectionMenu').getBoundingClientRect();
    popup.style.left = clamp(r.left, 8, window.innerWidth - 340) + 'px';
    popup.style.top = clamp(r.bottom + 8, 8, window.innerHeight - 160) + 'px';
    setTimeout(() => popup.classList.add('hidden'), 9000);
  }
  $('#selectionMenu').classList.add('hidden');
  window.getSelection().removeAllRanges();
});

/* ---------------- tap-to-hear: tap a WORD to hear it, tap a paragraph to narrate from there ---------------- */
$('#pageContent').addEventListener('click', ev => {
  const wEl = ev.target.closest('.w');
  if (wEl && wEl.textContent) {
    const lang = state.meta ? state.meta.language : 'en';
    pauseNarration();
    speakNeural(wEl.textContent, lang, { rate: 1 }).catch(() => {});
    return;
  }
  const sEl = ev.target.closest('.sentence');
  if (sEl) return;
  const p = ev.target.closest('[data-para]');
  if (!p) return;
  const pi = Number(p.dataset.para);
  const idx = state.sentences.findIndex(s => s.paraIdx === pi);
  if (idx < 0) return;
  clearSentenceSpans();
  state.sentenceIndex = idx;
  if (!state.playing) playNarration();
  else { stopNeural(); state.speaking = false; clearTimeout(pauseTimer); buildSentenceSpans(); scrollToSentence(); speakCurrent(); }
});

/* ---------------- backup / restore / storage / voices ---------------- */
function backupLibrary() {
  const data = { app: 'offline-epub-reader', version: 3, at: new Date().toISOString(), settings, library, positions: {}, bookmarks: {}, highlights: {} };
  library.forEach(b => {
    try { data.positions[b.id] = JSON.parse(localStorage.getItem('epubreader.pos.' + b.id) || 'null'); } catch (e) {}
    try { data.bookmarks[b.id] = JSON.parse(localStorage.getItem('epubreader.bm.' + b.id) || '[]'); } catch (e) {}
    try { data.highlights[b.id] = JSON.parse(localStorage.getItem('epubreader.hl.' + b.id) || '[]'); } catch (e) {}
  });
  downloadText(JSON.stringify(data, null, 2), 'epub-reader-backup.json');
  toast('Backup downloaded (book files are not included — re-open books after restore)');
}
async function restoreLibrary(file) {
  try {
    const data = JSON.parse(await file.text());
    if (data.settings) { settings = Object.assign({}, defaults, data.settings); saveSettings(); applyTheme(); applyFont(); applyI18n(); }
    if (Array.isArray(data.library)) {
      data.library.forEach(b => {
        if (!library.find(x => x.id === b.id)) library.push(b);
        if (data.positions && data.positions[b.id]) localStorage.setItem('epubreader.pos.' + b.id, JSON.stringify(data.positions[b.id]));
        if (data.bookmarks && data.bookmarks[b.id]) localStorage.setItem('epubreader.bm.' + b.id, JSON.stringify(data.bookmarks[b.id]));
        if (data.highlights && data.highlights[b.id]) localStorage.setItem('epubreader.hl.' + b.id, JSON.stringify(data.highlights[b.id]));
      });
      saveLibrary(); renderLibrary(); renderContinueCard();
    }
    toast('Library restored — re-open each book file once to listen again');
  } catch (e) { toast('Restore failed: ' + e.message); }
}
async function renderStoragePanel() {
  const p = $('#storagePanel');
  const est = await (navigator.storage && navigator.storage.estimate ? navigator.storage.estimate() : Promise.resolve({})).catch(() => ({}));
  const books = await idbAll('books').catch(() => []);
  let html = '<h3>Storage</h3>';
  html += '<p>Used: ' + ((est.usage || 0) / 1048576).toFixed(1) + ' MB of ' + ((est.quota || 0) / 1073741824).toFixed(1) + ' GB available.</p>';
  if (!books.length) html += '<p>No books cached yet.</p>';
  books.forEach(b => {
    html += '<div class="row"><span>' + esc(b.title || b.id) + ' — ' + ((b.data ? b.data.byteLength : 0) / 1048576).toFixed(1) + ' MB</span><button class="mini-btn" data-del="' + esc(b.id) + '">Delete</button></div>';
  });
  p.innerHTML = html;
  p.classList.remove('hidden');
  p.querySelectorAll('[data-del]').forEach(btn => {
    btn.onclick = async () => {
      const id = btn.dataset.del;
      await idbDelete('books', id).catch(() => {});
      const chs = await idbAll('chapters').catch(() => []);
      for (const c of chs.filter(c => c.key.indexOf(id + '::') === 0)) await idbDelete('chapters', c.key).catch(() => {});
      await idbClearAudioForBook(id).catch(() => {});
      library = library.filter(b => b.id !== id); saveLibrary();
      renderLibrary(); renderContinueCard(); renderStoragePanel();
      toast('Book removed from storage');
    };
  });
}
function updateVoicePanel() {
  const p = $('#voicePanel');
  if (!p) return;
  const status = NEURAL.status ? '<p class="voice-status">' + esc(NEURAL.status) + '</p>' : '';
  const cur = state.meta ? langDisplayName(langCode(state.meta.language)) : null;
  p.innerHTML = '<h3>Voices in this browser</h3>' +
    (cur ? '<p><b>This book (' + esc(cur) + '):</b> ' + (langCode(state.meta.language) === 'te' ? 'Google Telugu voice — clear and natural' : 'Kokoro — ' + esc(neuralVoiceFor(state.meta.language))) + '</p>' : '') +
    '<p><b>English:</b> Kokoro — af_bella (natural, expressive)</p>' +
    '<p><b>Hindi:</b> Kokoro — hf_alpha</p>' +
    '<p><b>Telugu:</b> Google Telugu voice — clear and natural. No device voice or install is needed.</p>' +
    '<p>Each voice downloads when you open a book in that language, then works offline. Nothing is installed on your device.</p>' +
    status;
}

/* ---------------- mood menu ---------------- */
function openMoodMenu() {
  const m = $('#moodMenu');
  m.innerHTML = '';
  Object.keys(MOODS).forEach(name => {
    if (name === 'dialogue') return;
    const b = el('button', null, MOODS[name].label + (state.chapters[state.currentChapter] && state.chapters[state.currentChapter].mood === name ? ' ✓' : ''));
    b.onclick = () => {
      if (state.chapters[state.currentChapter]) state.chapters[state.currentChapter].mood = name;
      setMood(name, true);
      m.classList.add('hidden');
      const si = state.sentenceIndex;
      state.sentences = parasToSentences(state.paragraphs, name);
      state.sentenceIndex = clamp(si, 0, Math.max(0, state.sentences.length - 1));
    };
    m.appendChild(b);
  });
  const off = el('button', null, settings.moodFollow ? 'Turn mood-following off' : 'Turn mood-following on');
  off.onclick = () => { settings.moodFollow = !settings.moodFollow; saveSettings(); setMood(state.mood); m.classList.add('hidden'); };
  m.appendChild(off);
  m.classList.remove('hidden');
}

/* ---------------- wiring ---------------- */
function wire() {
  $('#btnOpenBook').onclick = () => $('#fileInput').click();
  $('#fileInput').addEventListener('change', ev => { handleFile(ev.target.files[0]); ev.target.value = ''; });
  $('#restoreInput').addEventListener('change', ev => { if (ev.target.files[0]) restoreLibrary(ev.target.files[0]); ev.target.value = ''; });
  $('#btnBack').onclick = () => { stopNarration(false); showScreen('home'); };
  $('#btnPlay').onclick = playNarration;
  $('#btnPlayBelow').onclick = playNarration;
  $('#btnPrev').onclick = prevSentence;
  $('#btnNext').onclick = nextSentence;
  $('#btnBack15').onclick = () => skipSeconds(-15);
  $('#btnFwd15').onclick = () => skipSeconds(15);
  $('#btnBookmark').onclick = () => addBookmark(false);
  $('#btnSleep').onclick = () => $('#sleepMenu').classList.toggle('hidden');
  $('#btnChapters').onclick = openDrawer;
  $('#btnDrawerClose').onclick = closeDrawer;
  $('#drawerScrim').onclick = closeDrawer;
  $('#btnTheme').onclick = cycleTheme;
  $('#btnFocus').onclick = () => document.body.classList.toggle('focus-mode');
  $('#btnReaderSettings').onclick = () => $('#settingsSheet').classList.remove('hidden');
  $('#btnHomeSettings').onclick = () => $('#settingsSheet').classList.remove('hidden');
  $('#btnSettingsClose').onclick = () => $('#settingsSheet').classList.add('hidden');
  $('#settingsSheet').addEventListener('click', ev => { if (ev.target.id === 'settingsSheet') ev.target.classList.add('hidden'); });
  $('#btnMoodMenu').onclick = openMoodMenu;
  $('#btnExportHighlights').onclick = exportHighlights;
  $('#btnBackup').onclick = backupLibrary;
  $('#btnRestore').onclick = () => $('#restoreInput').click();
  $('#btnStorage').onclick = () => { const p = $('#storagePanel'); p.classList.contains('hidden') ? renderStoragePanel() : p.classList.add('hidden'); };
  $('#btnVoiceSetup').onclick = () => { updateVoicePanel(); $('#voiceSheet').classList.remove('hidden'); };
  $('#btnVoiceClose').onclick = () => $('#voiceSheet').classList.add('hidden');
  $('#voiceSheet').addEventListener('click', ev => { if (ev.target.id === 'voiceSheet') ev.target.classList.add('hidden'); });
  $('#btnLanguages').onclick = () => { renderLangList(); $('#langSheet').classList.remove('hidden'); };
  $('#btnLangClose').onclick = () => $('#langSheet').classList.add('hidden');
  $('#langSheet').addEventListener('click', ev => { if (ev.target.id === 'langSheet') ev.target.classList.add('hidden'); });
  $('#btnLoadRetry').onclick = () => { if (lastFile) { hideLoad(); handleFile(lastFile); } else hideLoad(); };
  $('#btnLoadCancel').onclick = () => { loadToken++; hideLoad(); };
  $('#speedSel').addEventListener('change', ev => { state.speed = parseFloat(ev.target.value) || 1; savePerBookSettings(); });
  $('#sleepMenu').addEventListener('click', ev => {
    const min = ev.target.dataset && ev.target.dataset.min;
    if (min == null) return;
    settings.sleepDefault = parseInt(min, 10) || 0; saveSettings();
    $('#sleepMenu').classList.add('hidden');
    toast(min === '0' ? 'Sleep timer off' : 'Sleep timer: ' + min + ' min');
    if (state.playing) startSleepTimer();
  });
  $('#searchInput').addEventListener('input', ev => searchBook(ev.target.value));
  $('#btnGotoPage').onclick = () => {
    const n = parseInt($('#gotoPageInput').value, 10);
    if (!n || n < 1) return;
    const total = cachedPageTotal();
    const page = clamp(n, 1, total);
    if (settings.direction === 'horizontal') showPage(page - 1);
    else {
      const c = $('#pageContent');
      const maxTop = Math.max(0, c.scrollHeight - c.clientHeight);
      c.scrollTo({ top: Math.min((page - 1) * c.clientHeight, maxTop), behavior: 'smooth' });
      setTimeout(updatePageFooter, 350);
    }
    updatePageFooter();
  };
  let footerRaf = null;
  $('#pageContent').addEventListener('scroll', () => {
    if (footerRaf) return;
    footerRaf = requestAnimationFrame(() => { footerRaf = null; updatePageFooter(); });
  }, { passive: true });
  // v3: no native selection menu while reading — long-press/drag on the text
  // must not pop the OS Translate/Copy menu. Tap-to-hear still works.
  $('#pageContent').addEventListener('contextmenu', ev => ev.preventDefault());
  document.addEventListener('contextmenu', ev => {
    if (ev.target && ev.target.closest && ev.target.closest('#pageContent')) ev.preventDefault();
  });
  $('#setTheme').addEventListener('change', ev => { settings.theme = ev.target.value; saveSettings(); savePerBookSettings(); applyTheme(); });
  $('#setDirection').addEventListener('change', ev => setDirection(ev.target.value));
  $('#setFont').addEventListener('change', ev => { settings.font = ev.target.value; saveSettings(); savePerBookSettings(); applyFont(); });
  $('#setFontSize').addEventListener('input', ev => { settings.fontSize = parseInt(ev.target.value, 10); saveSettings(); applyFont(); paginate(); });
  $('#setLineSpacing').addEventListener('input', ev => { settings.lineSpacing = parseInt(ev.target.value, 10); saveSettings(); applyFont(); paginate(); });
  $('#setGenre').addEventListener('change', ev => { settings.genre = ev.target.value; saveSettings(); if (state.meta) { const m = moodOfChapter(state.chapters[state.currentChapter]); setMood(m); } });
  $('#setMoodFollow').addEventListener('change', ev => { settings.moodFollow = ev.target.checked; saveSettings(); setMood(state.mood); });
  $('#setSleepDefault').addEventListener('change', ev => { settings.sleepDefault = parseInt(ev.target.value, 10) || 0; saveSettings(); });
  $('#setLargeText').addEventListener('change', ev => { settings.largeText = ev.target.checked; saveSettings(); applyFont(); });
  $('#setHighContrast').addEventListener('change', ev => { settings.highContrast = ev.target.checked; saveSettings(); applyFont(); });
  document.addEventListener('keydown', ev => {
    if ($('#reader').classList.contains('hidden')) return;
    if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target.tagName === 'TEXTAREA') return;
    if (ev.code === 'Space') { ev.preventDefault(); playNarration(); }
    else if (ev.key === 'ArrowRight') nextSentence();
    else if (ev.key === 'ArrowLeft') prevSentence();
    else if (ev.key === 'b' || ev.key === 'B') addBookmark(false);
    else if (ev.key === 'm' || ev.key === 'M') openMoodMenu();
  });
  let touchX = null;
  $('#flipWrap').addEventListener('touchstart', ev => { touchX = ev.touches[0].clientX; }, { passive: true });
  $('#flipWrap').addEventListener('touchend', ev => {
    if (touchX == null || settings.direction !== 'horizontal') return;
    const dx = ev.changedTouches[0].clientX - touchX;
    if (dx < -50) showPage(state.currentPage + 1);
    else if (dx > 50) showPage(state.currentPage - 1);
    touchX = null;
  }, { passive: true });
  window.addEventListener('resize', () => { if (state.meta && settings.direction === 'horizontal') paginate(); if (state.meta) scheduleSettle(); });
}

/* ---------------- service worker (offline Google audio cache) ---------------- */
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  } catch (e) {}
}

/* ---------------- init ---------------- */
function init() {
  // v3: app UI language follows the BROWSER (no picker, no list)
  settings.uiLang = browserUiLang();
  applyI18n();
  applyTheme();
  applyFont();
  const st = $('#setTheme'); if (st) st.value = settings.theme;
  const sd = $('#setDirection'); if (sd) sd.value = settings.direction;
  const sg = $('#setGenre'); if (sg) sg.value = settings.genre;
  const ss = $('#setSleepDefault'); if (ss) ss.value = String(settings.sleepDefault || 0);
  const sm = $('#setMoodFollow'); if (sm) sm.checked = !!settings.moodFollow;
  const sl = $('#setLargeText'); if (sl) sl.checked = !!settings.largeText;
  const sh = $('#setHighContrast'); if (sh) sh.checked = !!settings.highContrast;
  const ver = $('#appVersion'); if (ver) ver.textContent = 'Version 3.0.0';
  setMood('neutral');
  wire();
  renderLibrary();
  renderContinueCard();
  showScreen('home');
  registerServiceWorker();
  window.__reader = {
    state, settings,
    openEpub, openPdf, handleFile, loadChapter, playNarration, pauseNarration,
    showPage, nextSentence, prevSentence, buildSentenceSpans,
    version: '3.0.0'
  };
}
document.addEventListener('DOMContentLoaded', init);
if (document.readyState !== 'loading') init();
