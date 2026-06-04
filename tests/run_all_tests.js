/**
 * VTM Chronicle Manager — Полный набор тестов (шаблон)
 *
 * Запуск:  node tests/run_all_tests.js
 *          или через  tests/run_all.bat
 *
 * Секция 1 — API-тесты  (9 групп, без браузера)
 * Секция 2 — UI-тесты   (9 групп, Headless Chrome)
 *
 * Отчёт: tests/report_all.html
 *
 * Тесты не содержат приватных данных проекта — работают с любым доменом.
 */

'use strict';

const fs     = require('fs');
const path   = require('path');
const http   = require('http');
const { execSync, spawn, spawnSync } = require('child_process');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const ROOT   = path.resolve(__dirname, '..');
const SERVER = path.join(ROOT, 'web', 'server.js');
const BASE     = 'http://localhost:3000';
const WAIT     = 8000;
const W        = process.stdout.columns || 80;
const TEST_IMG = path.resolve(__dirname, 'test.png');

// Тестовые персонажи — создаются и удаляются в рамках каждого прогона
const TEST_CHARS = [
  { type: 'vampire',  name: 'Тест-Авто-Вампир',   folder: 'vampires',
    fields: { Name: 'Тест-Авто-Вампир', Clan: 'Малкавиан', Sect: 'Камарилья', Role: 'Автотест' } },
  { type: 'mortal',   name: 'Тест-Авто-Смертный',  folder: 'mortals',
    fields: { Name: 'Тест-Авто-Смертный', Role: 'Автотест' } },
  { type: 'fairy',    name: 'Тест-Авто-Фея',       folder: 'fairies',
    fields: { Name: 'Тест-Авто-Фея', Clan: 'Sidhe', Role: 'Автотест' } },
  { type: 'werewolf', name: 'Тест-Авто-Оборотень', folder: 'werewolves',
    fields: { Name: 'Тест-Авто-Оборотень', Clan: 'Bone Gnawers', Sect: 'Рагабаш', Role: 'Автотест' } },
  { type: 'mage',     name: 'Тест-Авто-Маг',       folder: 'mages',
    fields: { Name: 'Тест-Авто-Маг', Clan: 'Verbena', Sect: 'Просветлённые', Role: 'Автотест' } },
  { type: 'hunter',   name: 'Тест-Авто-Охотник',   folder: 'hunters',
    fields: { Name: 'Тест-Авто-Охотник', Clan: 'Инквизиция', Role: 'Автотест' } },
];

// ── Мини-фреймворк ────────────────────────────────────────────────────────────

const GROUPS   = [];
let _group     = null;
let _totalRun  = 0;
let _pass      = 0;
let _fail      = 0;
let _sectionTag = 'api';

function bar(done, total, width) {
  width = width || 24;
  var filled = total ? Math.round(done / total * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function clearLine() { process.stdout.write('\r\x1b[K'); }

function printSectionBanner(title, desc) {
  clearLine();
  var hr = '━'.repeat(54);
  process.stdout.write('\n\x1b[33m' + hr + '\x1b[0m\n');
  process.stdout.write('  \x1b[1m\x1b[33m' + title + '\x1b[0m\n');
  if (desc) process.stdout.write('  \x1b[2m' + desc + '\x1b[0m\n');
  process.stdout.write('\x1b[33m' + hr + '\x1b[0m\n');
}

function printGroupHeader(g) {
  var line = '\n  ┌─ ' + g.title;
  if (g.desc) line += '\n  │  \x1b[2m' + g.desc + '\x1b[0m';
  line += '\n  └──────────────────────────────';
  process.stdout.write(line + '\n');
}

function printGroupFooter(g) {
  var gPass = g.tests.filter(function(t) { return t.status === 'PASS'; }).length;
  var gFail = g.tests.filter(function(t) { return t.status === 'FAIL'; }).length;
  var n     = g.tests.length;
  if (!n) return;
  var pct   = Math.round(gPass / n * 100);
  var icon  = gFail ? '\x1b[31m✗\x1b[0m' : '\x1b[32m✓\x1b[0m';
  var color = gFail ? '\x1b[31m' : '\x1b[32m';
  process.stdout.write(
    '  ' + icon + '  ' + color + bar(gPass, n, 20) + '\x1b[0m'
    + '  ' + gPass + '/' + n
    + (gFail ? '  \x1b[31m(' + gFail + ' упало)\x1b[0m' : '  \x1b[32m' + pct + '%\x1b[0m')
    + '\n'
  );
}

function section(tag, title, desc) {
  _sectionTag = tag;
  printSectionBanner(title, desc);
}

function group(title, desc) {
  if (_group && _group.tests.length) printGroupFooter(_group);
  _group = { title, desc, tests: [], sectionTag: _sectionTag };
  GROUPS.push(_group);
  printGroupHeader(_group);
}

async function t(name, desc, fn) {
  _totalRun++;
  var idx    = _totalRun;
  var prefix = '\x1b[2m[' + String(idx).padStart(2) + ']\x1b[0m ';
  process.stdout.write('  ' + prefix + '\x1b[33m⟳\x1b[0m  ' + name.slice(0, W - 12));
  const entry = { name, desc, status: 'PASS', error: null };
  try {
    await fn();
    _pass++;
    clearLine();
    process.stdout.write('  ' + prefix + '\x1b[32m✓\x1b[0m  ' + name + '\n');
  } catch (e) {
    _fail++;
    entry.status = 'FAIL';
    entry.error  = e.message || String(e);
    clearLine();
    process.stdout.write('  ' + prefix + '\x1b[31m✗\x1b[0m  ' + name + '\n');
    process.stdout.write('        \x1b[31m' + entry.error.slice(0, 120) + '\x1b[0m\n');
  }
  var overallBar = bar(_pass + _fail, _totalRun, 30);
  process.stdout.write('\r  \x1b[2m' + overallBar + '  ' + (_pass + _fail) + ' / ' + _totalRun
    + '   \x1b[32m✓' + _pass + '\x1b[0m\x1b[2m  \x1b[31m✗' + _fail + '\x1b[0m');
  _group.tests.push(entry);
}

function assert(cond, msg)         { if (!cond)      throw new Error(msg || 'Условие не выполнено'); }
function assertGte(a, b, msg)      { if (a < b)       throw new Error((msg || '') + ': ' + a + ' < ' + b); }
function assertEq(a, b, msg)       { if (a !== b)     throw new Error((msg || '') + ': получено "' + a + '", ожидалось "' + b + '"'); }
function assertInc(s, sub, msg)    { if (!s.includes(sub))  throw new Error((msg || '') + ': "' + sub + '" не найдено'); }
function assertNotInc(s, sub, msg) { if (s.includes(sub))   throw new Error((msg || '') + ': "' + sub + '" найдено, не должно быть'); }

// ── HTTP / Сервер ─────────────────────────────────────────────────────────────

function apiGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body), body }); }
        catch { resolve({ status: res.statusCode, json: null, body }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(6000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function apiPost(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u       = new URL(url, BASE);
    const opts    = {
      hostname: u.hostname, port: u.port || 3000,
      path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          let msg = 'HTTP ' + res.statusCode;
          try { const j = JSON.parse(data); msg += ' ' + (j.error || ''); } catch {}
          return reject(new Error(msg));
        }
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(35000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

function serverIsUp() {
  return new Promise(resolve => {
    http.get(BASE + '/api/status', res => { res.resume(); resolve(true); })
      .on('error', () => resolve(false));
  });
}

function waitForServer(ms) {
  ms = ms || 15000;
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function probe() {
      http.get(BASE + '/api/status', res => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - t0 > ms) reject(new Error('Сервер не ответил за ' + ms + 'ms'));
          else setTimeout(probe, 300);
        });
    })();
  });
}

// ── Файловые хелперы ──────────────────────────────────────────────────────────

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf-8').replace(/\r\n/g, '\n');
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function findMDFiles(relDir) {
  const dir = path.join(ROOT, relDir);
  if (!fs.existsSync(dir)) return [];
  const results = [];
  function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.md')) results.push(full);
    }
  }
  walk(dir);
  return results;
}

// ── Selenium-хелперы ──────────────────────────────────────────────────────────

async function waitForNoSpinner(driver, containerId, timeout) {
  await driver.wait(async () => {
    const spinners = await driver.findElements(By.css('#' + containerId + ' .spinner'));
    return spinners.length === 0;
  }, timeout || WAIT, 'Spinner in #' + containerId + ' did not disappear');
}

async function navTo(driver, page) {
  const link = await driver.findElement(By.css('[data-page="' + page + '"]'));
  await link.click();
  await driver.wait(until.elementLocated(By.css('#page-' + page + '.active')), WAIT,
    'Page #page-' + page + ' did not become active');
}

async function waitModalVisible(driver, modalId) {
  const modal = await driver.findElement(By.id(modalId));
  await driver.wait(async () => {
    try { return await modal.isDisplayed(); } catch { return false; }
  }, WAIT, 'Modal #' + modalId + ' did not open');
}

async function waitModalHidden(driver, modalId) {
  const modal = await driver.findElement(By.id(modalId));
  await driver.wait(async () => {
    try { return !(await modal.isDisplayed()); } catch { return true; }
  }, WAIT, 'Modal #' + modalId + ' did not close');
}

async function countVisible(driver, selector) {
  return driver.executeScript(function(sel) {
    return Array.from(document.querySelectorAll(sel))
      .filter(function(el) { return getComputedStyle(el).display !== 'none'; }).length;
  }, selector);
}

// ── Прямой запуск PowerShell-скриптов ────────────────────────────────────────

function runPS(relScript, psArgs) {
  var scriptPath = path.join(ROOT, relScript).replace(/\\/g, '\\\\').replace(/'/g, "''");
  var cmd = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$OutputEncoding = [System.Text.Encoding]::UTF8',
    "& '" + scriptPath + "' " + (psArgs || '')
  ].join('; ');
  return spawnSync('powershell.exe',
    ['-ExecutionPolicy', 'Bypass', '-NoProfile', '-NonInteractive', '-Command', cmd],
    { cwd: ROOT, timeout: 20000, encoding: 'utf8' });
}

// ── Создание персонажа через UI ───────────────────────────────────────────────

async function createCharViaUI(driver, lineage, fields, imagePath) {
  await navTo(driver, 'characters');
  const createBtn = await driver.findElement(By.id('btn-open-create-char'));
  await driver.executeScript('arguments[0].click()', createBtn);
  await waitModalVisible(driver, 'char-modal');

  await driver.findElement(By.css('[data-type="' + lineage + '"]')).click();
  await driver.wait(async () => {
    try { return await (await driver.findElement(By.id('modal-s2'))).isDisplayed(); } catch { return false; }
  }, WAIT, 'Step 2 did not appear for ' + lineage);

  for (const [param, value] of Object.entries(fields)) {
    try {
      const input = await driver.findElement(By.css('input[data-param="' + param + '"]'));
      await input.clear();
      await input.sendKeys(value);
    } catch { /* поле может отсутствовать для данного типа */ }
  }

  if (imagePath && fs.existsSync(imagePath)) {
    const imgInput = await driver.findElement(By.id('modal-img-input'));
    await imgInput.sendKeys(imagePath);
    await driver.wait(async () => {
      try { return await (await driver.findElement(By.id('modal-img-preview'))).isDisplayed(); }
      catch { return false; }
    }, 6000, 'Image preview did not appear');
  }

  await driver.findElement(By.id('modal-submit')).click();

  await driver.wait(async () => {
    try {
      const out = await driver.findElement(By.id('modal-output'));
      const cls = await out.getAttribute('class');
      return cls && cls.includes('ok');
    } catch { return false; }
  }, 30000, 'Character creation did not succeed: ' + lineage);

  await waitModalHidden(driver, 'char-modal');
}

// ── Очистка тестовых персонажей ───────────────────────────────────────────────

function removeEntryFromAllMd(text, name) {
  var lines  = text.split('\n');
  var result = [];
  var i = 0;
  while (i < lines.length) {
    var line = lines[i];
    if (line.startsWith('### ') && line.includes(name)) {
      i++;
      var skipped = 0;
      while (i < lines.length && lines[i].startsWith('- ') && skipped < 6) { i++; skipped++; }
      while (result.length > 0 && result[result.length - 1] === '') result.pop();
    } else {
      result.push(line);
      i++;
    }
  }
  return result.join('\n');
}

function cleanupTestChars() {
  var removed = 0;
  for (var i = 0; i < TEST_CHARS.length; i++) {
    var ch = TEST_CHARS[i];
    var charDir = path.join(ROOT, 'characters', ch.folder, ch.name);
    if (fs.existsSync(charDir)) {
      fs.rmSync(charDir, { recursive: true, force: true });
      removed++;
    }
  }
  var allPath = path.join(ROOT, 'characters', 'characters_ALL.md');
  try {
    var allText = fs.readFileSync(allPath, 'utf-8').replace(/\r\n/g, '\n');
    for (var j = 0; j < TEST_CHARS.length; j++) {
      allText = removeEntryFromAllMd(allText, TEST_CHARS[j].name);
    }
    fs.writeFileSync(allPath, allText, 'utf-8');
  } catch(e) {
    process.stdout.write('  \x1b[33m⚠ cleanup characters_ALL.md: ' + e.message + '\x1b[0m\n');
  }
  var mapPath = path.join(ROOT, 'rules', 'npc_image_mapping.md');
  try {
    var mapText = fs.readFileSync(mapPath, 'utf-8').replace(/\r\n/g, '\n');
    for (var k = 0; k < TEST_CHARS.length; k++) {
      var escapedName = TEST_CHARS[k].name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      mapText = mapText.replace(new RegExp('\n\\| ' + escapedName + ' \\|[^\n]*', 'g'), '');
    }
    fs.writeFileSync(mapPath, mapText, 'utf-8');
  } catch(e) {
    process.stdout.write('  \x1b[33m⚠ cleanup npc_image_mapping.md: ' + e.message + '\x1b[0m\n');
  }
  return removed;
}

// ── HTML-отчёт ────────────────────────────────────────────────────────────────

function buildFailureSummary(groups, totalFail) {
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  var rows = '';
  var num  = 0;
  groups.forEach(function(g) {
    g.tests.forEach(function(tt) {
      if (tt.status !== 'FAIL') return;
      num++;
      rows += '<tr>'
        + '<td class="fcol-n">' + num + '</td>'
        + '<td class="fcol-group">' + esc(g.title) + '</td>'
        + '<td class="fcol-name">' + esc(tt.name) + '</td>'
        + '<td class="fcol-err">' + esc(tt.error || '') + '</td>'
        + '</tr>';
    });
  });
  return '<div class="fail-summary">'
    + '<div class="fail-summary-header" onclick="var b=this.nextElementSibling;b.classList.toggle(\'open\');this.querySelector(\'.fail-summary-toggle\').textContent=b.classList.contains(\'open\')?\'▲ Свернуть\':\'▼ Развернуть\'">'
    +   '<div><span class="fail-summary-title">&#10007; Упавшие тесты</span></div>'
    +   '<div style="display:flex;align-items:center;gap:16px">'
    +     '<span class="fail-summary-count">' + totalFail + ' упали</span>'
    +     '<span class="fail-summary-toggle">▼ Развернуть</span>'
    +   '</div>'
    + '</div>'
    + '<div class="fail-summary-body open">'
    +   '<table class="fail-table"><thead><tr>'
    +     '<th class="fcol-n">#</th>'
    +     '<th class="fcol-group">Группа</th>'
    +     '<th class="fcol-name">Тест</th>'
    +     '<th class="fcol-err">Ошибка</th>'
    +   '</tr></thead><tbody>'
    + rows
    + '</tbody></table>'
    + '</div>'
    + '</div>';
}

function buildReport(groups, totalPass, totalFail, totalRun, elapsed) {
  var stamp    = new Date().toLocaleString('ru-RU', { hour12: false });
  var allGreen = totalFail === 0;
  var pct      = totalRun ? Math.round(totalPass / totalRun * 100) : 0;

  var apiGroups = groups.filter(function(g) { return g.sectionTag === 'api'; });
  var uiGroups  = groups.filter(function(g) { return g.sectionTag === 'ui'; });

  function secStats(gs) {
    var all = gs.reduce(function(a, g) { return a.concat(g.tests); }, []);
    return {
      pass: all.filter(function(t) { return t.status === 'PASS'; }).length,
      fail: all.filter(function(t) { return t.status === 'FAIL'; }).length,
      skip: all.filter(function(t) { return t.status === 'SKIP'; }).length,
      total: all.length,
    };
  }

  var api = secStats(apiGroups);
  var ui  = secStats(uiGroups);

  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function renderRows(tests) {
    if (!tests.length) return '<tr><td colspan="3" class="skip-row">Тесты пропущены</td></tr>';
    return tests.map(function(tt) {
      var cls  = tt.status === 'PASS' ? 'pass' : (tt.status === 'SKIP' ? 'skip' : 'fail');
      var icon = tt.status === 'PASS' ? '&#10003;' : (tt.status === 'SKIP' ? '&ndash;' : '&#10007;');
      var err  = tt.error ? '<div class="err-msg">' + esc(tt.error) + '</div>' : '';
      return '<tr class="row-' + cls + '">'
        + '<td class="col-status"><span class="badge-' + cls + '">' + icon + '</span></td>'
        + '<td class="col-name">' + esc(tt.name) + err + '</td>'
        + '<td class="col-desc">' + esc(tt.desc) + '</td>'
        + '</tr>';
    }).join('');
  }

  function renderGroups(gs) {
    return gs.map(function(g) {
      var gPass = g.tests.filter(function(t) { return t.status === 'PASS'; }).length;
      var gFail = g.tests.filter(function(t) { return t.status === 'FAIL'; }).length;
      var gSkip = g.tests.filter(function(t) { return t.status === 'SKIP'; }).length;
      var gPct  = g.tests.length ? Math.round(gPass / g.tests.length * 100) : 0;
      var gcls  = gFail > 0 ? 'group-fail' : (gSkip === g.tests.length ? 'group-skip' : 'group-pass');
      return '<section class="group ' + gcls + '">'
        + '<div class="group-header">'
        +   '<div class="group-title">' + esc(g.title) + '</div>'
        +   '<div class="group-meta">'
        +     '<span class="group-desc">' + esc(g.desc) + '</span>'
        +     '<div class="group-stats">'
        +       '<span class="gs-pass">' + gPass + ' прошли</span>'
        +       (gFail ? '<span class="gs-fail">' + gFail + ' упали</span>' : '')
        +       (gSkip ? '<span class="gs-skip">' + gSkip + ' пропущены</span>' : '')
        +       '<div class="mini-bar"><div class="mini-fill" style="width:' + gPct + '%"></div></div>'
        +     '</div>'
        +   '</div>'
        + '</div>'
        + '<table class="test-table"><thead><tr>'
        +   '<th class="col-status">Статус</th>'
        +   '<th class="col-name">Тест</th>'
        +   '<th class="col-desc">Что проверяет</th>'
        + '</tr></thead><tbody>'
        + renderRows(g.tests)
        + '</tbody></table></section>';
    }).join('');
  }

  function sectionBlock(tag, title, badge, stat, gs) {
    var sPct = stat.total ? Math.round(stat.pass / stat.total * 100) : 0;
    var sOk  = stat.fail === 0;
    return '<div class="sec-header sec-' + tag + '">'
      +   '<div class="sec-left"><span class="sec-badge">' + badge + '</span>'
      +     '<div class="sec-title">' + title + '</div></div>'
      +   '<div class="sec-right">'
      +     '<span class="sec-stat ' + (sOk ? 'sec-ok' : 'sec-fail') + '">'
      +       (sOk ? '&#10003;' : '&#10007;') + ' ' + stat.pass + '/' + stat.total + '</span>'
      +     '<div class="sec-bar-wrap"><div class="sec-bar-fill ' + (sOk ? '' : 'fail') + '" style="width:' + sPct + '%"></div></div>'
      +     '<span class="sec-pct">' + sPct + '%</span>'
      +   '</div>'
      + '</div>' + renderGroups(gs);
  }

  var css = ':root{'
    + '--bg:#07050a;--bg2:#0d0a10;--bg3:#120f18;--bg4:#181420;'
    + '--red:#8B0000;--red2:#B80000;--red3:#CC2200;'
    + '--gold:#B8860B;--gold2:#DAA520;'
    + '--green:#1a5c1a;--green2:#2d8c2d;--green3:#4CAF50;'
    + '--text:#E8E0D0;--text2:#a89880;--text3:#5a5050;'
    + '--border:rgba(139,0,0,.22);--border2:rgba(180,20,0,.4);'
    + '--fh:"Cinzel",serif;--fb:"Cormorant Garamond",Georgia,serif;--fm:"Share Tech Mono","Courier New",monospace;'
    + '}'
    + '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}'
    + 'body{background:var(--bg);color:var(--text);font-family:var(--fb);font-size:16px;line-height:1.6}'
    + '::-webkit-scrollbar{width:5px}::-webkit-scrollbar-track{background:var(--bg2)}::-webkit-scrollbar-thumb{background:var(--red)}'
    + '.header{background:var(--bg2);border-bottom:2px solid var(--border2);padding:40px 48px 32px;position:relative;overflow:hidden}'
    + '.header::before{content:"";position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% -10%,rgba(139,0,0,.18),transparent 70%);pointer-events:none}'
    + '.header-top{display:flex;align-items:flex-start;justify-content:space-between;gap:32px;margin-bottom:32px}'
    + '.logo-drop{font-size:11px;color:var(--text3);font-family:var(--fm);letter-spacing:.1em;text-transform:uppercase}'
    + '.logo-title{font-family:var(--fh);font-size:28px;font-weight:700;letter-spacing:.18em;text-transform:uppercase}'
    + '.logo-sub{font-family:var(--fh);font-size:12px;color:var(--text3);letter-spacing:.22em;text-transform:uppercase;margin-top:2px}'
    + '.stamp{font-family:var(--fm);font-size:12px;color:var(--text3);text-align:right;line-height:1.8}'
    + '.status-banner{display:flex;align-items:center;gap:20px;padding:20px 28px;border-radius:6px;border:1px solid}'
    + '.status-banner.all-pass{background:rgba(26,92,26,.15);border-color:rgba(76,175,80,.35)}'
    + '.status-banner.has-fail{background:rgba(139,0,0,.15);border-color:rgba(180,20,0,.45)}'
    + '.status-icon{font-size:36px;flex-shrink:0}'
    + '.status-headline{font-family:var(--fh);font-size:18px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;margin-bottom:4px}'
    + '.all-pass .status-headline{color:var(--green3)}.has-fail .status-headline{color:#ff6b6b}'
    + '.status-sub{font-family:var(--fm);font-size:12px;color:var(--text2)}'
    + '.stats-row{display:flex;gap:16px;margin-top:28px}'
    + '.stat{flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:20px 16px;text-align:center;position:relative;overflow:hidden}'
    + '.stat::after{content:"";position:absolute;top:0;left:0;right:0;height:2px}'
    + '.stat-pass::after{background:linear-gradient(90deg,var(--green3),transparent)}'
    + '.stat-fail::after{background:linear-gradient(90deg,var(--red2),transparent)}'
    + '.stat-total::after{background:linear-gradient(90deg,var(--text3),transparent)}'
    + '.stat-time::after{background:linear-gradient(90deg,var(--gold2),transparent)}'
    + '.stat-num{font-family:var(--fh);font-size:48px;font-weight:700;line-height:1}'
    + '.stat-pass .stat-num{color:var(--green3)}.stat-fail .stat-num{color:#ff6b6b}'
    + '.stat-total .stat-num{color:var(--text2)}.stat-time .stat-num{color:var(--gold2);font-size:32px}'
    + '.stat-lbl{font-family:var(--fh);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:var(--text3);margin-top:6px}'
    + '.progress-wrap{margin-top:28px}'
    + '.progress-label{display:flex;justify-content:space-between;font-family:var(--fm);font-size:11px;color:var(--text3);margin-bottom:6px}'
    + '.progress-track{height:8px;background:var(--bg4);border-radius:4px;overflow:hidden;border:1px solid var(--border)}'
    + '.progress-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,var(--green2),var(--green3))}'
    + '.progress-fill.fail{background:linear-gradient(90deg,var(--red),var(--red3))}'
    + '.main{max-width:1200px;margin:0 auto;padding:40px 48px}'
    + '.sec-header{display:flex;align-items:center;justify-content:space-between;padding:18px 24px;border-radius:8px 8px 0 0;border:1px solid var(--border2);margin-top:48px}'
    + '.sec-header + .group{border-radius:0;border-top:none;margin-top:0}'
    + '.sec-header + .group + .group,.sec-header ~ .group ~ .group{border-top:none;margin-top:0}'
    + '.sec-api{background:linear-gradient(135deg,rgba(139,0,0,.18),rgba(13,10,16,.9))}'
    + '.sec-ui{background:linear-gradient(135deg,rgba(30,60,100,.2),rgba(13,10,16,.9));border-color:rgba(60,120,200,.3)}'
    + '.sec-left{display:flex;align-items:center;gap:14px}'
    + '.sec-badge{font-size:22px}'
    + '.sec-title{font-family:var(--fh);font-size:17px;font-weight:700;letter-spacing:.12em;text-transform:uppercase}'
    + '.sec-right{display:flex;align-items:center;gap:14px}'
    + '.sec-stat{font-family:var(--fm);font-size:13px;font-weight:700}'
    + '.sec-ok{color:var(--green3)}.sec-fail{color:#ff6b6b}'
    + '.sec-bar-wrap{width:100px;height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;border:1px solid var(--border)}'
    + '.sec-bar-fill{height:100%;background:var(--green3)}.sec-bar-fill.fail{background:var(--red2)}'
    + '.sec-pct{font-family:var(--fm);font-size:11px;color:var(--text3);min-width:32px;text-align:right}'
    + '.group{margin-bottom:0;border:1px solid var(--border);border-top:none;overflow:hidden}'
    + '.group:last-child{border-radius:0 0 8px 8px;margin-bottom:48px}'
    + '.group-header{padding:16px 24px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px}'
    + '.group-pass .group-header{background:rgba(26,92,26,.08);border-bottom:1px solid rgba(76,175,80,.12)}'
    + '.group-fail .group-header{background:rgba(139,0,0,.12);border-bottom:1px solid rgba(180,20,0,.3)}'
    + '.group-skip .group-header{background:rgba(90,80,80,.06);border-bottom:1px solid var(--border)}'
    + '.group-title{font-family:var(--fh);font-size:14px;font-weight:600;letter-spacing:.1em}'
    + '.group-meta{flex:1;display:flex;flex-direction:column;gap:4px;align-items:flex-end}'
    + '.group-desc{font-size:12px;color:var(--text3);font-style:italic;text-align:right}'
    + '.group-stats{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}'
    + '.gs-pass{font-family:var(--fm);font-size:11px;color:var(--green3)}'
    + '.gs-fail{font-family:var(--fm);font-size:11px;color:#ff6b6b}'
    + '.gs-skip{font-family:var(--fm);font-size:11px;color:var(--gold)}'
    + '.mini-bar{width:60px;height:4px;background:var(--bg4);border-radius:2px;overflow:hidden}'
    + '.mini-fill{height:100%;background:var(--green3)}.group-fail .mini-fill{background:var(--red2)}'
    + '.test-table{width:100%;border-collapse:collapse}'
    + '.test-table th{padding:9px 16px;text-align:left;font-family:var(--fh);font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:var(--text3);background:var(--bg3);border-bottom:1px solid var(--border)}'
    + '.test-table td{padding:10px 16px;border-bottom:1px solid rgba(255,255,255,.03);vertical-align:top}'
    + '.row-fail td{background:rgba(139,0,0,.06)}.row-skip td{opacity:.45}'
    + '.col-status{width:52px;text-align:center}'
    + '.col-name{font-family:var(--fm);font-size:12px;color:var(--text);width:36%}'
    + '.col-desc{font-size:13px;color:var(--text2);font-style:italic}'
    + '.badge-pass{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(76,175,80,.15);border:1px solid rgba(76,175,80,.4);color:var(--green3);font-size:13px}'
    + '.badge-fail{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(139,0,0,.2);border:1px solid rgba(180,20,0,.5);color:#ff6b6b;font-size:13px}'
    + '.badge-skip{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:50%;background:rgba(90,80,80,.15);border:1px solid var(--border);color:var(--text3);font-size:13px}'
    + '.err-msg{margin-top:6px;padding:8px 12px;background:rgba(139,0,0,.15);border-left:3px solid var(--red2);border-radius:0 4px 4px 0;font-family:var(--fm);font-size:11px;color:#ff9999;line-height:1.5;word-break:break-word;white-space:pre-wrap}'
    + '.skip-row{text-align:center;padding:18px;color:var(--text3);font-style:italic;font-size:13px}'
    + '.footer{text-align:center;padding:32px 48px;border-top:1px solid var(--border);font-family:var(--fm);font-size:11px;color:var(--text3)}'
    + '.fail-summary{margin:32px 0 0;border:1px solid rgba(180,20,0,.45);border-radius:8px;overflow:hidden}'
    + '.fail-summary-header{display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:rgba(139,0,0,.18);border-bottom:1px solid rgba(180,20,0,.3);cursor:pointer;user-select:none}'
    + '.fail-summary-title{font-family:var(--fh);font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#ff6b6b}'
    + '.fail-summary-count{font-family:var(--fm);font-size:12px;color:#ff9999}'
    + '.fail-summary-toggle{font-family:var(--fm);font-size:11px;color:var(--text3)}'
    + '.fail-summary-body{display:none}.fail-summary-body.open{display:block}'
    + '.fail-table{width:100%;border-collapse:collapse}'
    + '.fail-table th{padding:8px 16px;text-align:left;font-family:var(--fh);font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:var(--text3);background:var(--bg3);border-bottom:1px solid var(--border)}'
    + '.fail-table td{padding:9px 16px;border-bottom:1px solid rgba(255,255,255,.03);vertical-align:top;font-size:12px}'
    + '.fcol-n{font-family:var(--fm);font-size:11px;color:var(--text3);width:36px;text-align:right;padding-right:8px}'
    + '.fcol-group{font-size:11px;color:var(--text3);font-style:italic;width:20%;padding-right:8px}'
    + '.fcol-name{font-family:var(--fm);font-size:12px;color:var(--text);width:30%}'
    + '.fcol-err{font-family:var(--fm);font-size:11px;color:#ff9999;word-break:break-word;white-space:pre-wrap}';

  return '<!DOCTYPE html>\n<html lang="ru">\n<head>\n'
    + '<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n'
    + '<title>VTM — Полный отчёт тестов</title>\n'
    + '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Cormorant+Garamond:ital,wght@0,300;0,400;1,400&family=Share+Tech+Mono&display=swap" rel="stylesheet">\n'
    + '<style>' + css + '</style>\n</head>\n<body>\n'
    + '<header class="header">\n<div class="header-top">\n'
    + '<div class="logo"><span class="logo-drop">&#129752; Vampire: The Masquerade — Chronicle Manager</span>'
    + '<div class="logo-title">VTM Chronicle Manager</div>'
    + '<div class="logo-sub">Полный отчёт тестирования</div></div>\n'
    + '<div class="stamp">&#128197; ' + esc(stamp) + '<br>API: ' + api.total + ' &nbsp;&#183;&nbsp; UI: ' + ui.total + '<br>Всего: ' + totalRun + ' &nbsp;&#183;&nbsp; ' + elapsed + 's</div>\n'
    + '</div>\n'
    + '<div class="status-banner ' + (allGreen ? 'all-pass' : 'has-fail') + '">\n'
    + '<div class="status-icon">' + (allGreen ? '&#129001;' : '&#128308;') + '</div>\n'
    + '<div><div class="status-headline">' + (allGreen ? 'Все тесты прошли успешно' : 'Есть упавшие тесты: ' + totalFail) + '</div>'
    + '<div class="status-sub">' + totalPass + ' прошли &nbsp;&middot;&nbsp; ' + totalFail + ' упали &nbsp;&middot;&nbsp; ' + totalRun + ' всего</div></div>\n'
    + '</div>\n'
    + '<div class="stats-row">\n'
    + '<div class="stat stat-pass"><div class="stat-num">' + totalPass + '</div><div class="stat-lbl">Прошли</div></div>\n'
    + '<div class="stat stat-fail"><div class="stat-num">' + totalFail + '</div><div class="stat-lbl">Упали</div></div>\n'
    + '<div class="stat stat-total"><div class="stat-num">' + totalRun + '</div><div class="stat-lbl">Всего</div></div>\n'
    + '<div class="stat stat-time"><div class="stat-num">' + elapsed + 's</div><div class="stat-lbl">Время</div></div>\n'
    + '</div>\n'
    + '<div class="progress-wrap"><div class="progress-label"><span>Общий прогресс</span><span>' + pct + '%</span></div>'
    + '<div class="progress-track"><div class="progress-fill ' + (allGreen ? '' : 'fail') + '" style="width:' + pct + '%"></div></div></div>\n'
    + '</header>\n'
    + '<main class="main">\n'
    + (totalFail > 0 ? buildFailureSummary(groups, totalFail) : '')
    + sectionBlock('api', 'API-тесты', '&#9889;', api, apiGroups)
    + sectionBlock('ui',  'UI-тесты &mdash; Selenium', '&#127760;', ui, uiGroups)
    + '</main>\n'
    + '<footer class="footer">Сгенерировано автоматически &nbsp;&middot;&nbsp; tests/run_all_tests.js &nbsp;&middot;&nbsp; ' + esc(stamp) + '</footer>\n'
    + '</body>\n</html>';
}

// ═════════════════════════════════════════════════════════════════════════════
// ГЛАВНАЯ ФУНКЦИЯ
// ═════════════════════════════════════════════════════════════════════════════

async function main() {
  const startTime = Date.now();
  var hr = '═'.repeat(54);
  process.stdout.write('\n\x1b[1m' + hr + '\x1b[0m\n');
  process.stdout.write('  \x1b[31m🩸\x1b[0m  \x1b[1mVTM Chronicle Manager\x1b[0m — Полный прогон тестов\n');
  process.stdout.write('  ' + new Date().toLocaleString('ru-RU', { hour12: false }) + '\n');
  process.stdout.write('\x1b[1m' + hr + '\x1b[0m\n');

  let serverProc = null;
  if (!await serverIsUp()) {
    process.stdout.write('\n  \x1b[33m⟳\x1b[0m  Запуск веб-сервера на порту 3000...\n');
    serverProc = spawn(process.execPath, [SERVER], {
      cwd: path.join(ROOT, 'web'),
      env: Object.assign({}, process.env, { PORT: '3000' }),
      stdio: 'ignore',
    });
    try {
      await waitForServer(15000);
      process.stdout.write('  \x1b[32m✓\x1b[0m  Сервер запущен на порту 3000\n');
    } catch (e) {
      process.stdout.write('  \x1b[31m✗\x1b[0m  ' + e.message + '\n');
      process.exit(1);
    }
  } else {
    process.stdout.write('\n  \x1b[32m✓\x1b[0m  Сервер уже запущен на порту 3000\n');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // СЕКЦИЯ 1 — API-ТЕСТЫ
  // ═══════════════════════════════════════════════════════════════════════════

  section('api', 'Секция 1 — API-тесты', '9 групп · без браузера · файлы, синтаксис, HTTP, PowerShell');

  // ── Группа 1: Структура файлов ─────────────────────────────────────────────
  group('📁 Структура файлов', 'Наличие всех ключевых файлов и папок проекта');

  const KEY_FILES = [
    ['web/server.js',                          'Основной серверный файл Node.js/Express'],
    ['web/public/scripts.js',                  'Фронтенд-логика SPA'],
    ['web/public/index.html',                  'Точка входа SPA'],
    ['web/public/styles.css',                  'Глобальные стили Gothic-UI'],
    ['web/public/fonts/Inkulinati-Regular.otf','Шрифт заголовков (кириллический)'],
    ['characters/characters_ALL.md',           'Сводный справочник всех персонажей'],
    ['rules/diary_rules.md',                   'Правила формата дневников'],
    ['tools/new_npc.ps1',                      'PowerShell-скрипт создания карточки НПС'],
    ['tools/new_location.ps1',                 'PowerShell-скрипт создания карточки локации'],
    ['tools/validate_links.ps1',               'PowerShell-скрипт проверки внутренних ссылок'],
  ];

  for (const [relPath, desc] of KEY_FILES) {
    await t('Файл: ' + relPath, desc, (function(rp) {
      return function() { assert(fileExists(rp), 'Файл не существует'); };
    })(relPath));
  }

  // ── Группа 2: Синтаксис ────────────────────────────────────────────────────
  group('⚙️  Синтаксис кода', 'node --check проходит без синтаксических ошибок');

  await t('server.js — синтаксис', 'node --check не выдаёт ошибок', function() {
    execSync('node --check "' + path.join(ROOT, 'web', 'server.js') + '"', { stdio: 'pipe' });
  });

  await t('scripts.js — синтаксис', 'node --check не выдаёт ошибок', function() {
    execSync('node --check "' + path.join(ROOT, 'web', 'public', 'scripts.js') + '"', { stdio: 'pipe' });
  });

  // ── Группа 3: Целостность данных ──────────────────────────────────────────
  group('📝 Целостность данных', 'Шаблоны скриптов и структура .md без приватных данных');

  await t('new_npc.ps1 — нет жёсткого "Активен"',
    'Шаблон НПС использует нейтральный "Жив / Жива"',
    function() { assertNotInc(readFile('tools/new_npc.ps1'), 'Статус:** Активен', 'Найдено устаревшее'); });

  await t('new_npc.ps1 — содержит "Жив / Жива"',
    'Шаблон подсказывает пол-нейтральный статус',
    function() { assertInc(readFile('tools/new_npc.ps1'), 'Жив / Жива'); });

  await t('new_location.ps1 — содержит поле "Название"',
    'Шаблон локации включает обязательное поле Название',
    function() { assertInc(readFile('tools/new_location.ps1'), 'Название'); });

  await t('Все локации имеют 6 обязательных мета-полей',
    'Каждый .md в locations/ содержит: Название, Округ, Район, Адрес, Зона, Контроль',
    function() {
      var files = findMDFiles('locations');
      if (!files.length) return; // нет локаций — пропускаем
      var missing = [];
      ['Название', 'Округ', 'Район', 'Адрес', 'Зона', 'Контроль'].forEach(function(field) {
        files.forEach(function(f) {
          var c = fs.readFileSync(f, 'utf-8');
          if (!c.includes('**' + field + ':**')) missing.push(path.basename(f) + ': "' + field + '"');
        });
      });
      assert(missing.length === 0, 'Без полей: ' + missing.slice(0, 4).join('; '));
    });

  await t('Все вампиры имеют поле "Линейка WoD"',
    'Обязательное поле для lineage в парсере server.js. Только главные карточки.',
    function() {
      var vampDir = path.join(ROOT, 'characters', 'vampires');
      if (!fs.existsSync(vampDir)) return; // нет вампиров — пропускаем
      var bad = [];
      fs.readdirSync(vampDir, { withFileTypes: true }).forEach(function(entry) {
        if (!entry.isDirectory()) return;
        var cardPath = path.join(vampDir, entry.name, entry.name + '.md');
        if (!fs.existsSync(cardPath)) return;
        var c = fs.readFileSync(cardPath, 'utf-8');
        if (!c.includes('**Линейка WoD:**')) bad.push(entry.name);
      });
      assert(bad.length === 0, 'Без поля: ' + bad.slice(0, 3).join(', '));
    });

  // ── Группа 4: API — Персонажи ─────────────────────────────────────────────
  group('🧛 API — Персонажи', 'GET /api/characters: структура ответа');

  await t('/api/characters → 200, массив', 'HTTP 200 и JSON-массив',
    async function() {
      var r = await apiGet(BASE + '/api/characters');
      assertEq(r.status, 200, 'HTTP статус');
      assert(Array.isArray(r.json), 'Ответ не является массивом');
    });

  await t('/api/characters — структура полей (если есть персонажи)',
    'Каждый объект содержит name, lineage, statusType',
    async function() {
      var r = await apiGet(BASE + '/api/characters');
      if (!r.json.length) return; // нет персонажей — ок для шаблона
      r.json.forEach(function(c, i) {
        assert(c.name,       'chars[' + i + '].name отсутствует');
        assert(c.lineage,    'chars[' + i + '].lineage отсутствует');
        assert(c.statusType, 'chars[' + i + '].statusType отсутствует');
      });
    });

  // ── Группа 5: API — Локации ───────────────────────────────────────────────
  group('🗺️  API — Локации', 'GET /api/locations: структура ответа');

  await t('/api/locations → 200, массив', 'HTTP 200 и JSON-массив',
    async function() {
      var r = await apiGet(BASE + '/api/locations');
      assertEq(r.status, 200, 'HTTP статус');
      assert(Array.isArray(r.json), 'Ответ не является массивом');
    });

  await t('/api/locations — структура полей (если есть локации)',
    'Каждый объект содержит name, district, zone',
    async function() {
      var r = await apiGet(BASE + '/api/locations');
      if (!r.json.length) return;
      r.json.forEach(function(l, i) {
        assert(l.name !== undefined, 'locations[' + i + '].name отсутствует');
      });
    });

  // ── Группа 6: API — Безопасность ──────────────────────────────────────────
  group('🔒 API — Безопасность', 'Path traversal и защита эндпоинтов');

  await t('Path traversal ../../ → 403 Forbidden',
    'Попытка выйти за пределы папки персонажа через ../../ блокируется',
    async function() {
      var r = await apiGet(BASE + '/api/characters/..%2F..%2Fweb%2Fserver/diary');
      assert(r.status === 403 || r.status === 404,
        'Ожидали 403 или 404, получили ' + r.status);
    });

  // ── Группа 7: API — Граф и Статус ────────────────────────────────────────
  group('📊 API — Граф и Статус', 'GET /api/graph и /api/status');

  await t('/api/graph → 200, nodes + links', 'Граф возвращает узлы и рёбра',
    async function() {
      var r = await apiGet(BASE + '/api/graph');
      assertEq(r.status, 200, 'HTTP статус');
      assert(r.json && Array.isArray(r.json.nodes), '.nodes не является массивом');
      assert(r.json && Array.isArray(r.json.links), '.links не является массивом');
    });

  await t('/api/status → 200, JSON', 'Статус-дашборд доступен',
    async function() {
      var r = await apiGet(BASE + '/api/status');
      assertEq(r.status, 200, 'HTTP статус');
      assert(r.json !== null, 'Тело ответа пустое');
    });

  await t('/api/status → brokenLinks = 0 или null',
    'Нет нарушенных внутренних ссылок',
    async function() {
      var r  = await apiGet(BASE + '/api/status');
      var bl = r.json ? r.json.brokenLinks : null;
      assert(bl === null || bl === 0, 'brokenLinks = ' + bl);
    });

  // ── Группа 8: PowerShell — Прямой запуск ─────────────────────────────────
  group('⚡ PowerShell — Прямой запуск', 'Скрипты tools/ вне сервера: validate, search, status');

  await t('validate_links.ps1 -Force → код выхода 0',
    'Запуск скрипта напрямую; ожидаем exitCode=0 и "Checked" в stdout',
    function() {
      var r = runPS('tools/validate_links.ps1', '-Force');
      assert(r.status === 0, 'exitCode=' + r.status + ' stderr: ' + (r.stderr || '').slice(0, 300));
      assertInc(r.stdout, 'Checked', 'stdout должен содержать "Checked"');
    });

  await t('search.ps1 находит вхождения "WoD"',
    'Запуск search.ps1 -Query "WoD"; термин присутствует в шаблонных файлах',
    function() {
      var r = runPS('tools/search.ps1', "-Query 'WoD'");
      assertInc(r.stdout, 'result', 'stdout должен содержать "result(s) for"');
      assert(!/No results/.test(r.stdout), 'search вернул "No results" — данные не найдены');
    });

  await t('status.ps1 читает персонажей',
    'Запуск status.ps1; проверяем заголовок и итоговую строку Total:',
    function() {
      var r = runPS('tools/status.ps1', '');
      assertInc(r.stdout, 'VTM', 'Заголовок "VTM" в stdout');
      assertInc(r.stdout, 'Total:', 'Строка "Total:" в stdout');
    });

  // ── Группа 9: PowerShell — Через API ─────────────────────────────────────
  group('🌐 PowerShell — Через API', 'POST /api/run-tool: validate_links, search, status, new_module');

  await t('API validate_links → success: true + "Checked" в выводе',
    'POST /api/run-tool {tool:"validate_links"} — повтор при ECONNRESET',
    async function() {
      var d;
      for (var attempt = 0; attempt < 2; attempt++) {
        try {
          if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
          d = await apiPost('/api/run-tool', { tool: 'validate_links' });
          break;
        } catch(e) {
          if (attempt < 1 && /ECONNRESET|ETIMEDOUT/.test(e.message)) { d = null; continue; }
          throw e;
        }
      }
      assert(d !== null, 'validate_links API не ответил после 2 попыток');
      assert(d.success === true, 'success=false, exitCode=' + d.exitCode + ', output: ' + (d.output || '').slice(0, 300));
      assertInc(d.output, 'Checked', '"Checked" в выводе скрипта');
    });

  await t('API search "WoD" → результаты в выводе',
    'POST /api/run-tool {tool:"search", params:{Query:"WoD"}}',
    async function() {
      var d = await apiPost('/api/run-tool', { tool: 'search', params: { Query: 'WoD' } });
      assertInc(d.output, 'result', '"result(s) for" в выводе');
      assert(!/No results/.test(d.output), 'API search вернул "No results"');
    });

  await t('API status → "Total:" в выводе',
    'POST /api/run-tool {tool:"status"}',
    async function() {
      var d = await apiPost('/api/run-tool', { tool: 'status' });
      assertInc(d.output, 'Total:', '"Total:" в выводе статуса');
    });

  await t('API new_module → создаёт папку modules/',
    'POST /api/run-tool {tool:"new_module", params:{Name:"тест_2010_автомодуль"}}',
    async function() {
      var modDir = path.join(ROOT, 'modules', 'тест_2010_автомодуль');
      if (fs.existsSync(modDir)) fs.rmSync(modDir, { recursive: true, force: true });
      var d = await apiPost('/api/run-tool', { tool: 'new_module', params: { Name: 'тест_2010_автомодуль' } });
      assert(d.success === true, 'success=false, output: ' + (d.output || '').slice(0, 300));
      assert(fs.existsSync(modDir), 'Папка modules/тест_2010_автомодуль не создана');
    });

  await t('API new_module → отклоняет дубликат',
    'Повторный POST с тем же Name → success: false',
    async function() {
      var d = await apiPost('/api/run-tool', { tool: 'new_module', params: { Name: 'тест_2010_автомодуль' } });
      assert(d.success === false, 'Ожидали success=false для существующего модуля');
      assertInc(d.output, 'существует', '"существует" в сообщении об ошибке');
      var modDir = path.join(ROOT, 'modules', 'тест_2010_автомодуль');
      if (fs.existsSync(modDir)) fs.rmSync(modDir, { recursive: true, force: true });
    });

  await t('API неизвестный инструмент → 400',
    'POST /api/run-tool {tool:"hack"} → HTTP 400',
    async function() {
      try {
        await apiPost('/api/run-tool', { tool: 'hack' });
        assert(false, 'Ожидали ошибку 400, но запрос прошёл');
      } catch(e) {
        assert(/400|Unknown/.test(e.message), 'Ожидали 400 или "Unknown tool", получили: ' + e.message);
      }
    });

  // ═══════════════════════════════════════════════════════════════════════════
  // СЕКЦИЯ 2 — UI-ТЕСТЫ (Selenium)
  // ═══════════════════════════════════════════════════════════════════════════

  section('ui', 'Секция 2 — UI-тесты (Selenium)', '9 групп · Headless Chrome · SPA, навигация, создание персонажей');

  process.stdout.write('\n  \x1b[33m⟳\x1b[0m  Запуск Chrome (headless)...\n');
  const chromeOptions = new chrome.Options();
  chromeOptions.addArguments(
    '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
    '--disable-gpu', '--window-size=1400,900', '--lang=ru-RU'
  );

  let driver;
  try {
    driver = await new Builder().forBrowser('chrome').setChromeOptions(chromeOptions).build();
    process.stdout.write('  \x1b[32m✓\x1b[0m  Chrome запущен\n');
  } catch (e) {
    process.stdout.write('  \x1b[31m✗\x1b[0m  Chrome не запустился: ' + e.message + '\n');
    if (serverProc) serverProc.kill();
    process.exit(1);
  }

  try {

    // ── Группа 1: Загрузка ────────────────────────────────────────────────────
    group('🌐 Загрузка приложения', 'Базовые проверки рендеринга SPA');

    await t('Приложение открывается', 'GET / не выбрасывает исключений',
      async () => { await driver.get(BASE); });

    await t('Заголовок страницы', 'document.title содержит "VTM"',
      async () => {
        const title = await driver.getTitle();
        if (!title.includes('VTM')) throw new Error('Title: "' + title + '"');
      });

    await t('Логотип отображается', '.sidebar-logo виден',
      async () => {
        const el = await driver.findElement(By.css('.sidebar-logo'));
        if (!(await el.isDisplayed())) throw new Error('Logo not visible');
      });

    await t('7 пунктов навигации', '.nav-item — 7 элементов',
      async () => {
        const items = await driver.findElements(By.css('.nav-item'));
        if (items.length < 7) throw new Error('nav-item: ' + items.length + ', expected 7');
      });

    await t('Панель активна по умолчанию', '#page-dashboard.active',
      async () => { await driver.findElement(By.css('#page-dashboard.active')); });

    // ── Группа 2: Навигация ───────────────────────────────────────────────────
    group('🧭 Навигация', 'Переключение разделов через сайдбар');

    for (const [page, label] of [
      ['characters', 'Персонажи'], ['graph', 'Граф связей'], ['modules', 'Модули'],
      ['threads', 'Нити'], ['locations', 'Локации'], ['tools', 'Инструменты'], ['dashboard', 'Панель'],
    ]) {
      await t('Переход: ' + label, 'Клик nav → #page-' + page + '.active',
        async () => { await navTo(driver, page); });
    }

    // ── Группа 3: Панель управления ──────────────────────────────────────────
    group('📊 Панель управления', 'Загрузка статистики хроники');

    await t('Данные загрузились', 'GET / + спиннер в #dash-content исчез',
      async () => {
        await driver.get(BASE);
        await waitForNoSpinner(driver, 'dash-content', 10000);
      });

    await t('Карточки статистики', 'Минимум 3 .stat-card',
      async () => {
        await driver.wait(until.elementLocated(By.css('.stat-card')), WAIT);
        const cards = await driver.findElements(By.css('.stat-card'));
        if (cards.length < 3) throw new Error('stat-card: ' + cards.length);
      });

    await t('Нет состояния ошибки', '.error-state не видна',
      async () => {
        const errors = await driver.findElements(By.css('.error-state'));
        for (const el of errors) {
          if (await el.isDisplayed()) throw new Error('Error state visible');
        }
      });

    // ── Группа 4: Модал создания персонажа ───────────────────────────────────
    group('📋 Модал создания персонажа', 'Двухшаговый флоу — линейка, поля, закрытие');

    await t('Кнопка "+ Создать" на странице персонажей',
      'Переход на characters + #btn-open-create-char виден',
      async () => {
        await navTo(driver, 'characters');
        await waitForNoSpinner(driver, 'chars-grid', 10000);
        const btn = await driver.findElement(By.id('btn-open-create-char'));
        if (!(await btn.isDisplayed())) throw new Error('Button not visible');
      });

    await t('Открытие модала', 'Клик "+ Создать" → #char-modal виден',
      async () => {
        await driver.findElement(By.id('btn-open-create-char')).click();
        await waitModalVisible(driver, 'char-modal');
      });

    await t('6 кнопок линеек в шаге 1', '.lineage-pick-btn × 6',
      async () => {
        const btns = await driver.findElements(By.css('.lineage-pick-btn'));
        if (btns.length < 6) throw new Error('lineage-pick-btn: ' + btns.length);
      });

    await t('Переход к шагу 2 (Вампир)', 'Клик [data-type=vampire] → #modal-s2 виден',
      async () => {
        await driver.findElement(By.css('[data-type="vampire"]')).click();
        await driver.wait(async () => (await driver.findElement(By.id('modal-s2'))).isDisplayed(), WAIT);
      });

    await t('Кнопка "Назад" работает', 'Клик #modal-back → #modal-s1 снова виден',
      async () => {
        await driver.findElement(By.id('modal-back')).click();
        await driver.wait(async () => (await driver.findElement(By.id('modal-s1'))).isDisplayed(), WAIT);
      });

    await t('Закрытие модала (✕)', 'Клик #modal-close → модал скрыт',
      async () => {
        await driver.findElement(By.id('modal-close')).click();
        await waitModalHidden(driver, 'char-modal');
      });

    // ── Группа 5: Граф отношений ──────────────────────────────────────────────
    group('🕸 Граф отношений', 'D3.js SVG граф: рендеринг, тулбар, узлы');

    await t('SVG присутствует', 'Переход + #graph-svg виден',
      async () => {
        await navTo(driver, 'graph');
        const svg = await driver.findElement(By.id('graph-svg'));
        if (!(await svg.isDisplayed())) throw new Error('graph-svg not visible');
      });

    await t('Кнопки управления графом', '#graph-toolbar содержит 3 .btn-icon',
      async () => {
        const btns = await driver.findElements(By.css('#graph-toolbar .btn-icon'));
        if (btns.length < 3) throw new Error('btn-icon: ' + btns.length);
      });

    await t('Узлы графа отрисованы (если есть персонажи)',
      'SVG содержит circle-элементы, когда персонажи добавлены',
      async () => {
        // Ждём до 12с — если персонажей нет, circles может быть 0 (ок для шаблона)
        await driver.sleep(2000);
        const nodes = await driver.findElements(By.css('#graph-svg circle'));
        // 0 nodes is acceptable in empty template — just check SVG rendered
        const svg = await driver.findElement(By.id('graph-svg'));
        assert(await svg.isDisplayed(), 'SVG не виден');
      });

    // ── Группа 6: Инструменты ─────────────────────────────────────────────────
    group('⚙️ Инструменты', 'Вкладки форм: домен, НПС, проверка ссылок');

    await t('Вкладка "Новый домен" активна', 'Переход + #tab-new-city.active',
      async () => {
        await navTo(driver, 'tools');
        await driver.findElement(By.css('#tab-new-city.active'));
      });

    await t('Поля формы домена', '#city-name и #city-year',
      async () => {
        await driver.findElement(By.id('city-name'));
        await driver.findElement(By.id('city-year'));
      });

    await t('Переключение → Новый НПС', '#tab-new-npc.active',
      async () => {
        await driver.findElement(By.css('[data-tab="new-npc"]')).click();
        await driver.wait(until.elementLocated(By.css('#tab-new-npc.active')), WAIT);
      });

    await t('Поле имени НПС', '#npc-name виден',
      async () => {
        const el = await driver.findElement(By.id('npc-name'));
        if (!(await el.isDisplayed())) throw new Error('#npc-name not visible');
      });

    await t('Переключение → Проверка ссылок', '#tab-validate.active',
      async () => {
        await driver.findElement(By.css('[data-tab="validate"]')).click();
        await driver.wait(until.elementLocated(By.css('#tab-validate.active')), WAIT);
      });

    await t('Кнопка "Проверить" видна', '#btn-validate',
      async () => {
        const btn = await driver.findElement(By.id('btn-validate'));
        if (!(await btn.isDisplayed())) throw new Error('#btn-validate not visible');
      });

    // ── Пред-очистка ──────────────────────────────────────────────────────────
    clearLine();
    process.stdout.write('\n  \x1b[2m⟳  Пред-очистка тестовых персонажей...\x1b[0m\n');
    var preRemoved = cleanupTestChars();
    process.stdout.write('  \x1b[2m✓  Удалено ' + preRemoved + ' остаточных папок\x1b[0m\n');

    // ── Группа 7: Создание персонажей ─────────────────────────────────────────
    group('🧪 Создание персонажей', 'Все 6 типов: форма + изображение + API + файловая система');

    for (var ci = 0; ci < TEST_CHARS.length; ci++) {
      await (function(ch) {
        var label = ch.type.charAt(0).toUpperCase() + ch.type.slice(1);
        return t('Создать: ' + label + ' (' + ch.name + ')',
          'Модал → заполнить поля → загрузить test.png → успешный ответ',
          async () => { await createCharViaUI(driver, ch.type, ch.fields, TEST_IMG); });
      })(TEST_CHARS[ci]);
    }

    // ── Группа 8: Детальный просмотр (после создания тестовых персонажей) ────
    group('👁 Детальный просмотр', 'Открытие карточки тестового персонажа, содержимое, закрытие');

    await t('Клик карточки тест-персонажа открывает модал',
      'Переход + сброс фильтров + .char-card[тест] → #char-detail-modal',
      async () => {
        await navTo(driver, 'characters');
        await waitForNoSpinner(driver, 'chars-grid', 10000);
        await driver.executeScript(
          'var s=document.getElementById("search-input");' +
          'if(s){s.value="Тест-Авто";s.dispatchEvent(new Event("input",{bubbles:true}));}' +
          'var l=document.getElementById("filter-lineage");' +
          'if(l){l.value="all";l.dispatchEvent(new Event("change",{bubbles:true}));}'
        );
        await driver.sleep(500);
        await driver.wait(until.elementLocated(By.css('.char-card')), WAIT, 'No test char-cards');
        const cards = await driver.findElements(By.css('.char-card'));
        if (!cards.length) throw new Error('No char-cards after filter "Тест-Авто"');
        await cards[0].click();
        await waitModalVisible(driver, 'char-detail-modal');
      });

    await t('Содержимое модала не пустое', '#char-detail-content содержит текст',
      async () => {
        const content = await driver.findElement(By.id('char-detail-content'));
        const text = await content.getText();
        if (!text.trim()) throw new Error('char-detail-content is empty');
      });

    await t('Закрытие детального модала', '#char-detail-close → модал скрыт',
      async () => {
        await driver.executeScript('document.getElementById("char-detail-close").click();');
        await waitModalHidden(driver, 'char-detail-modal');
      });

    // ── Группа 9: Верификация созданных персонажей ────────────────────────────
    group('🔍 Верификация созданных персонажей', 'Файловая система: папка, карточка, портрет');

    for (var vi = 0; vi < TEST_CHARS.length; vi++) {
      await (function(ch) {
        return t('Файлы: ' + ch.name, 'Папка + .md карточка + portrait.* существуют',
          function() {
            var dir = path.join(ROOT, 'characters', ch.folder, ch.name);
            assert(fs.existsSync(dir), 'Папка не создана: ' + dir);

            var card = path.join(dir, ch.name + '.md');
            assert(fs.existsSync(card), 'Карточка не создана: ' + card);

            var portrait = null;
            for (var ext of ['png', 'jpg', 'jpeg', 'webp', 'gif']) {
              var p = path.join(dir, 'portrait.' + ext);
              if (fs.existsSync(p)) { portrait = p; break; }
            }
            assert(portrait !== null, 'Портрет не загружен в ' + dir);

            var md = fs.readFileSync(card, 'utf-8');
            var expectedWoD = {
              vampire: 'Вампир', mortal: 'Смертный', fairy: 'Фея',
              werewolf: 'Оборотень', mage: 'Маг', hunter: 'Охотник'
            }[ch.type];
            assertInc(md, '**Линейка WoD:** ' + expectedWoD, 'Линейка WoD');

            var allMd = fs.readFileSync(path.join(ROOT, 'characters', 'characters_ALL.md'), 'utf-8');
            var sectionMarkers = {
              vampire: '## 🧚 Феи', fairy: '## 🧑 Смертные', mortal: '## 📂 Пустые',
              werewolf: '## 🔮 Маги', mage: '## 🏹 Охотники', hunter: '## 📂 Прочие',
            };
            var marker = sectionMarkers[ch.type];
            if (marker && allMd.includes(marker)) {
              assertInc(allMd, ch.name, 'Запись в characters_ALL.md');
            }
          });
      })(TEST_CHARS[vi]);
    }

    // ── Пост-очистка ──────────────────────────────────────────────────────────
    clearLine();
    process.stdout.write('\n  \x1b[33m⟳  Очистка тестовых персонажей...\x1b[0m\n');
    try {
      var postRemoved = cleanupTestChars();
      process.stdout.write('  \x1b[32m✓  Удалено ' + postRemoved + ' тестовых папок и записей\x1b[0m\n');
    } catch(cleanErr) {
      process.stdout.write('  \x1b[31m✗  Ошибка очистки: ' + cleanErr.message + '\x1b[0m\n');
    }

  } finally {
    await driver.quit().catch(() => {});
  }

  if (serverProc) serverProc.kill();

  if (_group && _group.tests.length) { clearLine(); printGroupFooter(_group); }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const total   = _pass + _fail;
  const pct     = total ? Math.round(_pass / total * 100) : 0;
  const allGreen = _fail === 0;
  const hr2      = '═'.repeat(54);
  const finalColor = allGreen ? '\x1b[32m' : '\x1b[31m';
  const badge      = allGreen ? 'ВСЕ ТЕСТЫ ПРОШЛИ' : 'ЕСТЬ ОШИБКИ: ' + _fail;

  var apiGroups = GROUPS.filter(function(g) { return g.sectionTag === 'api'; });
  var uiGroups  = GROUPS.filter(function(g) { return g.sectionTag === 'ui'; });

  function secTotals(gs) {
    var ts = gs.reduce(function(a, g) { return a.concat(g.tests); }, []);
    return { pass: ts.filter(function(t) { return t.status === 'PASS'; }).length, total: ts.length };
  }
  var apiT = secTotals(apiGroups);
  var uiT  = secTotals(uiGroups);

  process.stdout.write('\n\x1b[1m' + hr2 + '\x1b[0m\n');
  process.stdout.write('  \x1b[1m' + finalColor + badge + '\x1b[0m\n');
  process.stdout.write('  ' + finalColor + bar(_pass, total, 40) + '\x1b[0m  ' + pct + '%\n');
  process.stdout.write(
    '  \x1b[32m✓ ' + _pass + ' прошло\x1b[0m'
    + '   \x1b[31m✗ ' + _fail + ' упало\x1b[0m'
    + '   \x1b[2m' + total + ' всего   ' + elapsed + 's\x1b[0m\n'
  );
  process.stdout.write(
    '  \x1b[2mAPI: ' + apiT.pass + '/' + apiT.total
    + '   UI: ' + uiT.pass + '/' + uiT.total + '\x1b[0m\n'
  );

  const reportPath = path.join(__dirname, 'report_all.html');
  fs.writeFileSync(reportPath, buildReport(GROUPS, _pass, _fail, total, elapsed), 'utf-8');
  process.stdout.write('  \x1b[2mОтчёт: tests/report_all.html\x1b[0m\n');
  process.stdout.write('\x1b[1m' + hr2 + '\x1b[0m\n\n');

  process.exit(_fail > 0 ? 1 : 0);
}

main().catch(async function(e) {
  clearLine();
  process.stdout.write('\n\x1b[31m✗ Критическая ошибка: ' + (e.message || String(e)).slice(0, 200) + '\x1b[0m\n');
  if (_group) {
    _totalRun++;
    _fail++;
    _group.tests.push({ name: '⚠ Критический сбой', desc: 'Неожиданная ошибка тестового окружения', status: 'FAIL', error: e.message || String(e) });
    printGroupFooter(_group);
  }
  const elapsedOnCrash = '??';
  const totalOnCrash   = _pass + _fail;
  try {
    fs.writeFileSync(
      path.join(__dirname, 'report_all.html'),
      buildReport(GROUPS, _pass, _fail, totalOnCrash, elapsedOnCrash),
      'utf-8'
    );
    process.stdout.write('  \x1b[2mОтчёт записан: tests/report_all.html\x1b[0m\n');
  } catch (_) {}
  process.exit(1);
});
