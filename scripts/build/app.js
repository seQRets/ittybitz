/* ── IttyBitz single-file UI ──────────────────────────────────────────────
   All presentation and wiring. The cryptography lives in the DOM-free
   ittybitz-crypto-core block above; this layer only reads files, calls it,
   and renders results. Assembled into site/index.html by
   scripts/build-app.mjs; edit this file, not the built page.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  // ---- Anti-framing guard ----
  // IttyBitz is meant to be opened directly, never embedded in another page.
  // A <meta> CSP cannot set frame-ancestors, so the check is enforced here: if
  // we are inside a frame — cross-origin access to window.top throws, which we
  // treat as framed — refuse to initialize and say so, so a hostile wrapper
  // can never present the app while intercepting input.
  var framed;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (framed) {
    try {
      document.body.innerHTML =
        '<div style="max-width:30rem;margin:14vh auto 0;padding:0 1.5rem;text-align:center;' +
        'color:#f4f4f5;font:16px/1.6 system-ui,-apple-system,sans-serif">' +
        '<h1 style="font-size:1.4rem;font-weight:600;margin:0 0 .75rem">IttyBitz won’t run inside a frame</h1>' +
        '<p style="color:#a1a1aa;margin:0">For your security it refuses to run embedded in another page. ' +
        'Open it directly — go to <strong>ittybitz.app</strong>, or open your saved copy of the file.</p></div>';
    } catch (e) { /* ignore */ }
    return;
  }

  var $ = function (id) { return document.getElementById(id); };

  // ---- Migrate installed-PWA users to the downloadable file ----
  // Opening the retired installed app puts the page in standalone display mode.
  // Nudge those users once toward saving the single file for offline use. The
  // migration service worker (public /sw.js) handles the offline case; this is
  // the gentle online prompt. Non-standalone (normal browser) visitors never
  // see it.
  (function () {
    var standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    if (!standalone) return;
    try { if (localStorage.getItem('ib-pwa-notice') === '1') return; } catch (e) {}
    var n = document.getElementById('pwa-notice');
    if (!n) return;
    n.classList.add('show');
    var x = document.getElementById('pwa-x');
    if (x) x.onclick = function () {
      n.classList.remove('show');
      try { localStorage.setItem('ib-pwa-notice', '1'); } catch (e) {}
    };
  })();

  // ---- Download banners: What's new in 3.1, then the offline tip ----
  // Both suggest a download, so closing either one closes both for good: the
  // choice is kept in this browser's storage and only clearing the site's data
  // brings them back. What's new tells everyone, once, that the key derivation
  // changed and that new files need the 3.1 Recovery tool or later; while it
  // is up, the offline tip waits, so the page never stacks two banners.
  function dismissDownloadBanners() {
    ['whatsnew', 'offline-tip'].forEach(function (id) {
      var b = document.getElementById(id);
      if (b) b.classList.remove('show');
    });
    try {
      localStorage.setItem('ib-whatsnew-3.1', '1');
      localStorage.setItem('ib-offline-tip', '1');
    } catch (e) {}
  }

  var whatsNewShown = (function () {
    try { if (localStorage.getItem('ib-whatsnew-3.1') === '1') return false; } catch (e) {}
    var n = document.getElementById('whatsnew');
    if (!n) return false;
    n.classList.add('show');
    var x = document.getElementById('whatsnew-x');
    if (x) x.onclick = dismissDownloadBanners;
    return true;
  })();

  // ---- Offline option for hosted web visitors ----
  // Let people running the hosted page know they can download IttyBitz and run
  // it from their own disk. Hidden when already running from a local file
  // (file://) — they've clearly done it — and when running as the installed
  // PWA (which shows its own migration banner instead).
  (function () {
    var isFile = location.protocol === 'file:';
    var standalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    if (isFile || standalone || whatsNewShown) return;
    // Either key counts: someone who closed What's new before this rule
    // existed has only that key and has already said no to downloads.
    try {
      if (localStorage.getItem('ib-offline-tip') === '1' ||
          localStorage.getItem('ib-whatsnew-3.1') === '1') return;
    } catch (e) {}
    var n = document.getElementById('offline-tip');
    if (!n) return;
    n.classList.add('show');
    var x = document.getElementById('offline-x');
    if (x) x.onclick = dismissDownloadBanners;
  })();

  // ---- Hero download button ----
  // Someone running IttyBitz from a downloaded file already has it.
  if (location.protocol === 'file:') {
    var heroDl = document.getElementById('hero-dl');
    if (heroDl) heroDl.style.display = 'none';
  }

  // ---- Web Crypto secure-context guard (same posture as the recovery file) ----
  if (!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues)) {
    document.querySelector('.card').innerHTML =
      '<div class="status err show">' +
      '<strong>This browser will not allow encryption from this page.</strong>\n\n' +
      'Web Crypto is unavailable because the page is not in a "secure context".\n' +
      'Open this file over https:// or http://localhost, or in Chrome, Firefox,\n' +
      'Edge or Safari. Source: https://github.com/seQRets/ittybitz</div>';
    return;
  }

  // ---- State ----
  var mode = 'encrypt';       // 'encrypt' | 'decrypt'
  var inputType = 'file';     // 'file' | 'text'
  var mainFiles = [], keyFile = null;  // the main zone takes several files; the key zone one
  var useKeyFile = false;
  var showTextSecret = false; // encrypt-side reveal toggle: the secret is blurred as soon as it has content
  var showDecrypted = false;  // decrypt-side reveal toggle
  var clipboardTimer = null;
  var seedTimer = null;
  var qrState = null;         // { getValue, numeric, kind }
  var qrRevealed = false;

  var MAX_FILE_SIZE = 100 * 1024 * 1024;
  var QR_MAX_BYTES = 2953; // version 40-L, byte mode
  var BAD_NAME = /[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/;
  var GEN_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
  var SYMBOL_RE = /[!@#$%^&*()_+~`|}{[\]:;?><,.\/=-]/;

  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var ICON_UNLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
  var ICON_SPIN = '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
  var ICON_EYE = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  var ICON_EYE_OFF = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

  // ---- Helpers ----
  function isPasswordStrong(pwd) {
    return pwd.length >= 24 && /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd) && SYMBOL_RE.test(pwd);
  }

  function generatePassword() {
    var len = 32, n = GEN_CHARSET.length;
    var limit = Math.floor(0x100000000 / n) * n; // reject modulo bias
    var pw = '';
    do {
      pw = '';
      while (pw.length < len) {
        var arr = new Uint32Array(len - pw.length);
        crypto.getRandomValues(arr);
        for (var i = 0; i < arr.length && pw.length < len; i++) {
          if (arr[i] < limit) pw += GEN_CHARSET.charAt(arr[i] % n);
        }
      }
    } while (!isPasswordStrong(pw));
    return pw;
  }

  function validName(name) {
    if (name.indexOf('..') >= 0 || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0) return false;
    if (name.length > 255) return false;
    return !BAD_NAME.test(name);
  }

  function readBytes(file) {
    return new Promise(function (resolve, reject) {
      if (!file) return resolve(null);
      var r = new FileReader();
      r.onload = function () { resolve(new Uint8Array(r.result)); };
      r.onerror = function () { reject(new Error('Could not read ' + file.name)); };
      r.readAsArrayBuffer(file);
    });
  }

  function b64ToBytes(s) {
    var bin = atob(String(s).replace(/\s+/g, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    var CHUNK = 0x8000, bin = '';
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function download(bytesOrBlob, filename) {
    var blob = bytesOrBlob instanceof Blob ? bytesOrBlob : new Blob([bytesOrBlob], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    // Revoke on a delay: Safari can cancel a download whose object URL is
    // revoked before the download has actually started.
    setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
  }

  // quiet: the message is for screen readers only (the role="status" box
  // still announces it, but it takes no room on screen). Used when the result
  // box's own buttons are highlighted instead.
  function status(cls, text, quiet) {
    var s = $('status');
    s.className = 'status show ' + cls + (quiet ? ' quiet' : '');
    s.textContent = text;
  }
  // Draw the eye to the result box's buttons (copy, QR, reveal): a green
  // outline that pulses twice and then stays until the result is cleared.
  function highlightResultActions() {
    var a = document.querySelector('#result .out-actions');
    a.classList.remove('attn');
    void a.offsetWidth; // restart the pulse for a new result
    a.classList.add('attn');
  }
  function clearStatus() { var s = $('status'); s.className = 'status'; s.textContent = ''; }

  // Clipboard auto-clear, without ever reading the clipboard. Reading would
  // need the clipboard-read permission, which browsers surface as a prompt a
  // minute after the copy, with no visible cause — alarming in a privacy tool.
  // Instead: if the page has stayed focused and nothing else was copied from
  // it since our write, the clipboard can only still hold what we put there,
  // so it is safe to overwrite. If either happened, leave it alone.
  var clipboardStale = false;
  window.addEventListener('blur', function () { clipboardStale = true; });
  document.addEventListener('copy', function () { clipboardStale = true; });
  document.addEventListener('cut', function () { clipboardStale = true; });
  // Confirmation is on the button itself: a green check (plus "Copied" on a
  // labelled button) for a moment. The 60-second auto-clear is documented in
  // the README rather than spelled out here every time.
  var ICON_CHECK = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
  function flashCopied(btn) {
    if (!btn) return;
    if (btn._copiedTimer) clearTimeout(btn._copiedTimer);
    else btn._copiedHtml = btn.innerHTML;
    btn.innerHTML = btn.classList.contains('icon') ? ICON_CHECK : ICON_CHECK + 'Copied';
    btn.classList.add('copied');
    btn._copiedTimer = setTimeout(function () {
      btn.innerHTML = btn._copiedHtml; btn.classList.remove('copied');
      btn._copiedTimer = null;
    }, 1500);
  }
  function copyText(text, btn) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      clipboardStale = false;
      flashCopied(btn);
      status('ok', 'Copied to clipboard.', true); // for screen readers
      if (clipboardTimer) clearTimeout(clipboardTimer);
      clipboardTimer = setTimeout(function () {
        clipboardTimer = null;
        if (clipboardStale) return; // you may have copied something else — not ours to clear
        navigator.clipboard.writeText('').catch(function () {});
      }, 60000);
    }).catch(function () { status('err', 'Failed to copy to clipboard.'); });
  }

  // ---- QR rendering (vendored qrcode-generator → canvas) ----
  // The library's default string encoder keeps only the low byte of each
  // UTF-16 code unit, which silently corrupts anything outside Latin-1
  // (accents on many scanners, emoji, Cyrillic, CJK). Use its UTF-8 encoder so
  // a QR of decrypted text scans back to exactly what was decrypted.
  qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
  // Byte-mode capacity is measured in UTF-8 bytes, not JS string length.
  function fitsQR(text) { return new TextEncoder().encode(text).length <= QR_MAX_BYTES; }

  // numeric: true for digits (Standard SeedQR), 'bytes' for a Uint8Array put
  // in the QR as-is (Compact SeedQR), otherwise text (UTF-8).
  function drawQR(canvas, text, numeric, targetPx, margin) {
    margin = margin == null ? 4 : margin;
    var qr = qrcode(0, 'L');
    if (numeric === 'bytes') {
      // The library turns its input into bytes with qrcode.stringToBytes, at
      // addData time. Hand it these exact bytes for this one call; no text
      // encoding may touch them.
      var raw = Array.prototype.slice.call(text), keep = qrcode.stringToBytes;
      qrcode.stringToBytes = function () { return raw; };
      try { qr.addData('', 'Byte'); } finally { qrcode.stringToBytes = keep; }
      if (text.fill) text.fill(0); // the entropy is the seed: wipe the copy we were given
    } else if (numeric) qr.addData(text, 'Numeric');
    else qr.addData(text);
    qr.make();
    var count = qr.getModuleCount();
    var cell = Math.max(1, Math.floor(targetPx / (count + margin * 2)));
    var size = (count + margin * 2) * cell;
    canvas.width = size; canvas.height = size;
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#000';
    for (var r = 0; r < count; r++) {
      for (var c = 0; c < count; c++) {
        if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
      }
    }
  }

  // ---- Drop-zone wiring (mirrors the recovery file) ----
  function fmtSize(n) {
    return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
  }
  // A short, one-way fingerprint of a key file (first 8 hex of its SHA-256):
  // enough to recognise the right file months later, reveals nothing about it.
  async function keyFingerprint(bytes) {
    var h = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    var out = '';
    for (var i = 0; i < 4; i++) out += (h[i] < 16 ? '0' : '') + h[i].toString(16);
    return out;
  }

  // `multiple`: the zone accepts several files and hands onPick an array; a
  // single-file zone hands it one File (or null). Each file is validated on
  // its own; a bad one is named and skipped, the rest are kept.
  function wireDrop(zoneId, inputId, descId, clearId, onPick, multiple) {
    var zone = $(zoneId), input = $(inputId), desc = $(descId), clear = $(clearId);
    var defaultText = desc.textContent;
    var title = zoneId === 'drop-key' ? $('key-title') : null, defaultTitle = title && title.textContent;

    function pick(fileList) {
      var files = [];
      for (var i = 0; fileList && i < fileList.length; i++) {
        var f = fileList[i];
        if (!validName(f.name)) { status('err', 'The filename "' + f.name + '" contains characters that are not allowed; that file was skipped.'); continue; }
        if (f.size > MAX_FILE_SIZE) { status('err', '"' + f.name + '" is too large (maximum 100 MB); that file was skipped.'); continue; }
        if (zoneId === 'drop-key' && f.size === 0) { status('err', 'That key file is empty (0 bytes), so it would add nothing to the key. Choose another file, or turn "Use key file" off.'); continue; }
        files.push(f);
        if (!multiple) break;
      }
      if (!files.length) return;
      onPick(multiple ? files : files[0]);
      if (files.length === 1) desc.textContent = files[0].name;
      else {
        var total = 0; files.forEach(function (f) { total += f.size; });
        desc.textContent = files.length + ' files \u00b7 ' + fmtSize(total);
      }
      desc.className = 'picked';
      clear.style.display = '';
      // The key zone also shows the file's fingerprint, so the same file can be
      // recognised later (and a generated one matched to its file name). The
      // name takes the zone's first line and the fingerprint the second, so a
      // narrow screen never cuts the fingerprint off.
      if (title) {
        var name = files[0].name;
        title.textContent = name; desc.textContent = 'fingerprint \u2026';
        readBytes(files[0]).then(function (b) {
          // The bytes read for the fingerprint are key material too: wipe them
          // once hashed, whether or not hashing succeeded.
          return keyFingerprint(b).then(function (fp) { b.fill(0); return fp; },
                                        function (e) { b.fill(0); throw e; });
        }).then(function (fp) {
          if (title.textContent === name) desc.textContent = 'fingerprint [' + fp + ']';
        }).catch(function () { if (title.textContent === name) desc.textContent = 'key file selected'; });
      }
    }

    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { pick(input.files); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragging'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) pick(e.dataTransfer.files);
    });

    function resetZone() {
      onPick(multiple ? [] : null); input.value = '';
      desc.textContent = defaultText; desc.className = '';
      if (title) title.textContent = defaultTitle;
      clear.style.display = 'none';
    }
    clear.querySelector('button').addEventListener('click', function (e) { e.stopPropagation(); resetZone(); });
    return resetZone;
  }

  var clearMainZone = wireDrop('drop-main', 'f', 'main-desc', 'main-clear', function (fs) { mainFiles = fs; if (fs && fs.length) startNextJob(); }, true);
  var clearKeyZone = wireDrop('drop-key', 'k', 'key-desc', 'key-clear', function (f) { keyFile = f; }, false);

  // Swallow stray drops so the browser never navigates away and loses input.
  ['dragover', 'drop'].forEach(function (ev) { window.addEventListener(ev, function (e) { e.preventDefault(); }, false); });

  // ---- Reset ----
  function resetResult() {
    $('result').style.display = 'none';
    $('out').value = ''; $('out').classList.remove('blurred', 'ok-border', 'bad-border');
    $('out-qr').style.display = 'none';
    $('out-reveal').style.display = 'none';
    hideFp('dec');
    qrState = null;
    document.querySelector('#result .out-actions').classList.remove('attn');
    clearStatus();
  }

  // ---- Master-fingerprint display ----
  // Shown when a valid BIP-39 seed is detected: on the encrypt secret field,
  // on the decrypt result, and beside the SeedQR. The fingerprint is a public
  // identifier (a one-way hash), so it is safe to show even while the secret
  // stays blurred — it lets you confirm the right seed without exposing it.
  var encFpToken = 0; // guards the async encrypt-side fingerprint against races
  function hideFp(which) { var el = $(which + '-fp'); if (el) el.classList.remove('show'); }
  function showFp(which, fp) {
    var code = $(which + '-fp-code'); if (code) code.textContent = fp;
    var el = $(which + '-fp'); if (el) el.classList.add('show');
  }

  function fullReset() {
    jobDone = false;
    mainFiles = []; keyFile = null;
    clearMainZone(); clearKeyZone();
    $('p').value = '';
    $('t').value = '';
    showTextSecret = false; // a reveal never carries over to the next secret
    $('t').classList.remove('ok-border', 'bad-border');
    encFpToken++; hideFp('enc');
    refreshPasswordButtons();
    resetResult();
  }

  // ---- Mode + input-type + labels ----
  function applyModeLabels() {
    var enc = mode === 'encrypt';
    $('tab-enc').setAttribute('aria-selected', String(enc));
    $('tab-dec').setAttribute('aria-selected', String(!enc));
    $('pill-file').textContent = enc ? 'Encrypt a File' : 'Decrypt a File';
    $('pill-text').textContent = enc ? 'Encrypt Text' : 'Decrypt Text';
    $('text-label').textContent = enc ? 'Secret text' : 'Encrypted text';
    $('t').placeholder = enc ? 'Enter text to encrypt…' : 'Paste the Base64 output from IttyBitz…';
    $('p').placeholder = enc ? 'Enter a strong password' : 'Enter decryption password';
    $('pw-hint').style.display = enc ? '' : 'none';
    $('t-actions').style.display = enc ? '' : 'none';
    $('p-gen').style.display = enc ? '' : 'none';
    // Encrypting sets a new password (a manager may offer to generate or save
    // one); decrypting enters an existing one, where "new-password" would make
    // a manager offer to generate a fresh password that cannot decrypt.
    $('p').setAttribute('autocomplete', enc ? 'new-password' : 'off');
    clearTimeout(doneTimer); $('go').classList.remove('done');
    $('go-icon').innerHTML = enc ? ICON_LOCK : ICON_UNLOCK;
    $('go-label').textContent = enc ? 'Encrypt' : 'Decrypt';
    // Encrypt-side secret text is a human passphrase (sans font, blur toggle);
    // decrypt-side it holds base64, so switch to monospace.
    $('t').classList.toggle('mono', !enc);
    updateSecretToggle();
    updateTextBlur();
  }

  function setMode(m) {
    mode = m;
    fullReset();
    applyModeLabels();
  }

  function setInputType(t) {
    inputType = t;
    $('pill-file').setAttribute('aria-selected', String(t === 'file'));
    $('pill-text').setAttribute('aria-selected', String(t === 'text'));
    $('pane-file').style.display = t === 'file' ? '' : 'none';
    $('pane-text').style.display = t === 'text' ? '' : 'none';
    encFpToken++; hideFp('enc');
    resetResult();
  }

  $('tab-enc').onclick = function () { setMode('encrypt'); };
  $('tab-dec').onclick = function () { setMode('decrypt'); };
  $('pill-file').onclick = function () { setInputType('file'); };
  $('pill-text').onclick = function () { setInputType('text'); };

  // Tabs per WAI-ARIA, with MANUAL activation: Left/Right (and Home/End) only
  // move focus between tabs; Enter or Space (native button behaviour) or a
  // click activates. Switching mode clears the form, so activating on arrow
  // keys would wipe a half-typed secret on a single stray key press. The
  // selected tab keeps the one tab stop (tabindex 0); the others are reached
  // with the arrows.
  function wireTablist(ids) {
    function focusTab(i) {
      i = (i + ids.length) % ids.length;
      $(ids[i]).focus();
    }
    ids.forEach(function (id, i) {
      $(id).addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); focusTab(i + 1); }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); focusTab(i - 1); }
        else if (e.key === 'Home') { e.preventDefault(); focusTab(0); }
        else if (e.key === 'End') { e.preventDefault(); focusTab(ids.length - 1); }
      });
      // A click (or Enter/Space on a focused tab) also moves the tab stop.
      $(id).addEventListener('click', function () {
        ids.forEach(function (o, j) { $(o).setAttribute('tabindex', j === i ? '0' : '-1'); });
      });
    });
  }
  wireTablist(['tab-enc', 'tab-dec']);
  wireTablist(['pill-file', 'pill-text']);
  wireTablist(['qr-fmt-standard', 'qr-fmt-compact']);

  // ---- Text secret blur (encrypt) + BIP-39 border ----
  function updateTextBlur() {
    var t = $('t');
    if (mode === 'encrypt' && !showTextSecret && t.value) t.classList.add('blurred');
    else t.classList.remove('blurred');
  }
  // Action-based eye icon — it shows what a click WILL do:
  //   hidden/blurred -> a clear eye        (click to reveal)
  //   visible        -> an eye with a slash (click to hide)
  function setEyeIcon(btn, hidden, noun) {
    btn.innerHTML = hidden ? ICON_EYE : ICON_EYE_OFF;
    var lbl = (hidden ? 'Show ' : 'Hide ') + (noun || 'text');
    btn.setAttribute('title', lbl);
    btn.setAttribute('aria-label', lbl);
  }
  function updateSecretToggle() { setEyeIcon($('t-toggle'), !showTextSecret, 'secret text'); }
  $('t-toggle').onclick = function () {
    showTextSecret = !showTextSecret;
    updateSecretToggle();
    updateTextBlur();
  };
  $('t-copy').onclick = function () { copyText($('t').value, this); };

  $('t').addEventListener('input', function () {
    var val = $('t').value;
    if (val) startNextJob();
    // Every secret starts hidden: once the field is emptied, the next thing
    // typed or pasted is blurred again even if the last one was revealed.
    if (!val) { showTextSecret = false; updateSecretToggle(); }
    updateTextBlur();
    if (mode !== 'encrypt') return;
    if (seedTimer) clearTimeout(seedTimer);
    hideFp('enc');
    var token = ++encFpToken; // invalidate any in-flight fingerprint
    if (!val.trim()) { $('t').classList.remove('ok-border', 'bad-border'); return; }
    seedTimer = setTimeout(function () {
      ittybitzValidateBip39(val).then(function (res) {
        if (token !== encFpToken) return;
        $('t').classList.remove('ok-border', 'bad-border');
        if (res.valid) {
          $('t').classList.add('ok-border');
          masterFingerprint(res.words).then(function (fp) {
            if (token === encFpToken && fp) showFp('enc', fp);
          }).catch(function () {});
        } else if (res.seedShaped) {
          $('t').classList.add('bad-border');
        }
      }).catch(function () { $('t').classList.remove('ok-border', 'bad-border'); });
    }, 300);
  });

  // ---- Password field ----
  // Saving the password is asked for by the checkbox directly under the
  // field, which Encrypt requires; no separate notice repeats it.

  // "I have saved this password" is shown while encrypting, and greyed out
  // (disabled, but left in place so nothing on the page moves) once an
  // encryption has finished: the password has been wiped by then, so a live,
  // unticked box beside the result would only confuse. It comes back as soon
  // as the next job starts (a file chosen, a secret or password typed) and on
  // switching between Encrypt and Decrypt. The previous result, encrypted or
  // decrypted, goes at the same moment: it sits under the action button,
  // where it would read as the result of the new input.
  var jobDone = false;
  function showSavedAck() {
    $('pw-saved-row').style.display = mode === 'encrypt' ? '' : 'none';
    $('pw-saved-row').classList.toggle('spent', jobDone);
    $('pw-saved').disabled = jobDone;
  }
  // Encrypt stays disabled (greyed) until "I have saved this password" is
  // ticked; the box unticks whenever the password changes, so the button
  // follows. Decrypt is never held back by it. busy covers a running job.
  var busy = false;
  function updateGoButton() {
    var needsAck = mode === 'encrypt' && !$('pw-saved').checked;
    $('go').disabled = busy || needsAck;
    $('go').title = !busy && needsAck ? 'Tick "I have saved this password somewhere safe" first' : '';
  }
  $('pw-saved').addEventListener('change', updateGoButton);

  function startNextJob() {
    endDone();
    if (jobDone) { jobDone = false; showSavedAck(); resetResult(); }
  }

  // A file's result is a download, which the browser already shows, so the
  // app confirms it quietly: the button turns green with a check for a
  // moment. Screen readers still hear the full message.
  var doneTimer = 0;
  function flashDone() {
    clearTimeout(doneTimer);
    $('go').classList.add('done');
    $('go-icon').innerHTML = ICON_CHECK;
    $('go-label').textContent = mode === 'encrypt' ? 'Encrypted' : 'Decrypted';
    doneTimer = setTimeout(endDone, 1600);
  }
  function endDone() {
    clearTimeout(doneTimer);
    if (!$('go').classList.contains('done')) return;
    $('go').classList.remove('done');
    $('go-icon').innerHTML = mode === 'encrypt' ? ICON_LOCK : ICON_UNLOCK;
    $('go-label').textContent = mode === 'encrypt' ? 'Encrypt' : 'Decrypt';
  }

  function refreshPasswordButtons() {
    // The saved-password confirmation belongs to one password: any change to
    // the field (typing, Clear, Generate, the wipe after encrypting) unticks it.
    $('pw-saved').checked = false;
    updateGoButton();
    var pw = $('p').value;
    $('p-copy').disabled = !pw;
    $('p-clear').disabled = !pw;
    $('p').classList.remove('ok-border', 'bad-border');
    var strong = !!pw && mode === 'encrypt' && isPasswordStrong(pw);
    showSavedAck();
    if (pw && mode === 'encrypt') $('p').classList.add(strong ? 'ok-border' : 'bad-border');
  }
  $('p').addEventListener('input', function () { if ($('p').value) startNextJob(); refreshPasswordButtons(); });
  $('p-toggle').onclick = function () {
    var f = $('p');
    if (f.type === 'password') { f.type = 'text'; this.textContent = 'Hide'; }
    else { f.type = 'password'; this.textContent = 'Show'; }
  };
  $('p-copy').onclick = function () { copyText($('p').value, this); };
  $('p-clear').onclick = function () { $('p').value = ''; refreshPasswordButtons(); };
  $('p-gen').onclick = function () {
    $('p').value = generatePassword();
    startNextJob();
    refreshPasswordButtons();
    clearStatus(); // a stale "weak password" error no longer applies
  };

  // ---- Key file toggle ----
  $('kf-switch').onclick = function () {
    useKeyFile = !useKeyFile;
    this.setAttribute('aria-checked', String(useKeyFile));
    $('kf-pane').style.display = useKeyFile ? '' : 'none';
    if (!useKeyFile) { keyFile = null; clearKeyZone(); }
  };
  $('k-gen').onclick = async function () {
    var key = new Uint8Array(64);
    crypto.getRandomValues(key);
    var fp = await keyFingerprint(key);
    // The fingerprint goes in the file name, so the file can be matched to
    // the fingerprint shown when it is picked, and a second generated key
    // never lands as "ittybitz-key (1).bin" beside the first.
    var keyName = 'ittybitz-key-[' + fp + '].bin';
    download(key, keyName);
    key.fill(0); // the Blob made its own copy; this one is no longer needed
    // Said for screen readers only: the browser's own download already shows
    // the file, and its name carries the fingerprint.
    status('ok', 'Key file downloaded as "' + keyName + '". Select it to use it; you need both the key file and your password to decrypt.', true);
  };

  // ---- Output actions ----
  $('out-copy').onclick = function () { copyText($('out').value, this); };
  $('out-reveal').onclick = function () {
    showDecrypted = !showDecrypted;
    $('out').classList.toggle('blurred', !showDecrypted);
    setEyeIcon($('out-reveal'), !showDecrypted, 'result');
  };
  $('out-qr').onclick = function () {
    if (!qrState) return;
    try { openQr(); }
    catch (e) { closeQr(); status('err', 'This text is too long to fit in a QR code.'); }
  };

  // ---- QR overlay ----
  // Every QR opens blurred. Reveal is only for showing it on screen (to scan
  // it); Download PNG never needs it, because the file is drawn on a separate,
  // unseen canvas, so a seed can be saved without ever being displayed. Only
  // an encrypted-text QR can also be printed on the emergency card.
  // A seed's QR comes in two formats. Standard SeedQR (digits) is read by
  // more devices and can be checked by eye; Compact SeedQR (raw entropy
  // bytes) is a smaller code, for 12- and 24-word seeds only. Each time the
  // QR window opens it starts on Standard.
  function seedQrState(words, fp) {
    var st = {
      kind: 'seed', words: words, fp: fp, format: 'standard',
      compactOk: words.length === 12 || words.length === 24,
      getValue: function () { return st.format === 'compact' ? ittybitzToCompactSeedQR(words) : ittybitzToSeedQR(words); }
    };
    Object.defineProperty(st, 'numeric', { get: function () { return st.format === 'compact' ? 'bytes' : true; } });
    return st;
  }
  function setSeedFormat(fmt) {
    qrState.format = fmt;
    $('qr-fmt-standard').setAttribute('aria-selected', String(fmt === 'standard'));
    $('qr-fmt-compact').setAttribute('aria-selected', String(fmt === 'compact'));
    $('qr-fmt-standard').setAttribute('tabindex', fmt === 'standard' ? '0' : '-1');
    $('qr-fmt-compact').setAttribute('tabindex', fmt === 'compact' ? '0' : '-1');
    $('qr-title').textContent = fmt === 'compact' ? 'Compact SeedQR' : 'Standard SeedQR';
    $('qr-desc').textContent = fmt === 'compact'
      ? 'A smaller code. Not every wallet reads it.'
      : 'Your seed phrase, for hardware-wallet import.';
    drawQR($('qr-canvas'), qrState.getValue(), qrState.numeric, 512, 4); // the blur state is kept
  }
  $('qr-fmt-standard').onclick = function () { if (qrState && qrState.kind === 'seed') setSeedFormat('standard'); };
  $('qr-fmt-compact').onclick = function () { if (qrState && qrState.kind === 'seed' && qrState.compactOk) setSeedFormat('compact'); };

  function qrIsCiphertext() { return !!qrState && qrState.kind === 'plain' && mode === 'encrypt'; }
  function openQr() {
    qrRevealed = false;
    $('qr-box').classList.add('qr-blur');
    if (qrState.kind === 'seed') qrState.format = 'standard';
    $('qr-format').style.display = qrState.kind === 'seed' && qrState.compactOk ? '' : 'none';
    // Draw the QR right away but blurred, so it clearly reads as a QR — a blank
    // white box looks broken. The Reveal button below just removes the blur.
    drawQR($('qr-canvas'), qrState.getValue(), qrState.numeric, 512, 4);
    $('qr-reveal').lastChild.textContent = 'Reveal';
    if (qrState.kind === 'seed') {
      setSeedFormat('standard');
      $('qr-warn').textContent = 'Anyone who scans this QR can recover your seed.';
      if (qrState.fp) { $('qr-fp-code').textContent = qrState.fp; $('qr-fp').style.display = ''; }
      else { $('qr-fp').style.display = 'none'; }
    } else {
      $('qr-title').textContent = 'QR Code';
      $('qr-desc').textContent = mode === 'encrypt'
        ? 'Scan this code to transfer the encrypted text.'
        : 'Scannable QR of the decrypted text. Nothing ever leaves your device.';
      $('qr-warn').textContent = mode === 'encrypt'
        ? 'This QR contains your encrypted text.'
        : 'This QR contains your decrypted text. Show only on a trusted device and screen.';
      $('qr-fp').style.display = 'none';
    }
    // The card is for ENCRYPTED text only: a ciphertext is made to be kept on
    // paper, a decrypted text or a seed never is. The button simply does not
    // exist for those.
    $('qr-print').style.display = qrIsCiphertext() ? '' : 'none';
    $('qr-overlay').classList.add('show');
  }
  function closeQr() { $('qr-overlay').classList.remove('show'); }

  // ---- Emergency card ----
  // Fill the print-only card, print, then empty it again so the ciphertext
  // does not stay in the document (a copy saved later would carry it).
  function fillCard() {
    var text = qrState.getValue();
    // Pick a size tier by length; the stylesheet (#card[data-tier]) holds the
    // sizes. Typical texts print large; only long ones step down to stay on
    // one US Letter page.
    var n = text.length;
    $('card').setAttribute('data-tier', n <= 400 ? '0' : n <= 1000 ? '1' : n <= 1800 ? '2' : '3');
    drawQR($('card-canvas'), text, false, 1024, 2);
    $('card-text').textContent = text;
    $('card-when').textContent = 'Made ' + new Date().toISOString().slice(0, 10) + ' · ' + n + ' characters · IBTZ v2 · AES-256-GCM · Argon2id, 64 MiB';
    // Whether a key file is needed is a fact about THIS ciphertext, recorded
    // when it was encrypted — not whatever the key-file switch shows now. It is
    // named by fingerprint, never by file name: a finder of the card must not
    // learn which file to look for; the owner recognises the fingerprint,
    // which both IttyBitz and the recovery tool show when a key file is chosen.
    var fp = qrState.keyFp;
    // Say it either way: a card that is silent about the key file could send
    // someone searching for years for a file that was never used.
    $('card-kf').textContent = fp
      ? 'Enter the password and choose the key file. The right key file shows the fingerprint [' + fp + '] when selected.'
      : 'Enter the password. No key file is needed.';
    $('card-kept').textContent = fp ? 'Neither the password nor the key file is on this card.' : 'The password is not on this card.';
  }
  function clearCard() {
    $('card-text').textContent = ''; $('card-when').textContent = ''; $('card-kf').textContent = ''; $('card-kept').textContent = '';
    $('card').removeAttribute('data-tier');
    var c = $('card-canvas'); c.width = 1; c.height = 1;
    document.body.classList.remove('print-card');
    $('card-page').media = 'not all';
  }
  $('qr-print').onclick = function () {
    if (!qrIsCiphertext()) return;
    fillCard();
    $('card-page').media = 'print';
    document.body.classList.add('print-card');
    var done = function () { window.removeEventListener('afterprint', done); clearCard(); };
    window.addEventListener('afterprint', done);
    window.print();
    // Browsers that never fire afterprint (or a cancelled dialog in some) still
    // get the card cleared, a moment after the dialog has had its chance.
    setTimeout(done, 1500);
  };
  $('qr-close').onclick = closeQr;
  $('qr-overlay').addEventListener('click', function (e) { if (e.target === this) closeQr(); });
  $('qr-reveal').onclick = function () {
    // The QR is already drawn (blurred); reveal just toggles the blur.
    qrRevealed = !qrRevealed;
    $('qr-box').classList.toggle('qr-blur', !qrRevealed);
    this.lastChild.textContent = qrRevealed ? 'Hide' : 'Reveal';
  };
  $('qr-download').onclick = function () {
    if (!qrState) return;
    var off = document.createElement('canvas');
    drawQR(off, qrState.getValue(), qrState.numeric, 1024, 4);
    var url = off.toDataURL('image/png').replace('image/png', 'image/octet-stream');
    var a = document.createElement('a');
    a.href = url;
    a.download = qrState.kind !== 'seed' ? 'ittybitz-qr.png'
      : qrState.format === 'compact' ? 'ittybitz-compact-seedqr.png' : 'ittybitz-seedqr.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    status('ok', qrIsCiphertext()
      ? '1024×1024 PNG downloaded. It encodes your encrypted text; without the password it opens nothing.'
      : '1024×1024 PNG downloaded. It encodes your secret — store it as carefully as the secret itself.');
  };

  // ---- Donate ----
  $('donate-open').onclick = function () {
    drawQR($('donate-canvas'), 'https://coinos.io/seQRets/receive', false, 160, 2);
    $('donate-overlay').classList.add('show');
  };
  $('donate-close').onclick = function () { $('donate-overlay').classList.remove('show'); };
  $('donate-overlay').addEventListener('click', function (e) { if (e.target === this) $('donate-overlay').classList.remove('show'); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeQr(); $('donate-overlay').classList.remove('show'); }
  });

  // ---- The action ----
  $('go').onclick = async function () {
    var btn = this;
    endDone();
    clearStatus();

    var hasInput = inputType === 'file' ? mainFiles.length > 0 : !!$('t').value.trim();
    if (!hasInput) { status('err', inputType === 'file' ? 'Provide a file to process.' : 'Provide text to process.'); return; }
    var pw = $('p').value;
    if (!pw) { status('err', 'A password is required.'); return; }
    if (mode === 'encrypt' && !isPasswordStrong(pw)) {
      status('err', 'Weak password. Use at least 24 characters with uppercase, lowercase, numbers, and symbols.'); return;
    }
    if (useKeyFile && !keyFile) { status('err', '"Use key file" is on but no key file is selected. Choose one, or turn the option off.'); return; }
    if (useKeyFile && keyFile && keyFile.size === 0) { status('err', 'That key file is empty (0 bytes), so it would add nothing to the key. Choose another file, or turn "Use key file" off.'); return; }
    // The password is cleared the moment encryption runs, so make sure it has
    // been recorded first: otherwise the result is locked for good.
    if (mode === 'encrypt' && !$('pw-saved').checked) {
      startNextJob(); // never ask for a tick on a box that is greyed out
      status('err', 'Tick "I have saved this password" first. The password is cleared as soon as you encrypt, and nothing can recover it.');
      $('pw-saved').focus(); return;
    }

    busy = true; btn.disabled = true; btn.title = '';
    $('go-icon').innerHTML = ICON_SPIN;
    resetResult();
    var nFiles = inputType === 'file' ? mainFiles.length : 0;
    var what = inputType === 'text' ? 'secret' : nFiles > 1 ? 'files' : 'file';
    status('ok', (mode === 'encrypt' ? 'Securing your ' : 'Unlocking your ') + what + '…');

    var plain = null, kfBytes = null, ok = false;
    try {
      // Let the message paint before the key derivation keeps the page busy.
      await new Promise(function (r) { setTimeout(r, 30); });
      kfBytes = keyFile ? await readBytes(keyFile) : null;

      // Several files: each is processed on its own — its own salt, its own
      // key derivation, its own download — and a failure in one does not stop
      // the others. The summary names what succeeded and what did not.
      if (inputType === 'file' && nFiles > 1) {
        var done = [], failed = [];
        for (var fi = 0; fi < mainFiles.length; fi++) {
          var f = mainFiles[fi];
          status('ok', (mode === 'encrypt' ? 'Securing' : 'Unlocking') + ' file ' + (fi + 1) + ' of ' + nFiles + ': "' + f.name + '"…');
          try {
            var bytes = await readBytes(f);
            if (mode === 'encrypt') {
              download(await ittybitzEncrypt(bytes, pw, kfBytes), f.name + '.ibitz');
              done.push(f.name + '.ibitz');
            } else {
              var pt;
              try { pt = await ittybitzDecrypt(bytes, pw, kfBytes); }
              catch (e) { throw (e instanceof DOMException) ? new Error('wrong password or key file, or corrupted') : e; }
              var name = /\.ibitz$/i.test(f.name) ? f.name.replace(/\.ibitz$/i, '') : 'decrypted-' + f.name;
              download(pt, name || 'decrypted'); pt.fill(0);
              done.push(name || 'decrypted');
            }
          } catch (eOne) { failed.push(f.name + ' (' + (eOne && eOne.message ? eOne.message : String(eOne)) + ')'); }
        }
        mainFiles = []; clearMainZone();
        if (done.length) jobDone = true;
        ok = done.length > 0 && !failed.length;
        var verb = mode === 'encrypt' ? 'encrypted' : 'decrypted';
        var summary = done.length + ' of ' + nFiles + ' files ' + verb + (done.length ? ' — downloaded as: ' + done.join(', ') : '') + '.';
        if (failed.length) summary += '\nNot ' + verb + ': ' + failed.join('; ') + '.';
        if (done.length > 1) summary += '\nIf your browser asked whether to allow several downloads from this page, allow it; nothing is downloaded from anywhere else.';
        status(failed.length ? 'err' : 'ok', summary, !failed.length);
        return;
      }

      var mainFile = mainFiles[0] || null;
      if (mode === 'encrypt') {
        var inputBytes = inputType === 'file' ? await readBytes(mainFile) : new TextEncoder().encode($('t').value);
        var ct = await ittybitzEncrypt(inputBytes, pw, kfBytes);
        if (inputType === 'file') {
          var encName = mainFile.name + '.ibitz';
          download(ct, encName);
          mainFiles = []; clearMainZone();
          jobDone = ok = true;
          status('ok', 'File encrypted — downloaded as "' + encName + '".', true);
        } else {
          var b64 = bytesToB64(ct);
          showResult(b64, false);
          $('t').value = ''; $('t').classList.remove('ok-border', 'bad-border');
          encFpToken++; hideFp('enc'); // the secret is gone from the field; its fingerprint goes with it
          if (fitsQR(b64)) {
            var usedKeyFp = kfBytes ? await keyFingerprint(kfBytes) : null; // before kfBytes is wiped below
            qrState = { getValue: function () { return b64; }, numeric: false, kind: 'plain', keyFp: usedKeyFp };
            $('out-qr').style.display = '';
          }
          jobDone = ok = true;
          // Too long for a QR code: the QR button is hidden, so do not offer one.
          status('ok', fitsQR(b64) ? 'Text encrypted. Copy the Base64 result, or show it as a QR.'
                                   : 'Text encrypted. Copy the Base64 result.', true);
          highlightResultActions();
        }
      } else {
        var encBytes;
        if (inputType === 'file') encBytes = await readBytes(mainFile);
        else {
          try { encBytes = b64ToBytes($('t').value.trim()); }
          catch (e) { throw new Error('The encrypted text is not valid Base64.'); }
        }
        try {
          plain = await ittybitzDecrypt(encBytes, pw, kfBytes);
        } catch (e) {
          if (e instanceof DOMException) throw new Error('Decryption failed. The password or key file may be incorrect, or the data may be corrupted.');
          throw e;
        }
        if (inputType === 'file') {
          var outName = /\.ibitz$/i.test(mainFile.name) ? mainFile.name.replace(/\.ibitz$/i, '') : 'decrypted-' + mainFile.name;
          if (!outName) outName = 'decrypted';
          download(plain, outName);
          jobDone = ok = true;
          status('ok', 'Decrypted successfully — downloaded as "' + outName + '".', true);
        } else {
          // Decrypted bytes that are not UTF-8 are a file, not text — someone
          // pasted a file's ciphertext into the text box. Showing them as text
          // would render replacement marks and look like corruption; hand the
          // bytes over as a download instead.
          var text;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(plain); }
          catch (eNotText) {
            download(plain, 'decrypted.bin');
            jobDone = true;
            status('ok', 'Decrypted successfully, but the result is not text — it looks like an encrypted file. Downloaded as "decrypted.bin"; rename it to what it was. Next time, use "Decrypt a File".');
            plain.fill(0);
            return;
          }
          showResult(text, true);
          jobDone = ok = true;
          // Seed detection for border + SeedQR
          try {
            var res = await ittybitzValidateBip39(text);
            $('out').classList.remove('ok-border', 'bad-border');
            if (res.valid) {
              $('out').classList.add('ok-border');
              var words = res.words;
              var fp = null;
              try { fp = await masterFingerprint(words); } catch (e3) {}
              qrState = seedQrState(words, fp);
              $('out-qr').style.display = '';
              if (fp) showFp('dec', fp);
            } else {
              if (res.seedShaped) $('out').classList.add('bad-border');
              if (fitsQR(text)) {
                qrState = { getValue: function () { return text; }, numeric: false, kind: 'plain' };
                $('out-qr').style.display = '';
              }
            }
          } catch (e2) {
            if (fitsQR(text)) {
              qrState = { getValue: function () { return text; }, numeric: false, kind: 'plain' };
              $('out-qr').style.display = '';
            }
          }
          status('ok', 'Decrypted successfully. Click the eye to reveal the result.', true);
          highlightResultActions();
        }
      }
      if (plain) plain.fill(0); // best-effort erase after handoff
    } catch (err) {
      resetResult();
      status('err', err && err.message ? err.message : String(err));
    } finally {
      // The key file is key material: same best-effort erase as the plaintext.
      if (kfBytes) kfBytes.fill(0);
      busy = false;
      $('go-icon').innerHTML = mode === 'encrypt' ? ICON_LOCK : ICON_UNLOCK;
      $('p').value = ''; refreshPasswordButtons(); // never leave the password in the field
      // After a success the form starts over: the key file is cleared with
      // the password. Its box stays open (so the button does not jump), and
      // the next job asks for a key file until one is chosen or the switch is
      // turned off. After a failure it stays, so only the password needs
      // retyping.
      if (ok) {
        keyFile = null; clearKeyZone();
        if (inputType === 'file') flashDone();
      }
      showOutcome();
    }
  };

  // On a short screen the result (or the message below the button) can land
  // below the bottom edge, and it looks as if nothing happened. Once a job
  // ends, scroll just far enough to show it; if it is already in view,
  // nothing moves. Smooth unless the system asks for reduced motion.
  function showOutcome() {
    var res = $('result'), st = $('status');
    var el = res.style.display !== 'none' ? res
           : st.classList.contains('show') && !st.classList.contains('quiet') ? st : null;
    if (!el) return;
    var r = el.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= window.innerHeight) return;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' });
  }

  function showResult(value, isDecryptOutput) {
    $('result').style.display = '';
    $('out').value = value;
    $('out').classList.remove('ok-border', 'bad-border', 'blurred');
    // Reveal control + blur only for decrypt-text output.
    var showReveal = mode === 'decrypt' && inputType === 'text' && isDecryptOutput;
    $('out-reveal').style.display = showReveal ? '' : 'none';
    if (showReveal) { showDecrypted = false; $('out').classList.add('blurred'); setEyeIcon($('out-reveal'), true, 'result'); }
    $('out-label').textContent = 'Result';
  }

  // ---- Init ----
  applyModeLabels();
  setInputType('file');
  refreshPasswordButtons();
})();
