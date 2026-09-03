/* ── IttyBitz single-file UI ──────────────────────────────────────────────
   All presentation and wiring. The cryptography lives in the DOM-free
   ittybitz-crypto-core block above; this layer only reads files, calls it,
   and renders results. Mirrors the behaviour of the React app in
   src/components/encryptor-tool.tsx.
   ───────────────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };

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
  var mainFile = null, keyFile = null;
  var useKeyFile = false;
  var showTextSecret = true;  // encrypt-side blur toggle
  var showDecrypted = false;  // decrypt-side reveal toggle
  var clipboardTimer = null;
  var seedTimer = null;
  var qrState = null;         // { getValue, numeric, kind }
  var qrRevealed = false;

  var MAX_FILE_SIZE = 100 * 1024 * 1024;
  var QR_MAX_CHARS = 2953;
  var BAD_NAME = /[\u0000-\u001f\u202a-\u202e\u2066-\u2069]/;
  var GEN_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=";
  var SYMBOL_RE = /[!@#$%^&*()_+~`|}{[\]:;?><,.\/=-]/;

  var ICON_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
  var ICON_UNLOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
  var ICON_SPIN = '<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

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
    URL.revokeObjectURL(url);
  }

  function status(cls, text) {
    var s = $('status');
    s.className = 'status show ' + cls;
    s.textContent = text;
  }
  function clearStatus() { var s = $('status'); s.className = 'status'; s.textContent = ''; }

  function copyText(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      status('ok', 'Copied to clipboard. Auto-clear will be attempted in 60 seconds (may not work if the tab loses focus).');
      if (clipboardTimer) clearTimeout(clipboardTimer);
      clipboardTimer = setTimeout(function () {
        navigator.clipboard.readText().then(function (cur) {
          if (cur === text) navigator.clipboard.writeText('');
        }).catch(function () {});
        clipboardTimer = null;
      }, 60000);
    }).catch(function () { status('err', 'Failed to copy to clipboard.'); });
  }

  // ---- QR rendering (vendored qrcode-generator → canvas) ----
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
  function wireDrop(zoneId, inputId, descId, clearId, onPick) {
    var zone = $(zoneId), input = $(inputId), desc = $(descId), clear = $(clearId);
    var defaultText = desc.textContent;

    function pick(file) {
      if (!file) return;
      if (!validName(file.name)) { status('err', 'That filename contains characters that are not allowed.'); return; }
      if (file.size > MAX_FILE_SIZE) { status('err', 'File is too large. Maximum size is 100MB.'); return; }
      onPick(file);
      desc.textContent = file.name; desc.className = 'picked';
      clear.style.display = '';
    }

    zone.addEventListener('click', function () { input.click(); });
    zone.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    input.addEventListener('change', function () { pick(input.files && input.files[0]); });
    ['dragenter', 'dragover'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.add('dragging'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); zone.classList.remove('dragging'); });
    });
    zone.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) pick(e.dataTransfer.files[0]);
    });

    function resetZone() {
      onPick(null); input.value = '';
      desc.textContent = defaultText; desc.className = '';
      clear.style.display = 'none';
    }
    clear.querySelector('button').addEventListener('click', function (e) { e.stopPropagation(); resetZone(); });
    return resetZone;
  }

  var clearMainZone = wireDrop('drop-main', 'f', 'main-desc', 'main-clear', function (f) { mainFile = f; });
  var clearKeyZone = wireDrop('drop-key', 'k', 'key-desc', 'key-clear', function (f) { keyFile = f; });

  // Swallow stray drops so the browser never navigates away and loses input.
  ['dragover', 'drop'].forEach(function (ev) { window.addEventListener(ev, function (e) { e.preventDefault(); }, false); });

  // ---- Reset ----
  function resetResult() {
    $('result').style.display = 'none';
    $('out').value = ''; $('out').classList.remove('blurred', 'ok-border', 'bad-border');
    $('out-qr').style.display = 'none';
    $('out-reveal').style.display = 'none';
    qrState = null;
    clearStatus();
  }

  function fullReset() {
    mainFile = null; keyFile = null;
    clearMainZone(); clearKeyZone();
    $('p').value = '';
    $('t').value = '';
    $('t').classList.remove('ok-border', 'bad-border');
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
    $('t-toggle').style.display = enc ? '' : 'none';
    $('p-gen').style.display = enc ? '' : 'none';
    $('go-icon').innerHTML = enc ? ICON_LOCK : ICON_UNLOCK;
    $('go-label').textContent = enc ? 'Encrypt' : 'Decrypt';
    // Encrypt-side secret text is blurred-toggleable; decrypt-side textarea is plain.
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
    resetResult();
  }

  $('tab-enc').onclick = function () { setMode('encrypt'); };
  $('tab-dec').onclick = function () { setMode('decrypt'); };
  $('pill-file').onclick = function () { setInputType('file'); };
  $('pill-text').onclick = function () { setInputType('text'); };

  // ---- Text secret blur (encrypt) + BIP-39 border ----
  function updateTextBlur() {
    var t = $('t');
    if (mode === 'encrypt' && !showTextSecret && t.value) t.classList.add('blurred');
    else t.classList.remove('blurred');
  }
  $('t-toggle').onclick = function () {
    showTextSecret = !showTextSecret;
    this.setAttribute('title', showTextSecret ? 'Hide secret text' : 'Show secret text');
    updateTextBlur();
  };

  $('t').addEventListener('input', function () {
    updateTextBlur();
    if (mode !== 'encrypt') return;
    var val = $('t').value;
    if (seedTimer) clearTimeout(seedTimer);
    if (!val.trim()) { $('t').classList.remove('ok-border', 'bad-border'); return; }
    seedTimer = setTimeout(function () {
      ittybitzValidateBip39(val).then(function (res) {
        $('t').classList.remove('ok-border', 'bad-border');
        if (res.valid) $('t').classList.add('ok-border');
        else if (res.seedShaped) $('t').classList.add('bad-border');
      }).catch(function () { $('t').classList.remove('ok-border', 'bad-border'); });
    }, 300);
  });

  // ---- Password field ----
  function refreshPasswordButtons() {
    var pw = $('p').value;
    $('p-copy').disabled = !pw;
    $('p-clear').disabled = !pw;
    $('p').classList.remove('ok-border', 'bad-border');
    if (mode === 'encrypt' && pw) {
      $('p').classList.add(isPasswordStrong(pw) ? 'ok-border' : 'bad-border');
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
  $('p-gen').onclick = function () { $('p').value = generatePassword(); refreshPasswordButtons(); status('ok', 'A new secure password has been generated.'); };

  // ---- Key file toggle ----
  $('kf-switch').onclick = function () {
    useKeyFile = !useKeyFile;
    this.setAttribute('aria-checked', String(useKeyFile));
    $('kf-pane').style.display = useKeyFile ? '' : 'none';
    if (!useKeyFile) { keyFile = null; clearKeyZone(); }
  };
  $('k-gen').onclick = function () {
    var key = new Uint8Array(64);
    crypto.getRandomValues(key);
    download(key, 'ittybitz-key.bin');
    status('ok', 'A new key file has been generated and downloaded.');
  };

  // ---- Output actions ----
  $('out-copy').onclick = function () { copyText($('out').value); };
  $('out-reveal').onclick = function () {
    showDecrypted = !showDecrypted;
    $('out').classList.toggle('blurred', !showDecrypted);
  };
  $('out-qr').onclick = function () { if (qrState) openQr(); };

  // ---- QR overlay ----
  function openQr() {
    qrRevealed = false;
    $('qr-box').classList.add('qr-blur');
    var ctx = $('qr-canvas').getContext('2d');
    ctx.clearRect(0, 0, $('qr-canvas').width, $('qr-canvas').height);
    $('qr-download').disabled = true;
    $('qr-reveal').lastChild.textContent = 'Reveal';
    if (qrState.kind === 'seed') {
      $('qr-title').textContent = 'Standard SeedQR';
      $('qr-desc').textContent = 'BIP-39 seed phrase, encoded for hardware-wallet import (Coldcard, SeedSigner, Sparrow, Specter, Krux, Keystone, Jade).';
      $('qr-warn').textContent = 'Anyone who scans this QR can recover your seed. Show only on a trusted device and screen.';
      $('qr-caption').style.display = '';
      $('qr-caption').textContent = qrState.caption || '';
    } else {
      $('qr-title').textContent = 'QR Code';
      $('qr-desc').textContent = mode === 'encrypt'
        ? 'Scan this code to transfer the encrypted text.'
        : 'Scannable QR of the decrypted text. Nothing ever leaves your device.';
      $('qr-warn').textContent = mode === 'encrypt'
        ? 'This QR contains your encrypted text.'
        : 'This QR contains your decrypted text. Show only on a trusted device and screen.';
      $('qr-caption').style.display = 'none';
    }
    $('qr-overlay').classList.add('show');
  }
  function closeQr() { $('qr-overlay').classList.remove('show'); }
  $('qr-close').onclick = closeQr;
  $('qr-overlay').addEventListener('click', function (e) { if (e.target === this) closeQr(); });
  $('qr-reveal').onclick = function () {
    qrRevealed = !qrRevealed;
    if (qrRevealed) {
      drawQR($('qr-canvas'), qrState.getValue(), qrState.numeric, 512, 4);
      $('qr-box').classList.remove('qr-blur');
      $('qr-download').disabled = false;
      this.lastChild.textContent = 'Hide';
    } else {
      var ctx = $('qr-canvas').getContext('2d');
      ctx.clearRect(0, 0, $('qr-canvas').width, $('qr-canvas').height);
      $('qr-box').classList.add('qr-blur');
      $('qr-download').disabled = true;
      this.lastChild.textContent = 'Reveal';
    }
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

    var hasInput = inputType === 'file' ? !!mainFile : !!$('t').value.trim();
    if (!hasInput) { status('err', inputType === 'file' ? 'Provide a file to process.' : 'Provide text to process.'); return; }
    var pw = $('p').value;
    if (!pw) { status('err', 'A password is required.'); return; }
    if (mode === 'encrypt' && !isPasswordStrong(pw)) {
      status('err', 'Weak password. Use at least 24 characters with uppercase, lowercase, numbers, and symbols.'); return;
    }
    if (useKeyFile && !keyFile) { status('err', '"Use key file" is on but no key file is selected. Choose one, or turn the option off.'); return; }

    btn.disabled = true;
    $('go-icon').innerHTML = ICON_SPIN;
    resetResult();
    status('ok', (mode === 'encrypt' ? 'Encrypting' : 'Deriving key') + ' (1,000,000 PBKDF2 iterations — this takes a moment)…');

    var plain = null;
    try {
      var kfBytes = keyFile ? await readBytes(keyFile) : null;

      if (mode === 'encrypt') {
        var inputBytes = inputType === 'file' ? await readBytes(mainFile) : new TextEncoder().encode($('t').value);
        var ct = await ittybitzEncrypt(inputBytes, pw, kfBytes);
        if (inputType === 'file') {
          var encName = mainFile.name + '.ibitz';
          download(ct, encName);
          mainFile = null; clearMainZone();
          status('ok', 'File encrypted — downloaded as "' + encName + '".');
        } else {
          var b64 = bytesToB64(ct);
          showResult(b64, false);
          $('t').value = ''; $('t').classList.remove('ok-border', 'bad-border');
          if (b64.length <= QR_MAX_CHARS) {
            qrState = { getValue: function () { return b64; }, numeric: false, kind: 'plain' };
            $('out-qr').style.display = '';
          }
          status('ok', 'Text encrypted. Copy the Base64 result, or show it as a QR.');
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
          var text = new TextDecoder().decode(plain);
          showResult(text, true);
          // Seed detection for border + SeedQR
          try {
            var res = await ittybitzValidateBip39(text);
            $('out').classList.remove('ok-border', 'bad-border');
            if (res.valid) {
              $('out').classList.add('ok-border');
              var words = res.words;
              qrState = { getValue: function () { return ittybitzToSeedQR(words); }, numeric: true, kind: 'seed',
                          caption: 'Standard SeedQR · ' + words.length + ' words · ' + (words.length * 4) + ' digits' };
              $('out-qr').style.display = '';
            } else {
              if (res.seedShaped) $('out').classList.add('bad-border');
              if (text.length <= QR_MAX_CHARS) {
                qrState = { getValue: function () { return text; }, numeric: false, kind: 'plain' };
                $('out-qr').style.display = '';
              }
            }
          } catch (e2) {
            if (text.length <= QR_MAX_CHARS) {
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
    if (showReveal) { showDecrypted = false; $('out').classList.add('blurred'); }
    $('out-label').textContent = 'Result';
  }

  // ---- Init ----
  applyModeLabels();
  setInputType('file');
  refreshPasswordButtons();
})();
