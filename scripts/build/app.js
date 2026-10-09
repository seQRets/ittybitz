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
    if (isFile || standalone) return;
    try { if (localStorage.getItem('ib-offline-tip') === '1') return; } catch (e) {}
    var n = document.getElementById('offline-tip');
    if (!n) return;
    n.classList.add('show');
    var x = document.getElementById('offline-x');
    if (x) x.onclick = function () {
      n.classList.remove('show');
      try { localStorage.setItem('ib-offline-tip', '1'); } catch (e) {}
    };
  })();

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

  function status(cls, text) {
    var s = $('status');
    s.className = 'status show ' + cls;
    s.textContent = text;
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
  function copyText(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      clipboardStale = false;
      status('ok', 'Copied to clipboard. It will be cleared in 60 seconds if you stay on this page. (The clipboard is never read.)');
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

  function drawQR(canvas, text, numeric, targetPx, margin) {
    margin = margin == null ? 4 : margin;
    var qr = qrcode(0, 'L');
    if (numeric) qr.addData(text, 'Numeric'); else qr.addData(text);
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
      // recognised later (and the generated one matched to its download notice).
      if (zoneId === 'drop-key') {
        var name = files[0].name;
        readBytes(files[0]).then(keyFingerprint).then(function (fp) {
          if (desc.textContent === name) desc.textContent = name + ' \u00b7 fingerprint [' + fp + ']';
        }).catch(function () {});
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
      clear.style.display = 'none';
    }
    clear.querySelector('button').addEventListener('click', function (e) { e.stopPropagation(); resetZone(); });
    return resetZone;
  }

  var clearMainZone = wireDrop('drop-main', 'f', 'main-desc', 'main-clear', function (fs) { mainFiles = fs; }, true);
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

  // Tabs per WAI-ARIA: one tab stop per tablist (roving tabindex), Left/Right
  // (and Home/End) move between tabs and activate the one landed on.
  function wireTablist(ids) {
    function focusTab(i) {
      i = (i + ids.length) % ids.length;
      ids.forEach(function (id, j) { $(id).setAttribute('tabindex', j === i ? '0' : '-1'); });
      $(ids[i]).focus(); $(ids[i]).click();
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
  $('t-copy').onclick = function () { copyText($('t').value); };

  $('t').addEventListener('input', function () {
    var val = $('t').value;
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
  // The moment a password is accepted for encryption (the border turns green)
  // is the moment to tell people to save it: the field is cleared after a
  // successful encrypt, and the password is the only way back in. Warning
  // afterwards would be too late. The notice fires once per password, not on
  // every keystroke.
  var SAVE_PW_NOTICE = 'Save this password somewhere secure now. It is the only way to decrypt the result, and it will be cleared from this field after you encrypt.';
  var pwNoticed = false;
  function refreshPasswordButtons() {
    var pw = $('p').value;
    $('p-copy').disabled = !pw;
    $('p-clear').disabled = !pw;
    $('p').classList.remove('ok-border', 'bad-border');
    var strong = !!pw && mode === 'encrypt' && isPasswordStrong(pw);
    if (pw && mode === 'encrypt') $('p').classList.add(strong ? 'ok-border' : 'bad-border');
    if (strong && !pwNoticed) { pwNoticed = true; status('ok', 'Password accepted. ' + SAVE_PW_NOTICE); }
    else if (!strong && pwNoticed) {
      // No longer accepted (edited below the bar, or cleared): withdraw the
      // notice — but only if it is still what the status box is showing.
      pwNoticed = false;
      if ($('status').textContent.indexOf(SAVE_PW_NOTICE) >= 0) clearStatus();
    }
  }
  $('p').addEventListener('input', refreshPasswordButtons);
  $('p-toggle').onclick = function () {
    var f = $('p');
    if (f.type === 'password') { f.type = 'text'; this.textContent = 'Hide'; }
    else { f.type = 'password'; this.textContent = 'Show'; }
  };
  $('p-copy').onclick = function () { copyText($('p').value); };
  $('p-clear').onclick = function () { $('p').value = ''; refreshPasswordButtons(); };
  $('p-gen').onclick = function () {
    $('p').value = generatePassword();
    pwNoticed = true; // this handler shows the notice itself
    refreshPasswordButtons();
    status('ok', 'A new secure password has been generated. ' + SAVE_PW_NOTICE);
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
    status('ok', 'Key file downloaded as "' + keyName + '". Whenever you select it, IttyBitz shows its fingerprint, ['
      + fp + '], even if the file has been renamed. You need both this key file and your password to decrypt.');
  };

  // ---- Output actions ----
  $('out-copy').onclick = function () { copyText($('out').value); };
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
  function openQr() {
    qrRevealed = false;
    $('qr-box').classList.add('qr-blur');
    // Draw the QR right away but blurred, so it clearly reads as a QR — a blank
    // white box looks broken. The Reveal button below just removes the blur.
    drawQR($('qr-canvas'), qrState.getValue(), qrState.numeric, 512, 4);
    $('qr-download').disabled = true;
    $('qr-reveal').lastChild.textContent = 'Reveal';
    if (qrState.kind === 'seed') {
      $('qr-title').textContent = 'Standard SeedQR';
      $('qr-desc').textContent = 'BIP-39 seed phrase, encoded for hardware-wallet import.';
      $('qr-warn').textContent = 'Anyone who scans this QR can recover your seed. Show only on a trusted device and screen.';
      $('qr-caption').style.display = '';
      $('qr-caption').textContent = qrState.caption || '';
      if (qrState.fp) { $('qr-fp-code').textContent = qrState.fp; $('qr-fp').style.display = 'block'; }
      else { $('qr-fp').style.display = 'none'; }
    } else {
      $('qr-title').textContent = 'QR Code';
      $('qr-desc').textContent = mode === 'encrypt'
        ? 'Scan this code to transfer the encrypted text.'
        : 'Scannable QR of the decrypted text. Nothing ever leaves your device.';
      $('qr-warn').textContent = mode === 'encrypt'
        ? 'This QR contains your encrypted text.'
        : 'This QR contains your decrypted text. Show only on a trusted device and screen.';
      $('qr-caption').style.display = 'none';
      $('qr-fp').style.display = 'none';
    }
    // The card is for ENCRYPTED text only: a ciphertext is made to be kept on
    // paper, a decrypted text or a seed never is. The button simply does not
    // exist for those.
    $('qr-print').style.display = (qrState.kind === 'plain' && mode === 'encrypt') ? '' : 'none';
    $('qr-overlay').classList.add('show');
  }
  function closeQr() { $('qr-overlay').classList.remove('show'); }

  // ---- Emergency card ----
  // Fill the print-only card, print, then empty it again so the ciphertext
  // does not stay in the document (a copy saved later would carry it).
  function fillCard() {
    var text = qrState.getValue();
    drawQR($('card-canvas'), text, false, 1024, 2);
    $('card-text').textContent = text;
    $('card-when').textContent = 'Made on ' + new Date().toISOString().slice(0, 10) + ' · ' + text.length + ' characters of Base64 · format IBTZ v1 · AES-256-GCM, PBKDF2 1,000,000';
    $('card-kf').textContent = useKeyFile && keyFile ? ' and the key file (' + keyFile.name + ', kept separately as well)' : '';
  }
  function clearCard() {
    $('card-text').textContent = ''; $('card-when').textContent = ''; $('card-kf').textContent = '';
    var c = $('card-canvas'); c.width = 1; c.height = 1;
    document.body.classList.remove('print-card');
  }
  $('qr-print').onclick = function () {
    if (!qrState || qrState.kind !== 'plain' || mode !== 'encrypt') return;
    fillCard();
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
    $('qr-download').disabled = !qrRevealed;
    this.lastChild.textContent = qrRevealed ? 'Hide' : 'Reveal';
  };
  $('qr-download').onclick = function () {
    if (!qrRevealed || !qrState) return;
    var off = document.createElement('canvas');
    drawQR(off, qrState.getValue(), qrState.numeric, 1024, 4);
    var url = off.toDataURL('image/png').replace('image/png', 'image/octet-stream');
    var a = document.createElement('a');
    a.href = url; a.download = qrState.kind === 'seed' ? 'ittybitz-seedqr.png' : 'ittybitz-qr.png';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    status('ok', '1024×1024 PNG downloaded. It encodes your secret — store it as carefully as the secret itself.');
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

    btn.disabled = true;
    $('go-icon').innerHTML = ICON_SPIN;
    resetResult();
    var nFiles = inputType === 'file' ? mainFiles.length : 0;
    status('ok', (mode === 'encrypt' ? 'Encrypting' : 'Deriving key') + ' (1,000,000 PBKDF2 iterations — this takes a moment'
      + (nFiles > 1 ? ' per file' : '') + ')…');

    var plain = null, kfBytes = null;
    try {
      kfBytes = keyFile ? await readBytes(keyFile) : null;

      // Several files: each is processed on its own — its own salt, its own
      // key derivation, its own download — and a failure in one does not stop
      // the others. The summary names what succeeded and what did not.
      if (inputType === 'file' && nFiles > 1) {
        var done = [], failed = [];
        for (var fi = 0; fi < mainFiles.length; fi++) {
          var f = mainFiles[fi];
          status('ok', (mode === 'encrypt' ? 'Encrypting' : 'Decrypting') + ' file ' + (fi + 1) + ' of ' + nFiles + ': "' + f.name + '"…');
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
        var verb = mode === 'encrypt' ? 'encrypted' : 'decrypted';
        var summary = done.length + ' of ' + nFiles + ' files ' + verb + (done.length ? ' — downloaded as: ' + done.join(', ') : '') + '.';
        if (failed.length) summary += '\n\nNot ' + verb + ': ' + failed.join('; ') + '.';
        if (done.length > 1) summary += '\n\nIf your browser asked whether to allow several downloads from this page, allow it; nothing is downloaded from anywhere else.';
        if (mode === 'encrypt' && done.length) summary += '\n\nStore your saved password securely. It is the only way to open these files.';
        status(failed.length ? 'err' : 'ok', summary);
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
          status('ok', 'File encrypted — downloaded as "' + encName + '".\n\nStore your saved password securely. It is the only way to open this file.');
        } else {
          var b64 = bytesToB64(ct);
          showResult(b64, false);
          $('t').value = ''; $('t').classList.remove('ok-border', 'bad-border');
          encFpToken++; hideFp('enc'); // the secret is gone from the field; its fingerprint goes with it
          if (fitsQR(b64)) {
            qrState = { getValue: function () { return b64; }, numeric: false, kind: 'plain' };
            $('out-qr').style.display = '';
          }
          status('ok', 'Text encrypted. Copy the Base64 result, or show it as a QR.\n\nStore your saved password securely. It is the only way to decrypt this text.');
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
          status('ok', 'Decrypted successfully — downloaded as "' + outName + '".');
        } else {
          // Decrypted bytes that are not UTF-8 are a file, not text — someone
          // pasted a file's ciphertext into the text box. Showing them as text
          // would render replacement marks and look like corruption; hand the
          // bytes over as a download instead.
          var text;
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(plain); }
          catch (eNotText) {
            download(plain, 'decrypted.bin');
            status('ok', 'Decrypted successfully, but the result is not text — it looks like an encrypted file. Downloaded as "decrypted.bin"; rename it to what it was. Next time, use "Decrypt a File".');
            plain.fill(0);
            return;
          }
          showResult(text, true);
          // Seed detection for border + SeedQR
          try {
            var res = await ittybitzValidateBip39(text);
            $('out').classList.remove('ok-border', 'bad-border');
            if (res.valid) {
              $('out').classList.add('ok-border');
              var words = res.words;
              var fp = null;
              try { fp = await masterFingerprint(words); } catch (e3) {}
              qrState = { getValue: function () { return ittybitzToSeedQR(words); }, numeric: true, kind: 'seed',
                          caption: 'Standard SeedQR · ' + words.length + ' words · ' + (words.length * 4) + ' digits', fp: fp };
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
          status('ok', 'Decrypted successfully. Click the eye to reveal the result.');
        }
      }
      if (plain) plain.fill(0); // best-effort erase after handoff
    } catch (err) {
      resetResult();
      status('err', err && err.message ? err.message : String(err));
    } finally {
      // The key file is key material: same best-effort erase as the plaintext.
      if (kfBytes) kfBytes.fill(0);
      btn.disabled = false;
      $('go-icon').innerHTML = mode === 'encrypt' ? ICON_LOCK : ICON_UNLOCK;
      $('p').value = ''; refreshPasswordButtons(); // never leave the password in the field
    }
  };

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
