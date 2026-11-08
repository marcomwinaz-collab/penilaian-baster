/**
 * BACKEND PENILAIAN KARYAWAN BAKSO TERBANG
 * Google Apps Script yang menyimpan semua data di Google Sheets ini.
 *
 * Cara pakai singkat (lihat README.md untuk lengkapnya):
 *  1. Tempel file ini di Extensions > Apps Script pada Google Sheets baru.
 *  2. Jalankan fungsi `setup` sekali (izinkan akses).
 *  3. (Opsional) Tempel file DataAwal.gs lalu jalankan `isiDataAwal` sekali.
 *  4. Deploy > New deployment > Web app: Execute as "Me", Who has access "Anyone".
 *  5. Salin URL web app ke file config.js di GitHub.
 */

const SESSION_JAM = 6;            // lama sesi login (maks 6 jam, batas CacheService)
const N_INDIKATOR = 14;

const TABEL = {
  outlets:   { sheet: 'Outlet',    cols: ['id', 'nama', 'dibuat', 'diubah'] },
  karyawan:  { sheet: 'Karyawan',  cols: ['id', 'nama', 'outletId', 'outletNama', 'jabatan', 'kategori', 'aktif', 'dibuat', 'diubah', 'diubahOleh'] },
  penilaian: { sheet: 'Penilaian', cols: ['id', 'periode', 'karyawanId', 'nama', 'outletId', 'outletNama', 'kategori', 'jabatan']
                 .concat(Array.from({ length: N_INDIKATOR }, (_, i) => 'skor_' + (i + 1)))
                 .concat(['total', 'catatan', 'bobot', 'dibuat', 'dibuatOleh', 'diubah', 'diubahOleh']) },
  akun:      { sheet: 'Akun',      cols: ['id', 'nama', 'peran', 'aktif', 'salt', 'hash', 'dibuat', 'diubah', 'diubahOleh'] },
  settings:  { sheet: 'Pengaturan', cols: ['id', 'json', 'diubah', 'diubahOleh'] },
};
const KOLOM_ANGKA = /^(skor_\d+|total)$/;

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */
function setup() {
  Object.keys(TABEL).forEach(k => sheetOf_(k));
  const ss = SpreadsheetApp.getActive();
  const def = ss.getSheetByName('Sheet1') || ss.getSheetByName('Sheet 1') || ss.getSheetByName('Lembar1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);
  bumpVersion_();
  Logger.log('Setup selesai. Sheet: ' + Object.keys(TABEL).map(k => TABEL[k].sheet).join(', '));
}

function sheetOf_(coll) {
  const t = TABEL[coll];
  if (!t) throw new Error('Koleksi tidak dikenal: ' + coll);
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(t.sheet);
  if (!sh) {
    sh = ss.insertSheet(t.sheet);
    sh.getRange(1, 1, 1, t.cols.length).setValues([t.cols]).setFontWeight('bold').setBackground('#660000').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    if (coll === 'akun') sh.hideColumns(t.cols.indexOf('salt') + 1, 2);
  }
  return sh;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */
function doGet() {
  return json_({ ok: true, app: 'penilaian-baster', version: getVersion_() });
}

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'Permintaan tidak valid' }); }
  try {
    const a = req.action;
    if (a === 'status') return json_({ ok: true, perluSetup: rows_('akun').length === 0, version: getVersion_() });
    if (a === 'setup')  return json_(setupAkun_(req));
    if (a === 'login')  return json_(login_(req));

    const user = auth_(req.token);
    if (!user) return json_({ ok: false, error: 'SESI_HABIS' });

    if (a === 'ping')   return json_({ ok: true, version: getVersion_() });
    if (a === 'load')   return json_(load_(user));
    if (a === 'batch')  return json_(batch_(req.ops || [], user));
    if (a === 'logout') { CacheService.getScriptCache().remove('tok_' + req.token); return json_({ ok: true }); }
    return json_({ ok: false, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */
function hash_(salt, pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + pw, Utilities.Charset.UTF_8);
  return bytes.map(b => ('0' + ((b + 256) % 256).toString(16)).slice(-2)).join('');
}
function newToken_() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function startSession_(username) {
  const tok = newToken_();
  CacheService.getScriptCache().put('tok_' + tok, username, SESSION_JAM * 3600);
  return tok;
}
function auth_(token) {
  if (!token) return null;
  const c = CacheService.getScriptCache();
  const u = c.get('tok_' + token);
  if (u) c.put('tok_' + token, u, SESSION_JAM * 3600); // perpanjang
  return u;
}
function validUser_(u) { return /^[a-z0-9._-]{3,30}$/.test(u || ''); }

function login_(req) {
  const u = String(req.username || '').trim().toLowerCase();
  const a = rows_('akun').find(r => r.id === u);
  Utilities.sleep(300); // perlambat tebak-tebakan password
  if (!a || a.aktif === false || hash_(a.salt, String(req.password || '')) !== a.hash) return { ok: false, error: 'Username atau password salah.' };
  return { ok: true, token: startSession_(u), username: u };
}

function setupAkun_(req) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (rows_('akun').length) return { ok: false, error: 'Akun sudah ada. Silakan login.' };
    const u = String(req.username || '').trim().toLowerCase();
    if (!validUser_(u)) return { ok: false, error: 'Username tidak valid.' };
    if (String(req.password || '').length < 6) return { ok: false, error: 'Password minimal 6 karakter.' };
    const salt = Utilities.getUuid();
    put_('akun', u, { nama: req.nama || u, peran: 'HRD', aktif: true, salt: salt, hash: hash_(salt, req.password), dibuat: new Date().toISOString() });
    bumpVersion_();
    return { ok: true, token: startSession_(u), username: u };
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
function load_(user) {
  const st = rows_('settings').find(r => r.id === 'indikator');
  let indikator = null;
  try { indikator = st ? JSON.parse(st.json) : null; } catch (e) { indikator = null; }
  return {
    ok: true,
    version: getVersion_(),
    me: user,
    outlets: rows_('outlets'),
    karyawan: rows_('karyawan'),
    penilaian: rows_('penilaian'),
    akun: rows_('akun').map(a => ({ id: a.id, nama: a.nama, peran: a.peran, aktif: a.aktif })),
    indikator: indikator,
  };
}

function batch_(ops, user) {
  if (!Array.isArray(ops) || !ops.length) return { ok: false, error: 'Tidak ada data.' };
  if (ops.length > 500) return { ok: false, error: 'Terlalu banyak data sekaligus (maks 500).' };
  const lock = LockService.getScriptLock(); lock.waitLock(30000);
  try {
    const akun = rows_('akun');
    const me = akun.find(a => a.id === user);
    if (!me || me.aktif === false) return { ok: false, error: 'SESI_HABIS' };
    const prev = getVersion_();
    const now = new Date().toISOString();
    ops.forEach(op => {
      const coll = op.coll, id = String(op.id || '');
      if (!TABEL[coll]) throw new Error('Koleksi tidak dikenal: ' + coll);
      if (!/^[A-Za-z0-9_.:@+~-]{1,120}$/.test(id)) throw new Error('ID tidak valid: ' + id);
      if (op.op === 'del') {
        if (coll === 'akun' && id === user) throw new Error('Tidak bisa menghapus akun sendiri.');
        del_(coll, id);
        return;
      }
      let data = Object.assign({}, op.data || {});
      if (coll === 'akun') {
        const ex = akun.find(a => a.id === id);
        if (!validUser_(id)) throw new Error('Username tidak valid.');
        const pw = data.password; delete data.password;
        if (pw) {
          if (String(pw).length < 6) throw new Error('Password minimal 6 karakter.');
          data.salt = Utilities.getUuid(); data.hash = hash_(data.salt, pw);
        } else if (ex) { data.salt = ex.salt; data.hash = ex.hash; }
        else throw new Error('Password wajib untuk akun baru.');
        if (ex) data.dibuat = ex.dibuat; else data.dibuat = now;
      }
      if (coll === 'settings' && data.value !== undefined) { data.json = JSON.stringify(data.value); delete data.value; }
      data.diubah = now;
      if (TABEL[coll].cols.indexOf('diubahOleh') >= 0) data.diubahOleh = user;
      put_(coll, id, data);
    });
    const v = bumpVersion_();
    return { ok: true, version: v, prevVersion: prev };
  } finally { lock.releaseLock(); }
}

/* ------------------------------------------------------------------ */
/* Penyimpanan baris                                                   */
/* ------------------------------------------------------------------ */
function rows_(coll) {
  const sh = sheetOf_(coll), cols = TABEL[coll].cols;
  const n = sh.getLastRow() - 1;
  if (n < 1) return [];
  const vals = sh.getRange(2, 1, n, cols.length).getValues();
  return vals.filter(r => r[0] !== '' && r[0] !== null).map(r => fromRow_(coll, r));
}

function fromRow_(coll, r) {
  const cols = TABEL[coll].cols, o = {};
  cols.forEach((c, i) => {
    let v = r[i];
    if (v instanceof Date) v = v.toISOString();
    if (/^skor_\d+$/.test(c)) return;
    if (c === 'total') v = v === '' ? null : Number(v);
    else if (c === 'aktif') v = !(v === false || String(v).toUpperCase() === 'FALSE');
    else if (c === 'bobot') { try { v = v ? JSON.parse(v) : null; } catch (e) { v = null; } }
    else v = v === null || v === undefined ? '' : String(v);
    o[c] = v;
  });
  if (coll === 'penilaian') {
    o.skor = [];
    for (let i = 1; i <= N_INDIKATOR; i++) {
      const v = r[cols.indexOf('skor_' + i)];
      o.skor.push(v === '' || v === null || isNaN(Number(v)) ? null : Number(v));
    }
  }
  return o;
}

function toRow_(coll, id, d) {
  return TABEL[coll].cols.map(c => {
    if (c === 'id') return id;
    if (coll === 'penilaian' && /^skor_\d+$/.test(c)) {
      const v = (d.skor || [])[Number(c.split('_')[1]) - 1];
      return v === null || v === undefined || v === '' ? '' : Number(v);
    }
    if (c === 'bobot') return d.bobot ? JSON.stringify(d.bobot) : '';
    if (c === 'total') return d.total === null || d.total === undefined ? '' : Number(d.total);
    if (c === 'aktif') return d.aktif === false ? false : true;
    const v = d[c];
    return v === null || v === undefined ? '' : String(v);
  });
}

function formats_(coll) {
  return [TABEL[coll].cols.map(c => KOLOM_ANGKA.test(c) ? '0.##' : (c === 'aktif' ? 'General' : '@'))];
}

function findRow_(sh, id) {
  const n = sh.getLastRow() - 1;
  if (n < 1) return -1;
  const ids = sh.getRange(2, 1, n, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i++) if (ids[i][0] === id) return i + 2;
  return -1;
}

function put_(coll, id, data) {
  const sh = sheetOf_(coll), n = TABEL[coll].cols.length;
  let row = findRow_(sh, id);
  if (row < 0) row = sh.getLastRow() + 1;
  const rg = sh.getRange(row, 1, 1, n);
  rg.setNumberFormats(formats_(coll));
  rg.setValues([toRow_(coll, id, data)]);
}

function del_(coll, id) {
  const sh = sheetOf_(coll), row = findRow_(sh, id);
  if (row > 0) sh.deleteRow(row);
}

/* ------------------------------------------------------------------ */
/* Versi data (untuk update otomatis di browser)                      */
/* ------------------------------------------------------------------ */
function getVersion_() { return Number(PropertiesService.getScriptProperties().getProperty('version') || 0); }
function bumpVersion_() {
  const v = Date.now();
  PropertiesService.getScriptProperties().setProperty('version', String(v));
  return v;
}

/* Dipanggil dari DataAwal.gs */
function tulisBanyak_(coll, list) {
  const sh = sheetOf_(coll), n = TABEL[coll].cols.length;
  if (!list.length) return;
  const start = sh.getLastRow() + 1;
  const rg = sh.getRange(start, 1, list.length, n);
  rg.setNumberFormats(list.map(() => formats_(coll)[0]));
  rg.setValues(list.map(x => toRow_(coll, x.id, x)));
}
