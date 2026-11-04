/**
 * =========================================================================
 *  DASHBOARD JADWAL & ABSEN TOKO  —  v2 (cepat)
 * =========================================================================
 *  Perubahan utama dibanding v1:
 *  - 1 panggilan server per tanggal (getDayBundle) berisi SEMUA toko:
 *    pindah toko jadi instan karena data sudah ada di browser.
 *  - Cache dipecah per potongan (batas CacheService 100 KB/kunci tidak
 *    lagi membuat cache gagal diam-diam lalu baca spreadsheet terus).
 *  - Log foto di-cache dan hanya dibaca sekali, bukan tiap ganti toko.
 *  - Upload: folder Drive dicari sekali (ID disimpan), sharing diatur di
 *    folder (bukan per file), tanpa Session.getActiveUser().
 * =========================================================================
 */

const CONFIG = {
  SPREADSHEET_ID: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA',
  SHEET_NAME: 'Sheet1',
  TZ: 'Asia/Jakarta',

  // Tata letak sheet dibaca OTOMATIS (baris tanggal, kolom NIK/Nama/Jabatan/Lokasi,
  // jumlah hari). Angka di bawah hanya cadangan bila deteksi gagal.
  AUTO_DETECT: true,
  DATE_ROW: 3,            // baris angka tanggal (1-based)
  COL_NIK: 1,
  COL_NAMA: 2,
  COL_JABATAN: 3,         // jabatan boleh tidak ada di sheet
  COL_LOKASI: 4,
  COL_TANGGAL_START: 6,
  JUMLAH_TANGGAL: 30,

  // Batas maksimal foto laporan tiap shift (jam:menit WIB)
  DEADLINES: { pagi: '06:05', siang: '15:05', malam: '23:05' },

  // ---- JENIS LAPORAN + JAM TAMPIL TEMATIK (WIB). Foto hanya diterima di dalam jam ini. ----
  LAPORAN: {
    pagi:     { nama: 'Absen Buka Toko Shift 1 Pagi',  list: 'absen',    jam: ['05:00', '06:30'] },
    siang:    { nama: 'Absen Buka Toko Shift 2 Siang', list: 'absen',    jam: ['14:00', '15:30'] },
    malam:    { nama: 'Absen Buka Toko Shift 3 Malam', list: 'absen',    jam: ['22:00', '23:30'] },
    asa:      { nama: 'Laporan ASA',                   list: 'asa',      jam: ['21:00', '23:30'] },
    exp:      { nama: 'Laporan Tarik EXP H-1',         list: 'exp',      jam: ['21:00', '23:30'] },
    soundbox: { nama: 'Laporan LPJ Soundbox',          list: 'soundbox', jam: ['06:00', '07:00'] },
    tutup:    { nama: 'Laporan Tutup Toko',            list: 'tutup',    jam: ['22:50', '23:10'] },
    // LPJ Input PLN & Kardus Online: sistem sama seperti laporan lain (jam + tematik acak + foto ke Drive)
    pln:      { nama: 'Laporan LPJ Input PLN',         list: 'pln',      jam: ['07:00', '10:00'] },
    kardus:   { nama: 'Laporan Kardus Online',         list: 'kardus',   jam: ['06:00', '23:00'] },  // jam TEMATIK; pilihan: ada / tidak ada kiriman
    // Report 15/16: tanpa tematik, 1-2 foto digabung jadi satu gambar ringan, hanya tanggal 15 & 16
    report:   { nama: 'Laporan Report 15/16',          list: '',         jam: ['07:00', '08:00'], tanggal: [15, 16] },
    rak1:     { nama: 'Laporan Rak Harian Shift 1',    list: 'absen',     jam: ['00:01', '23:59'] },
    rak2:     { nama: 'Laporan Rak Harian Shift 2',    list: 'absen',     jam: ['00:01', '23:59'] },
    rak3:     { nama: 'Laporan Rak Harian Shift 3',    list: 'absen',     jam: ['00:01', '23:59'] },
    mingguan: { nama: 'Kebersihan Mingguan',           list: 'absen',     jam: ['00:01', '23:59'] },
  },
  // ---- RESET DATA FOTO BULANAN (menu Atur). Tematik & foto absen buka toko TIDAK ikut dihapus. ----
  RESET_PIN: '252525',
  RESET_JENIS: ['asa', 'exp', 'soundbox', 'pln', 'kardus', 'tutup', 'report'],   // tambah 'pagi','siang','malam' bila absen ingin ikut direset
  // false (disarankan) = toko SELALU bisa kirim foto kapan saja. Jam di atas hanya mengatur kapan TEMATIK diundi & tampil;
  // foto di luar jam / bukan hari ini tetap diterima, hanya tanpa tematik.
  // true = foto di luar jam (atau bukan hari ini) DITOLAK.
  JAM_KETAT: false,   // (tidak dipakai lagi: kunci jam sudah dihapus dari kode)
  // Toko 24 jam (kode awal lokasi) tidak wajib Laporan Tutup Toko:
  // Baratan Y207, Supriyadi Y073, A.Yani Y144, Dr. Wahidin Y214, Maesan Y015
  TOKO_24JAM: ['Y207', 'Y073', 'Y144', 'Y214', 'Y015'],

  // ---- LINK SPREADSHEET DAFTAR TEMATIK (isi link / ID; tab opsional; kolom berisi item, default A) ----
  // Daftar boleh diubah kapan saja; item baru langsung terbaca, item yang sudah terpakai tidak diulang
  // sampai semua item habis terpakai.
  TEMATIK_SUMBER: {   // semua laporan memakai tab 'TEMATIK' (kolom PLU | NAMA BARANG) di spreadsheet utama; diacak per laporan
    absen:    { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    asa:      { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    exp:      { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    soundbox: { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    tutup:    { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    pln:      { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    kardus:   { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    rak1:     { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    rak2:     { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    rak3:     { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
    mingguan: { url: '1XLWPJ2me7jQfBd7SekOnYV_JVAAPfyo_1LaqEsUIPgA', tab: 'TEMATIK', kol: 2 },
  },


  DRIVE_ROOT_FOLDER: 'Foto Absensi Toko',
  LOG_SHEET_NAME: 'LOG_FOTO',

  CACHE_SECONDS: 60,      // jadwal dibaca ulang dari sheet tiap 2 menit (tombol Refresh: langsung)
  LOG_CACHE_SECONDS: 300,  // log foto (otomatis dihapus saat upload/hapus)

  // Jika foto tidak tampil di dashboard setelah upload, ubah ke true
  // (artinya sharing diatur per file; lebih lambat ~1 detik per foto).
  SHARE_PER_FILE: false,

  // ---- PENYIMPANAN FOTO KE SERVER PRIBADI (OPSIONAL) ----
  // Kosongkan URL = semua foto ke Google Drive (default, seperti sebelumnya).
  // Isi URL endpoint upload (lihat upload.php) = foto laporan rak/kebersihan dikirim ke server,
  // link-nya dicatat ke spreadsheet. Jika server gagal, otomatis cadangan ke Drive.
  SERVER_UPLOAD: { URL: '', TOKEN: '' },
};

/* ------------------------------------------------------------------ */
/*  WEB APP                                                            */
/* ------------------------------------------------------------------ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Dashboard Jadwal & Absen Toko')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** Jalankan SEKALI dari editor Apps Script (untuk otorisasi + siapkan folder & log). */
function setupSekali() {
  const folder = getRootFolder_();
  const sh = getLogSheet_();
  ensureLogHeader_(sh);
  Object.keys(CONFIG.TEMATIK_SUMBER).forEach(function (k) {
    try { const l = readTemaList_(k); Logger.log('Tematik ' + k + ': ' + (l ? l.length + ' item' : 'LINK BELUM DIISI')); } catch (e) { Logger.log('Tematik ' + k + ' GAGAL dibaca: ' + e.message); }
  });
  Logger.log('Folder foto siap: ' + folder.getUrl());
  Logger.log('Tata letak sheet terdeteksi: ' + JSON.stringify(getScheduleData_().layout));
}

/* ------------------------------------------------------------------ */
/*  CACHE BERPOTONGAN                                                  */
/* ------------------------------------------------------------------ */

const CHUNK_ = 30000; // karakter per potongan (aman < 100 KB)

function cachePutBig_(key, obj, seconds) {
  try {
    const s = JSON.stringify(obj);
    const n = Math.ceil(s.length / CHUNK_) || 1;
    const m = {};
    m[key + '#n'] = String(n);
    for (let i = 0; i < n; i++) m[key + '#' + i] = s.substr(i * CHUNK_, CHUNK_);
    CacheService.getScriptCache().putAll(m, seconds);
  } catch (err) {}
}

function cacheGetBig_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const n = parseInt(cache.get(key + '#n'), 10);
    if (!n) return null;
    const keys = [];
    for (let i = 0; i < n; i++) keys.push(key + '#' + i);
    const got = cache.getAll(keys);
    let s = '';
    for (let i = 0; i < n; i++) {
      const part = got[key + '#' + i];
      if (part == null) return null;
      s += part;
    }
    return JSON.parse(s);
  } catch (err) {
    return null;
  }
}

function cacheRemoveBig_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const n = parseInt(cache.get(key + '#n'), 10) || 0;
    const keys = [key + '#n'];
    for (let i = 0; i < n; i++) keys.push(key + '#' + i);
    cache.removeAll(keys);
  } catch (err) {}
}

/* ------------------------------------------------------------------ */
/*  DATA JADWAL                                                        */
/* ------------------------------------------------------------------ */

function colLetter_(i) {
  let n = i + 1, out = '';
  while (n > 0) { const m = (n - 1) % 26; out = String.fromCharCode(65 + m) + out; n = Math.floor((n - 1) / 26); }
  return out;
}

/** Angka tanggal dari sel header: 5, "05", Date, atau teks seperti "Min 01" / "Min\n01". */
function parseDayNum_(v) {
  if (v instanceof Date) return v.getDate();
  if (v === '' || v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return NaN;
  const m = v.trim().match(/^(?:[A-Za-z]{3,6}[\s.,\-]*)?(\d{1,2})$/);
  return m ? Number(m[1]) : NaN;
}

/** Cari baris tanggal: deretan angka 1..31 berurutan (boleh lompat 31 -> 1), minimal 20 kolom. */
function detectDateRun_(values) {
  const maxR = Math.min(values.length, 12);
  let best = { row: -1, start: -1, len: 0 };
  for (let r = 0; r < maxR; r++) {
    const row = values[r];
    let start = -1, len = 0, prev = -1;
    for (let c = 0; c <= row.length; c++) {
      const v = c < row.length ? row[c] : '';
      const n = parseDayNum_(v);
      const ok = !isNaN(n) && n >= 1 && n <= 31 && n === Math.floor(n);
      const cont = ok && (len === 0 || n === prev + 1 || (prev >= 28 && n === 1));
      if (cont) { if (len === 0) start = c; len++; prev = n; }
      else {
        if (len > best.len) best = { row: r, start: start, len: len };
        if (ok) { start = c; len = 1; prev = n; } else { start = -1; len = 0; prev = -1; }
      }
    }
  }
  return best.len >= 20 ? best : null;
}

function getScheduleData_() {
  const cached = cacheGetBig_('SCHEDULE_DATA');
  if (cached && cached.layout) return cached;

  const ssAll = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ssAll.getSheetByName(CONFIG.SHEET_NAME);
  if (!sheet) { // nama sheet diganti? cari yang bernama jadwal, atau sheet pertama
    const all = ssAll.getSheets().filter(function (x) { return x.getName() !== CONFIG.LOG_SHEET_NAME; });
    sheet = all.filter(function (x) { return /jadwal/i.test(x.getName()); })[0] || all[0];
  }
  const lastRow = sheet.getLastRow();
  const lastCol = Math.min(sheet.getLastColumn(), 120);
  const values = sheet.getRange(1, 1, lastRow, lastCol).getValues();

  // ---- 1) baris & kolom tanggal
  let run = CONFIG.AUTO_DETECT ? detectDateRun_(values) : null;
  const auto = !!run;
  if (!run) run = { row: CONFIG.DATE_ROW - 1, start: CONFIG.COL_TANGGAL_START - 1, len: CONFIG.JUMLAH_TANGGAL };
  const dateRow = run.row, dStart = run.start, dLen = Math.min(run.len, 31);

  const dateNumRow = values[dateRow] || [];
  const dayNameRow = dateRow > 0 ? values[dateRow - 1] : [];
  const dateCols = [];
  for (let i = 0; i < dLen; i++) {
    const c = dStart + i;
    let hr = String(dayNameRow[c] || '').trim();
    const own = String(dateNumRow[c] || '').trim().match(/^([A-Za-z]{3,6})/);
    if (!hr && own) hr = own[1];
    dateCols.push({
      colIndex: i,
      sheetCol: c + 1,
      tanggal: parseDayNum_(dateNumRow[c]),
      iso: dateNumRow[c] instanceof Date ? Utilities.formatDate(dateNumRow[c], CONFIG.TZ, 'yyyy-MM-dd') : '',
      hari: hr ? hr.charAt(0).toUpperCase() + hr.substr(1, 2).toLowerCase() : '',
    });
  }

  // ---- 2) kolom identitas (dari teks header)
  const used = {};
  const headText = [];
  for (let c = 0; c < dStart; c++) {
    let t = '';
    for (let r = 0; r <= dateRow; r++) t += ' ' + String(values[r][c] || '').toLowerCase().trim();
    headText.push(t.trim());
  }
  function findCol(exact, loose) {
    for (let c = 0; c < headText.length; c++) if (!used[c] && exact.test(headText[c])) return c;
    for (let c = 0; c < headText.length; c++) if (!used[c] && loose.test(headText[c])) return c;
    return -1;
  }
  function pick(exact, loose, fallbackIdx) {
    let c = CONFIG.AUTO_DETECT ? findCol(exact, loose) : -1;
    if (c < 0 && fallbackIdx != null && fallbackIdx >= 0 && fallbackIdx < dStart && !used[fallbackIdx]) c = fallbackIdx;
    if (c >= 0) used[c] = true;
    return c;
  }
  const cNik = pick(/^nik$|^id( karyawan)?$/, /\bnik\b/, CONFIG.COL_NIK - 1);
  const cNama = pick(/^(nama|karyawan|pegawai|nama karyawan|nama lengkap)$/, /nama|name|karyawan|pegawai/, CONFIG.COL_NAMA - 1);
  const cLok = pick(/^(lokasi|toko|nama toko|store|outlet|unit)$/, /lokasi|toko|store|outlet|unit|cabang|site/, CONFIG.COL_LOKASI - 1);
  const cJab = pick(/^(jabatan|posisi|position)$/, /jabatan|posisi|position/, -1); // tanpa cadangan: jabatan opsional

  // ---- 3) baris karyawan
  const employees = [];
  const storeSet = {};
  let lastLok = '', noLok = 0;
  const canon = {};
  for (let r = dateRow + 1; r < lastRow; r++) {
    const row = values[r];
    // sel nama bisa berisi "NAMA" + baris baru + "Jabatan" (atau menempel): ambil nama saja
    const parts = (cNama >= 0 ? String(row[cNama] || '') : '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(Boolean);
    let nama = parts[0] || '';
    let jabatanTxt = parts.slice(1).join(' ');
    const tm = nama.match(/^(.*?)((?:Assistant\s+)?Chief\s+Of\s+Store|Assistant|Crew(?:\s+\w+)?|Supervisor|Internship)$/i);
    if (tm && tm[1].trim()) { nama = tm[1].trim(); if (!jabatanTxt) jabatanTxt = tm[2]; }
    if (!nama || /^(nama|karyawan)( karyawan)?$/i.test(nama)) continue;
    const nik = cNik >= 0 ? String(row[cNik] || '').trim() : '';
    let lokasi = cLok >= 0 ? String(row[cLok] || '').replace(/\s+/g, ' ').trim() : '';
    if (!lokasi) lokasi = lastLok; else lastLok = lokasi;       // sel lokasi digabung/kosong: ikut baris atas
    if (lokasi) { const lk = lokasi.toUpperCase(); if (!canon[lk]) canon[lk] = lokasi; lokasi = canon[lk]; } else noLok++; // "AYANI" = "Ayani "

    const jabatan = (cJab >= 0 ? String(row[cJab] || '').trim() : '') || jabatanTxt;
    const shifts = [];
    for (let i = 0; i < dLen; i++) {
      const raw = row[dStart + i];
      shifts.push(raw ? String(raw).trim() : '');
    }
    employees.push({ nik: nik, nama: nama, jabatan: jabatan, lokasi: lokasi, shifts: shifts });
    if (lokasi) storeSet[lokasi] = true;
  }

  const warnings = [];
  if (cNama < 0) warnings.push('Kolom Nama tidak ditemukan di spreadsheet.');
  if (cLok < 0) warnings.push('Kolom Lokasi/Toko tidak ditemukan di spreadsheet.');
  if (noLok) warnings.push(noLok + ' karyawan tanpa lokasi toko (diabaikan).');
  const unk = {};
  employees.forEach(function (e) { e.shifts.forEach(function (k) { if (k && classifyShift_(k).group === 'lainnya') unk[k] = true; }); });
  if (Object.keys(unk).length) warnings.push('Kode shift tidak dikenal: ' + Object.keys(unk).slice(0, 8).join(', '));

  const data = {
    dateCols: dateCols,
    employees: employees,
    stores: Object.keys(storeSet).sort(),
    warnings: warnings,
    layout: {
      sheet: sheet.getName(),
      otomatis: auto,
      barisTanggal: dateRow + 1,
      barisData: dateRow + 2,
      kolomTanggalMulai: colLetter_(dStart),
      jumlahHari: dLen,
      nik: cNik >= 0 ? colLetter_(cNik) : '-',
      nama: cNama >= 0 ? colLetter_(cNama) : '-',
      jabatan: cJab >= 0 ? colLetter_(cJab) : '-',
      lokasi: cLok >= 0 ? colLetter_(cLok) : '-',
      karyawan: employees.length,
    },
    generatedAt: new Date().toISOString(),
  };
  cachePutBig_('SCHEDULE_DATA', data, CONFIG.CACHE_SECONDS);
  return data;
}

function classifyShift_(code) {
  if (!code || /^[\s\-\u2013\u2014_.\/]*$/.test(String(code))) return { group: 'kosong', label: '-', jam: '' };
  const c = String(code).trim().toUpperCase().replace(/[\s.\-_]/g, '');

  if (c === 'OFF' || c === 'L' || c === 'LIBUR') return { group: 'libur', label: 'Libur', jam: '' };
  if (c === 'CUTI' || c === 'IZIN') return { group: 'cuti', label: 'Cuti / Izin', jam: '' };
  if (c === 'PAGI') return { group: 'pagi', label: 'Pagi', jam: '' };
  if (c === 'SIANG') return { group: 'siang', label: 'Siang', jam: '' };
  if (c === 'MALAM') return { group: 'malam', label: 'Malam', jam: '' };
  if (c === 'O') return { group: 'libur', label: 'Libur', jam: '' };
  if (c === 'C') return { group: 'cuti', label: 'Cuti / Izin', jam: '' };
  if (c === 'AO') return { group: 'libur_tambahan', label: 'Libur Tambahan', jam: '' };

  // P7 / S15 / M23  (angka jam mulai opsional)
  const m = c.match(/^([PSM])(\d{0,2})$/);
  if (m) {
    const jam = m[2] ? m[2].padStart(2, '0') + ':00' : '';
    const group = m[1] === 'P' ? 'pagi' : (m[1] === 'S' ? 'siang' : 'malam');
    const label = group === 'pagi' ? 'Pagi' : (group === 'siang' ? 'Siang' : 'Malam');
    return { group: group, label: label, jam: jam };
  }

  // Cadangan: kode angka shift 1 / 2 / 3
  if (c === '1') return { group: 'pagi', label: 'Pagi', jam: '' };
  if (c === '2') return { group: 'siang', label: 'Siang', jam: '' };
  if (c === '3') return { group: 'malam', label: 'Malam', jam: '' };

  return { group: 'lainnya', label: c, jam: '' };
}

function namaHariPanjang_(kodeHari) {
  const map = { Sen: 'Senin', Sel: 'Selasa', Rab: 'Rabu', Kam: 'Kamis', Jum: "Jum'at", Sab: 'Sabtu', Min: 'Minggu' };
  return map[kodeHari] || kodeHari;
}

/* ------------------------------------------------------------------ */
/*  PERIODE                                                            */
/* ------------------------------------------------------------------ */

function getPeriodSettings() {
  const startDate = PropertiesService.getScriptProperties().getProperty('PERIOD_START_DATE');
  return { startDate: startDate || null };
}

function savePeriodSettings(startDateStr) {
  const props = PropertiesService.getScriptProperties();
  if (!startDateStr) props.deleteProperty('PERIOD_START_DATE');
  else props.setProperty('PERIOD_START_DATE', startDateStr);
  return getPeriodSettings();
}

/**
 * Menentukan kolom "hari ini" TANPA bergantung pada pengaturan manual:
 * 1) kolom yang angka tanggalnya sama dengan tanggal hari ini (prioritas yang
 *    nama harinya juga cocok), 2) cadangan: tanggal awal di Pengaturan.
 * Tanggal kalender kolom lain dihitung mundur/maju dari hari ini.
 */
function resolveToday_(data, period) {
  const tz = CONFIG.TZ, now = new Date();
  const iso = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const todayMid = new Date(iso + 'T00:00:00');
  const day = parseInt(Utilities.formatDate(now, tz, 'd'), 10);
  const kodeHari = ['', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'][parseInt(Utilities.formatDate(now, tz, 'u'), 10)];
  const based = function (idx) { const b = new Date(todayMid.getTime()); b.setDate(b.getDate() - idx); return b; };

  const hit = data.dateCols.filter(function (d) { return d.iso === iso; })[0];
  if (hit) return { idx: hit.colIndex, base: based(hit.colIndex), warn: '' };

  const cands = data.dateCols.filter(function (d) { return parseInt(d.tanggal, 10) === day; });
  if (cands.length) {
    const exact = cands.filter(function (d) { return String(d.hari).trim() === kodeHari; })[0];
    const pick = exact || cands[0];
    let warn = '';
    if (pick.iso && pick.iso !== iso) warn = 'Tanggal di spreadsheet (' + pick.iso + ') bukan hari ini. Pastikan jadwal sudah periode bulan ini.';
    else if (!exact && String(pick.hari).trim()) warn = 'Nama hari di spreadsheet (' + pick.hari + ') tidak cocok dengan hari ini (' + kodeHari + '). Kemungkinan jadwal masih periode bulan lalu.';
    return { idx: pick.colIndex, base: based(pick.colIndex), warn: warn };
  }
  if (period && period.startDate) {
    const base = new Date(period.startDate + 'T00:00:00');
    const diff = Math.round((todayMid - base) / 86400000);
    return { idx: (diff >= 0 && diff < data.dateCols.length) ? diff : 0, base: base, warn: '' };
  }
  return { idx: 0, base: null, warn: 'Tanggal ' + day + ' tidak ditemukan di spreadsheet jadwal.' };
}

function realOf_(d, base) { return d.iso || realIso_(base, d.colIndex); }
function dayShort_(iso) { return ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][new Date(iso + 'T12:00:00').getDay()]; }

function realIso_(base, ci) {
  if (!base) return '';
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + ci);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/* ------------------------------------------------------------------ */
/*  LOG FOTO                                                           */
/* ------------------------------------------------------------------ */

function getLogSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CONFIG.LOG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.LOG_SHEET_NAME);
    sheet.appendRow([
      'Timestamp', 'Toko', 'Tanggal Periode', 'Hari', 'Tanggal Real',
      'Shift/Keterangan', 'Catatan', 'Uploader', 'File ID', 'URL Foto', 'Device Time', 'Shift', 'Tematik', 'Status'
    ]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/** Baris log ringkas (dengan cache). Urutan: [ts, toko, tanggal, ket, catatan, fileId, deviceTime, shift] */
function getLogRows_() {
  const cached = cacheGetBig_('LOG_ROWS');
  if (cached) return cached;

  const sheet = getLogSheet_();
  const last = sheet.getLastRow();
  const rows = [];
  if (last >= 2) {
    const v = sheet.getRange(2, 1, last - 1, Math.min(14, sheet.getMaxColumns())).getValues();
    for (let i = 0; i < v.length; i++) {
      const r = v[i];
      if (!r[8]) continue;
      rows.push([
        r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
        String(r[1] || '').trim(),
        String(r[2]),
        String(r[5] || ''),
        String(r[6] || ''),
        String(r[8]),
        String(r[10] || ''),
        String(r[11] || ''),
        String(r[12] || ''),
        /^tidak/i.test(String(r[13] || '')) ? 'tidak_ada' : (r[13] ? 'ada' : ''),
      ]);
    }
  }
  cachePutBig_('LOG_ROWS', rows, CONFIG.LOG_CACHE_SECONDS);
  return rows;
}

function getRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const savedId = props.getProperty('ROOT_FOLDER_ID');
  if (savedId) {
    try { return DriveApp.getFolderById(savedId); } catch (err) {}
  }
  const it = DriveApp.getFoldersByName(CONFIG.DRIVE_ROOT_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.DRIVE_ROOT_FOLDER);
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (err) {}
  props.setProperty('ROOT_FOLDER_ID', folder.getId());
  return folder;
}

/* ------------------------------------------------------------------ */
/*  BUNDLE PER HARI (semua toko sekaligus)                             */
/* ------------------------------------------------------------------ */

/** Tebak shift foto lama (belum ada kolom Shift) dari jam foto: mulai 06:00 / 15:00 / 23:00. */
function inferShift_(dt, ts) {
  let m = null;
  const mm = /(\d{1,2})[.:](\d{2})/.exec(dt || '');
  if (mm) m = parseInt(mm[1], 10) * 60 + parseInt(mm[2], 10);
  else if (ts) {
    try {
      const hm = Utilities.formatDate(new Date(ts), Session.getScriptTimeZone(), 'H:mm').split(':');
      m = parseInt(hm[0], 10) * 60 + parseInt(hm[1], 10);
    } catch (err) {}
  }
  if (m === null) return 'pagi';
  return m >= 1380 ? 'malam' : (m >= 900 ? 'siang' : (m >= 360 ? 'pagi' : 'malam'));
}

function buildBundle_(colIndex, data, base) {
  const ci = Math.max(0, Math.min(data.dateCols.length - 1, Number(colIndex) || 0));
  const dateCol = data.dateCols[ci];
  const real = realOf_(dateCol, base);

  const byStore = {};
  const stores = data.stores.map(function (name) {
    const s = { toko: name, pagi: [], siang: [], malam: [], lain: [], photos: [] };
    byStore[name] = s;
    return s;
  });

  data.employees.forEach(function (e) {
    const st = byStore[e.lokasi];
    if (!st) return;
    const code = e.shifts[ci];
    const info = classifyShift_(code);
    if (info.group === 'kosong') return;
    const item = { n: e.nama, k: code, t: info.jam };
    if (info.group === 'pagi' || info.group === 'siang' || info.group === 'malam') st[info.group].push(item);
    else st.lain.push(item);
  });

  const tgl = String(dateCol.tanggal);
  const rows = getLogRows_();
  for (let i = rows.length - 1; i >= 0; i--) { // terbaru dulu
    const r = rows[i];
    if (r[2] !== tgl) continue;
    const st = byStore[r[1]];
    if (!st) continue;
    let wt = '', wd = '';
    try { const dd = new Date(r[0]); wt = Utilities.formatDate(dd, CONFIG.TZ, 'HH:mm'); wd = Utilities.formatDate(dd, CONFIG.TZ, 'yyyy-MM-dd'); } catch (err) {}
    // foto bulan lain dengan angka tanggal sama jangan ikut tampil
    if (real && wd && Math.abs(Date.parse(wd + 'T12:00:00') - Date.parse(real + 'T12:00:00')) > 20 * 86400000) continue;
    st.photos.push({ id: r[5], ket: r[3], cat: r[4], dt: r[6], ts: r[0], wt: wt, wd: wd, sh: r[7] || inferShift_(r[6], r[0]), tm: r[8] || '', st: r[9] || '' });
  }

  const tema = {};
  try { getTemaRows_().forEach(function (r) { if (real && r[0] === real) tema[r[1]] = isKode_(r[2]) ? temaResolve_(r[1], r[2]) : r[2]; }); } catch (err) {}

  return {
    ci: ci,
    tanggal: dateCol.tanggal,
    hari: namaHariPanjang_(real ? dayShort_(real) : dateCol.hari),
    tanggalReal: real,
    deadlines: CONFIG.DEADLINES,
    tema: tema,
    gen: data.generatedAt,
    stores: stores,
  };
}

function getDayBundle(colIndex) {
  const data = getScheduleData_();
  const today = resolveToday_(data, getPeriodSettings());
  return buildBundle_(colIndex, data, today.base);
}

function getInitialAppData() {
  const data = getScheduleData_();
  const period = getPeriodSettings();
  const today = resolveToday_(data, period);

  const realMap = {};
  const cols = data.dateCols.map(function (d) {
    const r = realOf_(d, today.base);
    realMap[d.colIndex] = r;
    return Object.assign({}, d, { hari: r ? dayShort_(r) : d.hari }); // nama hari dihitung dari kalender asli
  });

  return {
    stores: data.stores,
    dateCols: cols,
    employees: data.employees.map(function (e) { return { nik: e.nik, nama: e.nama, lokasi: e.lokasi, shifts: e.shifts }; }),
    periode: period,
    todayColIndex: today.idx,
    tanggalRealMap: realMap,
    deadlines: CONFIG.DEADLINES,
    layout: data.layout,
    warnings: (data.warnings || []).concat(today.warn ? [today.warn] : []).concat(temaWarn_()),
    lap: lapInfo_(),
    gen: data.generatedAt,
    bundle: buildBundle_(today.idx, data, today.base),
  };
}

function refreshAll() {
  cacheRemoveBig_('SCHEDULE_DATA');
  cacheRemoveBig_('LOG_ROWS');
  cacheRemoveBig_('TM_LOG');
  return getInitialAppData();
}

/* ------------------------------------------------------------------ */
/*  UPLOAD & HAPUS FOTO                                                */
/* ------------------------------------------------------------------ */

function uploadAttendancePhoto(payload) {
  // Cegah foto ganda jika HP mengirim ulang (koneksi putus-nyambung)
  const cache = CacheService.getScriptCache();
  const dupKey = payload.clientId ? 'UP_' + payload.clientId : '';
  if (dupKey) {
    const hit = cache.get(dupKey);
    if (hit) return { fileId: hit };
  }

  const key = CONFIG.LAPORAN[payload.shift] ? payload.shift : inferShift_(payload.deviceTime, new Date().toISOString());
  const lap = CONFIG.LAPORAN[key], n = nowWib_(), open = inWindow_(key, n.hm);
  // Tidak ada penolakan karena jam/tanggal: foto SELALU diterima. Jam hanya menentukan tematik.
  if (key === 'tutup' && is24Toko_(payload.storeName)) return { err: 'Toko 24 jam tidak wajib Laporan Tutup Toko.' };
  // Tematik hanya untuk kiriman di dalam jam laporan DAN untuk tanggal hari ini.
  // Di luar itu foto tetap diterima, tanpa tematik.
  const todayOk = !payload.realIso || payload.realIso === n.iso;
  const tema = (open && todayOk) ? getTematik_(key, n.iso, true) : '';

  const folder = getLaporanFolder_(key);
  const blob = Utilities.newBlob(
    Utilities.base64Decode(payload.base64),
    payload.mimeType || 'image/jpeg',
    safeName_(lap.nama) + ' - ' + payload.storeName + ' - ' + n.iso + ' ' + n.hm.replace(':', '.') + '.jpg'
  );

  const file = folder.createFile(blob);
  const fileId = file.getId();
  if (CONFIG.SHARE_PER_FILE) {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  }

  const sheet = getLogSheet_();
  ensureLogHeader_(sheet);
  sheet.appendRow([
    new Date(),
    payload.storeName,
    payload.tanggal,
    payload.hari,
    payload.tanggalReal || '',
    payload.keterangan || '',
    payload.catatan || '',
    '',
    fileId,
    'https://drive.google.com/file/d/' + fileId + '/view',
    payload.deviceTime || '',
    key,
    tema,
    payload.status === 'tidak_ada' ? 'Tidak ada kiriman' : (payload.status === 'ada' ? 'Ada kiriman' : '')
  ]);

  cacheRemoveBig_('LOG_ROWS');
  if (dupKey) { try { cache.put(dupKey, fileId, 1800); } catch (err) {} }
  return { fileId: fileId, tema: tema };
}

function deletePhoto(fileId) {
  try { DriveApp.getFileById(fileId).setTrashed(true); } catch (err) {}

  const sheet = getLogSheet_();
  const last = sheet.getLastRow();
  if (last >= 2) {
    const hit = sheet.getRange(2, 9, last - 1, 1).createTextFinder(fileId).matchEntireCell(true).findNext();
    if (hit) sheet.deleteRow(hit.getRow());
  }
  cacheRemoveBig_('LOG_ROWS');
  return true;
}

/** Ambil isi foto (data URL) untuk poster; dipanggil per kelompok kecil dari browser. */
function getPhotosData(ids) {
  const out = {};
  (ids || []).slice(0, 10).forEach(function (id) {
    try {
      const blob = DriveApp.getFileById(id).getBlob();
      out[id] = 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
    } catch (err) {}
  });
  return out;
}


/* ------------------------------------------------------------------ */
/*  TEMATIK, JAM LAPORAN, FOLDER DRIVE PER LAPORAN                     */
/* ------------------------------------------------------------------ */

function nowWib_() {
  const n = new Date();
  return { iso: Utilities.formatDate(n, CONFIG.TZ, 'yyyy-MM-dd'), hm: Utilities.formatDate(n, CONFIG.TZ, 'HH:mm') };
}
function safeName_(t) { return String(t).replace(/[\/\\]/g, '-'); }
/** Jenis laporan yang dibatasi tanggal tertentu (mis. Report 15/16). */
function dayOk_(key, iso) {
  const t = CONFIG.LAPORAN[key].tanggal;
  if (!t) return true;
  return t.indexOf(parseInt(String(iso).split('-')[2], 10)) > -1;
}
function inWindow_(key, hm) { const j = CONFIG.LAPORAN[key].jam; return hm >= j[0] && hm <= j[1]; }
function is24Toko_(name) {
  const m = /^(Y\d+)/i.exec(String(name || '').trim());
  return !!m && CONFIG.TOKO_24JAM.indexOf(m[1].toUpperCase()) > -1;
}
function lapInfo_() {
  const w = {}, nm = {};
  Object.keys(CONFIG.LAPORAN).forEach(function (k) { w[k] = CONFIG.LAPORAN[k].jam; nm[k] = CONFIG.LAPORAN[k].nama; });
  const tg = {};
  Object.keys(CONFIG.LAPORAN).forEach(function (k) { if (CONFIG.LAPORAN[k].tanggal) tg[k] = CONFIG.LAPORAN[k].tanggal; });
  return { windows: w, nama: nm, toko24: CONFIG.TOKO_24JAM, ketat: false, tanggal: tg };
}
function temaWarn_() {
  const kosong = Object.keys(CONFIG.TEMATIK_SUMBER).filter(function (k) { return !(getTemaSrc_(k) || {}).url; });
  return kosong.length ? ['Link spreadsheet tematik belum diisi: ' + kosong.join(', ') + ' (isi di menu Atur → Link spreadsheet tematik).'] : [];
}

function ensureLogHeader_(sh) {
  const p = PropertiesService.getScriptProperties();
  if (p.getProperty('LOG_HDR14')) return;
  if (sh.getMaxColumns() < 14) sh.insertColumnsAfter(sh.getMaxColumns(), 14 - sh.getMaxColumns());
  if (!sh.getRange(1, 12).getValue()) sh.getRange(1, 12).setValue('Shift');
  if (!sh.getRange(1, 13).getValue()) sh.getRange(1, 13).setValue('Tematik');
  if (!sh.getRange(1, 14).getValue()) sh.getRange(1, 14).setValue('Status');
  p.setProperty('LOG_HDR14', '1');
}

function getTemaSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh = ss.getSheetByName('TEMATIK_LOG');
  if (!sh) {
    sh = ss.insertSheet('TEMATIK_LOG');
    sh.appendRow(['Tanggal', 'Slot', 'Item', 'Dipilih']);
    sh.getRange('A:A').setNumberFormat('@');
    sh.setFrozenRows(1);
  }
  return sh;
}
/** Riwayat pilihan tematik: [tanggal(yyyy-MM-dd), slot, item], urut waktu. */
function getTemaRows_(fresh) {
  if (!fresh) { const c = cacheGetBig_('TM_LOG'); if (c) return c; }
  const sh = getTemaSheet_(), last = sh.getLastRow(), rows = [];
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 3).getValues().forEach(function (r) {
      rows.push([r[0] instanceof Date ? Utilities.formatDate(r[0], CONFIG.TZ, 'yyyy-MM-dd') : String(r[0]).trim(), String(r[1]).trim(), String(r[2]).trim()]);
    });
  }
  cachePutBig_('TM_LOG', rows, 300);
  return rows;
}

/** true bila teks hanya kode angka (PLU/kode barang), bukan nama barang. */
function isKode_(s) { return /^\d{4,}$/.test(String(s || '').replace(/[\s.\-]/g, '')); }

/**
 * Baca daftar item tematik dari spreadsheet sumber (tiap kali, supaya perubahan langsung terbaca).
 * Hasil: [{code, name}]. Yang ditampilkan sebagai tematik SELALU NAMA BARANG:
 * bila kolom terpilih berisi kode angka (PLU), kolom nama barang dicari otomatis di kolom sebelahnya.
 */
function readTemaRows_(listKey) {
  const src = getTemaSrc_(listKey);
  if (!src || !src.url) return null;
  const m = /\/d\/([a-zA-Z0-9_-]+)/.exec(src.url);
  const sid = m ? m[1] : String(src.url).trim();
  const ss = SpreadsheetApp.openById(sid);
  let sh = src.tab ? ss.getSheetByName(src.tab) : null;
  // spreadsheet utama berisi jadwal, jadi tematik SELALU diambil dari tab 'TEMATIK' (bukan Sheet1)
  if (!sh && sid === CONFIG.SPREADSHEET_ID) sh = ss.getSheetByName('TEMATIK');
  if (!sh) {
    const g = /[#&?]gid=(\d+)/.exec(src.url);
    if (g) sh = ss.getSheets().filter(function (x) { return String(x.getSheetId()) === g[1]; })[0];
  }
  sh = sh || ss.getSheetByName('TEMATIK') || ss.getSheets()[0];
  const last = sh.getLastRow();
  if (last < 1) return [];
  const col = Math.max(0, (src.kol || 1) - 1);
  const lc = Math.max(sh.getLastColumn(), col + 1);
  const vals = sh.getRange(1, 1, last, lc).getDisplayValues();
  const cell = function (r, c) { return String(r[c] === undefined ? '' : r[c]).trim(); };

  let nameCol = col, hdrSet = false, codeSet = false;
  const mine = vals.map(function (r) { return cell(r, col); }).filter(Boolean);
  if (mine.length && mine.filter(isKode_).length / mine.length >= 0.6) {
    let best = -1, bestScore = 0;
    for (let c = 0; c < lc; c++) {
      if (c === col) continue;
      const score = vals.filter(function (r) { const t = cell(r, c); return t && /[A-Za-z]/.test(t) && !isKode_(t); }).length;
      if (score > bestScore) { best = c; bestScore = score; }
    }
    if (best >= 0) nameCol = best;
  }
  // judul kolom (mis. PLU | NAMA BARANG) menentukan kolom nama & kolom kode
  let codeCol = col;
  (vals[0] || []).forEach(function (t, i) {
    t = String(t).trim();
    if (/(nama|barang|item|deskripsi|produk)/i.test(t) && !/^(plu|kode|code)/i.test(t)) { if (!hdrSet) { nameCol = i; hdrSet = true; } }
    else if (/^(plu|kode|code)/i.test(t) && !codeSet) { codeCol = i; codeSet = true; }
  });
  const rows = vals.map(function (r) { return { code: cell(r, codeCol), name: cell(r, nameCol) }; }).filter(function (x) { return x.name; });
  if (rows.length && /^(tematik|tema|item|no|nama|plu|kode|barang|deskripsi)\b/i.test(rows[0].name) && rows[0].name.length < 25) rows.shift();
  const seen = {};
  return rows.filter(function (x) { if (seen[x.name]) return false; seen[x.name] = true; return true; });
}
function readTemaList_(listKey) {
  const r = readTemaRows_(listKey);
  return r === null ? null : r.map(function (x) { return x.name; });
}
/** Ubah kode barang (mis. 26086309) menjadi nama barang; selain kode dikembalikan apa adanya. */
function temaResolve_(slot, val) {
  if (!val || !isKode_(val)) return val;
  const L = CONFIG.LAPORAN[slot]; if (!L || !L.list) return val;
  try {
    const h = (readTemaRows_(L.list) || []).filter(function (x) { return x.code === String(val).trim(); })[0];
    return h ? h.name : val;
  } catch (err) { return val; }
}
/** Hapus baris TEMATIK_LOG (tanggal+slot) yang isinya tidak valid supaya diundi ulang. */
function deleteTemaLogRow_(iso, slot) {
  try {
    const sh = getTemaSheet_(), last = sh.getLastRow();
    for (let i = last; i >= 2; i--) {
      const r = sh.getRange(i, 1, 1, 2).getValues()[0];
      const d = r[0] instanceof Date ? Utilities.formatDate(r[0], CONFIG.TZ, 'yyyy-MM-dd') : String(r[0]).trim();
      if (d === iso && String(r[1]).trim() === slot) sh.deleteRow(i);
    }
    cacheRemoveBig_('TM_LOG');
  } catch (err) { Logger.log('deleteTemaLogRow_: ' + err.message); }
}
/** Perbaiki baris TEMATIK_LOG yang terlanjur berisi kode menjadi nama barang. */
function fixTemaLogRow_(iso, slot, name) {
  try {
    const sh = getTemaSheet_(), last = sh.getLastRow();
    if (last < 2) return;
    const v = sh.getRange(2, 1, last - 1, 3).getValues();
    for (let i = 0; i < v.length; i++) {
      const d = v[i][0] instanceof Date ? Utilities.formatDate(v[i][0], CONFIG.TZ, 'yyyy-MM-dd') : String(v[i][0]).trim();
      if (d === iso && String(v[i][1]).trim() === slot) { sh.getRange(i + 2, 3).setValue(name); break; }
    }
    cacheRemoveBig_('TM_LOG');
  } catch (err) { Logger.log('fixTemaLogRow_: ' + err.message); }
}

/**
 * Item tematik yang SUDAH TERPAKAI pada putaran berjalan (dihitung dari TEMATIK_LOG).
 * Satu item hanya keluar satu kali per putaran; setelah semua item di daftar terpakai,
 * putaran baru dimulai. Item baru yang ditambah ke daftar langsung ikut diundi.
 */
function temaUsage_(rows, listKey, list) {
  let used = {}, last = '';
  rows.forEach(function (r) {
    const L = CONFIG.LAPORAN[r[1]];
    if (!L || L.list !== listKey) return;
    used[r[2]] = true; last = r[2];
    if (list.every(function (x) { return used[x]; })) used = {};
  });
  return { used: used, last: last };
}

/**
 * Tematik untuk (slot, tanggal). Dipilih acak SEKALI per tanggal+slot lalu dikunci
 * (semua toko sama). Item yang baru dipakai tidak diulang sampai daftar habis.
 */
function getTematik_(slot, iso, create) {
  if (!CONFIG.LAPORAN[slot] || !CONFIG.LAPORAN[slot].list) return '';
  const cache = CacheService.getScriptCache(), ck = 'TM2_' + iso + '_' + slot;
  const c = cache.get(ck);
  if (c && !isKode_(c)) return c;
  const find = function (rows) { const h = rows.filter(function (r) { return r[0] === iso && r[1] === slot; })[0]; return h ? h[2] : ''; };
  let got = find(getTemaRows_());
  if (got && isKode_(got)) { const nm = temaResolve_(slot, got); if (nm !== got) { fixTemaLogRow_(iso, slot, nm); got = nm; } }
  if (got) { // pastikan tematik tersimpan memang item di daftar TEMATIK; kalau bukan (salah sumber), hapus & undi ulang
    try {
      const L0 = readTemaList_(CONFIG.LAPORAN[slot].list);
      if (L0 && L0.length && L0.indexOf(got) < 0) { deleteTemaLogRow_(iso, slot); got = ''; }
    } catch (err) {}
  }
  if (!got && create) {
    const lock = LockService.getScriptLock();
    try {
      lock.waitLock(8000);
      const rows = getTemaRows_(true);
      got = find(rows);
      if (!got) {
        const lk = CONFIG.LAPORAN[slot].list;
        let list = null;
        try { list = readTemaList_(lk); } catch (err) { Logger.log('Tematik ' + lk + ' gagal dibaca: ' + err.message); }
        if (list && list.length) {
          const u = temaUsage_(rows, lk, list);
          let avail = list.filter(function (x) { return !u.used[x]; });
          if (!avail.length) avail = list;
          // awal putaran baru: jangan langsung sama dengan item terakhir putaran lama
          if (avail.length === list.length && avail.length > 1 && u.last) avail = avail.filter(function (x) { return x !== u.last; });
          // tiap laporan beda tematik: buang item yang HARI INI sudah dipakai laporan/shift lain
          const dayUsed = {};
          rows.forEach(function (r) { if (r[0] === iso && r[1] !== slot) dayUsed[r[2]] = true; });
          const uniq = avail.filter(function (x) { return !dayUsed[x]; });
          if (uniq.length) avail = uniq;
          else {
            const uniqAll = list.filter(function (x) { return !dayUsed[x]; });
            if (uniqAll.length) avail = uniqAll;
          }
          got = avail[Math.floor(Math.random() * avail.length)];
          getTemaSheet_().appendRow([iso, slot, got, new Date()]);
          cacheRemoveBig_('TM_LOG');
        }
      }
    } catch (err) {
      Logger.log('getTematik_: ' + err.message);
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  }
  if (got) { try { cache.put(ck, got, 21600); } catch (err) {} }
  return got || '';
}

/** Tematik yang sedang aktif (jamnya sedang berjalan). Dipanggil browser saat buka & tiap menit. */
function getTematikAktif() {
  const n = nowWib_(), out = {};
  Object.keys(CONFIG.LAPORAN).forEach(function (k) { if (inWindow_(k, n.hm)) out[k] = getTematik_(k, n.iso, true); });
  return { iso: n.iso, hm: n.hm, aktif: out };
}

function getLaporanFolder_(key) {
  const props = PropertiesService.getScriptProperties(), pk = 'FOLDER_' + key;
  const saved = props.getProperty(pk);
  if (saved) { try { return DriveApp.getFolderById(saved); } catch (err) {} }
  const root = getRootFolder_(), nama = safeName_(CONFIG.LAPORAN[key].nama);
  const it = root.getFoldersByName(nama);
  const f = it.hasNext() ? it.next() : root.createFolder(nama);
  props.setProperty(pk, f.getId());
  return f;
}

/** Simpan poster rekap semua toko ke folder laporan di Drive (menimpa rekap hari yang sama). */
function savePosterToDrive(p) {
  if (!p || !CONFIG.LAPORAN[p.key]) return { name: '' };
  const folder = getLaporanFolder_(p.key);
  const name = 'REKAP ' + safeName_(CONFIG.LAPORAN[p.key].nama) + ' ' + (p.iso || nowWib_().iso) + '.jpg';
  const it = folder.getFilesByName(name);
  while (it.hasNext()) it.next().setTrashed(true);
  folder.createFile(Utilities.newBlob(Utilities.base64Decode(p.base64), 'image/jpeg', name));
  return { name: name };
}

/* ---- Link tematik bisa diisi dari menu Atur (disimpan di Script Properties, bukan di kode) ---- */
function getTemaSrc_(k) {
  const p = PropertiesService.getScriptProperties().getProperty('TEMA_' + k);
  if (p) { try { return JSON.parse(p); } catch (e) {} }
  return CONFIG.TEMATIK_SUMBER[k];
}
function getTematikStatus() {
  const out = {};
  let rows = null;
  Object.keys(CONFIG.TEMATIK_SUMBER).forEach(function (k) {
    const src = getTemaSrc_(k);
    if (!src || !src.url) { out[k] = { ok: false, n: 0 }; return; }
    try {
      const list = readTemaList_(k);
      if (!rows) rows = getTemaRows_(true);
      const u = temaUsage_(rows, k, list);
      out[k] = { ok: true, n: list.length, sisa: list.filter(function (x) { return !u.used[x]; }).length };
    }
    catch (e) { out[k] = { ok: false, n: 0, err: 'tidak bisa dibuka (cek link & izin akses sheet)' }; }
  });
  return out;
}
/** PIN pertama yang diisi menjadi PIN admin; selanjutnya wajib sama. */
function saveTematikLinks(pin, links) {
  const props = PropertiesService.getScriptProperties(), cur = props.getProperty('ADMIN_PIN');
  pin = String(pin || '');
  if (cur && pin !== cur) return { err: 'PIN salah.' };
  if (!cur) {
    if (pin.length < 4) return { err: 'Buat PIN minimal 4 karakter (dipakai tiap kali mengubah link).' };
    props.setProperty('ADMIN_PIN', pin);
  }
  Object.keys(CONFIG.TEMATIK_SUMBER).forEach(function (k) {
    const u = String((links || {})[k] || '').trim();
    if (u) props.setProperty('TEMA_' + k, JSON.stringify({ url: u, tab: '', kol: 1 }));
  });
  return { ok: true, status: getTematikStatus() };
}


/* ------------------------------------------------------------------ */
/*  RESET DATA FOTO BULANAN                                            */
/* ------------------------------------------------------------------ */

/**
 * Kosongkan foto & log untuk jenis di CONFIG.RESET_JENIS (ASA, EXP, Soundbox, Tutup, Report).
 * TIDAK menyentuh TEMATIK_LOG (riwayat tematik) maupun foto absen buka toko.
 * Folder Drive tiap jenis dipindah ke Sampah (cepat, satu panggilan per folder) lalu dibuat ulang otomatis.
 */
function resetFotoBulanan(pin) {
  if (String(pin || '') !== String(CONFIG.RESET_PIN)) return { err: 'PIN salah.' };
  const lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { err: 'Server sedang sibuk, coba lagi sebentar.' }; }
  try {
    const jenis = {};
    CONFIG.RESET_JENIS.forEach(function (k) { jenis[k] = true; });
    const props = PropertiesService.getScriptProperties(), iso = nowWib_().iso;

    CONFIG.RESET_JENIS.forEach(function (k) {
      try {
        const f = getLaporanFolder_(k);
        f.setName(safeName_(CONFIG.LAPORAN[k].nama) + ' (arsip ' + iso + ')'); // supaya tidak terpakai lagi
        f.setTrashed(true);
      } catch (e) { Logger.log('Reset folder ' + k + ': ' + e.message); }
      props.deleteProperty('FOLDER_' + k);
    });

    const sh = getLogSheet_(), last = sh.getLastRow();
    let hapus = 0;
    if (last >= 2) {
      const nc = Math.max(sh.getLastColumn(), 13);
      const vals = sh.getRange(2, 1, last - 1, nc).getValues();
      const keep = vals.filter(function (r) { return !jenis[String(r[11] || '').trim()]; });
      hapus = vals.length - keep.length;
      if (hapus) {
        sh.getRange(2, 1, vals.length, nc).clearContent();
        if (keep.length) sh.getRange(2, 1, keep.length, nc).setValues(keep);
        try {
          const start = keep.length ? keep.length + 2 : 3, cnt = keep.length ? hapus : vals.length - 1;
          if (cnt > 0) sh.deleteRows(start, cnt);
        } catch (e) {}
      }
    }
    cacheRemoveBig_('LOG_ROWS');
    return { ok: true, hapus: hapus };
  } catch (err) {
    return { err: 'Reset gagal: ' + err.message };
  } finally {
    try { lock.releaseLock(); } catch (e) {}
  }
}


/* =====================================================================
 * MODUL TAMBAHAN: LAPORAN RAK HARIAN, KEBERSIHAN MINGGUAN & REKAP
 * Data laporan disimpan di tab terpisah agar struktur LOG_FOTO lama aman.
 * ===================================================================== */
const OPS_REPORT_SHEET = 'LOG_LAPORAN_OPERASIONAL';
const OPS_CLEANING_SHEET = 'KEBERSIHAN_MINGGUAN';
const OPS_WEEKLY_DEFAULT = {
  Senin: ['KESET', 'TONG SAMPAH', 'GENSET'],
  Selasa: ['ALL KACA BAGIAN DEPAN & DALAM', 'SARANG LABA-LABA', 'KEBERSIHAN KISI-KISI CAMPINA, WALL’S & NUGGET'],
  Rabu: ['KEBERSIHAN KERANJANG BELANJA', 'KOLONG RAK REGULER', 'KOLONG FREEZER & CHILLER'],
  Kamis: ['CEK GENERAL EXPIRED ALL ITEM'],
  "Jum'at": ['GROUPING RAK ATK', 'GROUPING RAK ITEM KARTONAN', 'PENEMPELAN LABEL EXP'],
  Sabtu: ['PENGECEKAN LABEL ITEM TIDAK ADA LABEL PRICE', 'PENGECEKAN ITEM FLOOR & FDU TIDAK ADA POP'],
  Minggu: ['PENGECEKAN LINGKUNGAN (HALAMAN PARKIR FOTO KESELURUHAN CEK BANER DAN POP KACA', 'RUMPUT LIAR', 'KERUSAKAN JIKA ADA']
};
function getOpsReportSheet_() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sh = ss.getSheetByName(OPS_REPORT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(OPS_REPORT_SHEET);
    sh.appendRow(['ID','Timestamp','Tanggal ISO','Jenis','Toko','Shift','Tematik','Detail JSON','Foto JSON','Pengirim']);
    sh.setFrozenRows(1);
    sh.getRange('A:G').setNumberFormat('@');
  }
  return sh;
}
function getOpsCleaningTasks_(iso) {
  const day = ['Minggu','Senin','Selasa','Rabu','Kamis',"Jum'at",'Sabtu'][new Date(iso + 'T12:00:00').getDay()];
  let tasks = OPS_WEEKLY_DEFAULT[day] || [];
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    let sh = ss.getSheetByName(OPS_CLEANING_SHEET);
    if (!sh) {
      sh = ss.insertSheet(OPS_CLEANING_SHEET);
      sh.appendRow(['Hari', 'Daftar Kebersihan (pisahkan dengan |)']);
      Object.keys(OPS_WEEKLY_DEFAULT).forEach(function(d){ sh.appendRow([d, OPS_WEEKLY_DEFAULT[d].join(' | ')]); });
      sh.setFrozenRows(1);
    }
    if (sh.getMaxColumns() < 2) sh.insertColumnAfter(1);
    if (sh.getLastRow() > 1) {
      const vals = sh.getRange(2,1,sh.getLastRow()-1,2).getDisplayValues();
      const hit = vals.filter(r => String(r[0] || '').trim().toLowerCase() === day.toLowerCase())[0];
      if (hit && hit[1]) tasks = String(hit[1]).split(/\s*[|;\n]\s*/).map(x => x.trim()).filter(Boolean);
    }
  } catch (e) { Logger.log('Baca jadwal kebersihan mingguan: ' + e.message); }
  return { day: day, tasks: tasks };
}
function getWeeklyCleaningTasks(iso) {
  iso = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso) : nowWib_().iso;
  return getOpsCleaningTasks_(iso);
}
function getOperationalReportStatus(iso) {
  iso = /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? String(iso) : nowWib_().iso;
  const stores = getScheduleData_().stores;
  const sh = getOpsReportSheet_(), last = sh.getLastRow(), rows = last > 1 ? sh.getRange(2,1,last-1,10).getValues() : [];
  const found = { rak1:{}, rak2:{}, rak3:{}, mingguan:{} };
  rows.forEach(r => {
    const d = r[2] instanceof Date ? Utilities.formatDate(r[2], CONFIG.TZ, 'yyyy-MM-dd') : String(r[2] || '').trim();
    const type = String(r[3] || ''), store = String(r[4] || '');
    if (d === iso && found[type] && store) found[type][store] = true;
  });
  const dayNum = Number(iso.slice(8,10)), skipped = [1,15,16,31].indexOf(dayNum) >= 0;
  function group(key) {
    const done = stores.filter(s => found[key][s]);
    return { key:key, done:done, missing:stores.filter(s => !found[key][s]), total:stores.length, count:done.length, percent:stores.length ? Math.round(done.length/stores.length*100) : 0 };
  }
  const weekly = getOpsCleaningTasks_(iso), repDone = {};
  if (dayNum === 15 || dayNum === 16) {
    getLogRows_().forEach(r => {
      if (r[7] !== 'report') return;
      try { if (Utilities.formatDate(new Date(r[0]), CONFIG.TZ, 'yyyy-MM-dd') === iso) repDone[r[1]] = true; } catch(e) {}
    });
  }
  const reportDone = stores.filter(s => repDone[s]);
  return {
    iso:iso, stores:stores, skippedDaily:skipped,
    daily: skipped ? [] : [group('rak1'),group('rak2'),group('rak3')],
    weekly: Object.assign(group('mingguan'), { day:weekly.day, tasks:weekly.tasks }),
    report1516: { applicable:dayNum === 15 || dayNum === 16, done:reportDone, missing:(dayNum === 15 || dayNum === 16) ? stores.filter(s => !repDone[s]) : [], total:stores.length, count:reportDone.length, percent:stores.length ? Math.round(reportDone.length/stores.length*100) : 0 }
  };
}
function submitOperationalReport(payload) {
  if (!payload || !payload.store || !payload.iso || !payload.type) throw new Error('Data laporan belum lengkap.');
  const type = String(payload.type), allowed = ['rak1','rak2','rak3','mingguan'];
  if (allowed.indexOf(type) < 0) throw new Error('Jenis laporan tidak dikenal.');
  const stores = getScheduleData_().stores;
  if (stores.indexOf(String(payload.store)) < 0) throw new Error('Nama toko tidak ditemukan di jadwal.');
  const iso = String(payload.iso);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error('Tanggal tidak valid.');
  const dayNum = Number(iso.slice(8,10));
  if (type.indexOf('rak') === 0 && [1,15,16,31].indexOf(dayNum) >= 0) throw new Error('Laporan rak harian tidak diwajibkan pada tanggal 1, 15, 16, dan 31.');
  const files = Array.isArray(payload.files) ? payload.files : [];
  if (type.indexOf('rak') === 0 && files.length !== 4) throw new Error('Laporan rak harian wajib tepat 4 foto.');
  if (type === 'mingguan') {
    const need = getOpsCleaningTasks_(iso).tasks.length || 1;
    if (files.length !== need) throw new Error('Kebersihan mingguan wajib tepat ' + need + ' foto (sesuai jumlah checklist pekerjaan).');
  }
  if (files.length > 8) throw new Error('Maksimal 8 foto per laporan.');
  const details = payload.details || {};
  if (type.indexOf('rak') === 0) {
    const findings = Array.isArray(details.findings) ? details.findings : [];
    if (findings.length > 20) throw new Error('Maksimal 20 item temuan.');
    if (details.findingStatus === 'ada' && !findings.length) throw new Error('Isi minimal satu item temuan.');
    findings.forEach((x,i) => { if (!x.plu || !x.name || !x.rh || !x.qty || !x.rack) throw new Error('Data temuan item ke-' + (i+1) + ' belum lengkap.'); });
  }
  const ids = [], links = [], n = nowWib_();
  const dayNames = ['Minggu','Senin','Selasa','Rabu','Kamis',"Jum'at",'Sabtu'];
  const hariNama = dayNames[new Date(iso + 'T12:00:00').getDay()];
  const lap = CONFIG.LAPORAN[type];
  const noteTxt = String(details.notes || '');
  const logSheet = getLogSheet_(); ensureLogHeader_(logSheet);
  const logRows = [];
  files.forEach((f,i) => {
    if (!f || !f.base64) return;
    const bytes = Utilities.base64Decode(f.base64);
    if (bytes.length > 450 * 1024) throw new Error('Foto ke-' + (i+1) + ' terlalu besar. Maksimal 450 KB setelah kompresi.');
    const fname = safeName_(lap.nama) + ' - ' + payload.store + ' - ' + iso + ' ' + n.hm.replace(':', '.') + ' - ' + (i+1) + '.jpg';
    const saved = saveReportPhoto_(bytes, f.mimeType || 'image/jpeg', fname, type);
    ids.push(saved.id); links.push(saved.url);
    // Dicatat ke LOG_FOTO dengan format yang SAMA seperti foto laporan lain (sinkron ke spreadsheet terakhir)
    logRows.push([ new Date(), String(payload.store), Number(iso.slice(8,10)), hariNama, iso,
      (f.label || ('Foto ' + (i+1))), noteTxt, '', saved.id, saved.url, '', type, String(payload.theme || ''), '' ]);
  });
  if (ids.length !== files.length) throw new Error('Sebagian foto gagal diproses.');
  if (logRows.length) logSheet.getRange(logSheet.getLastRow() + 1, 1, logRows.length, logRows[0].length).setValues(logRows);
  cacheRemoveBig_('LOG_ROWS');
  details.links = links;
  const id = Utilities.getUuid(), lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { getOpsReportSheet_().appendRow([id, new Date(), iso, type, String(payload.store), String(payload.shift || ''), String(payload.theme || ''), JSON.stringify(details), JSON.stringify(ids), '']); }
  finally { lock.releaseLock(); }
  return { ok:true, id:id, fileIds:ids, savedAt:nowWib_().iso + ' ' + nowWib_().hm };
}


/** Simpan 1 foto laporan: server pribadi bila diisi di CONFIG.SERVER_UPLOAD, selain itu / bila gagal -> Google Drive. */
function saveReportPhoto_(bytes, mime, fname, key) {
  const su = CONFIG.SERVER_UPLOAD || {};
  if (su.URL) {
    try {
      const res = UrlFetchApp.fetch(su.URL, {
        method: 'post', muteHttpExceptions: true,
        payload: { token: su.TOKEN || '', folder: key, filename: fname, file: Utilities.newBlob(bytes, mime, fname) }
      });
      const j = JSON.parse(res.getContentText());
      if (res.getResponseCode() === 200 && j && j.url) return { id: 'srv:' + (j.name || fname), url: j.url };
      Logger.log('Server upload gagal: ' + res.getContentText());
    } catch (e) { Logger.log('Server upload error: ' + e.message); }
  }
  try {
    const folder = getLaporanFolder_(key);
    const file = folder.createFile(Utilities.newBlob(bytes, mime, fname));
    const fileId = file.getId();
    if (CONFIG.SHARE_PER_FILE) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return { id: fileId, url: 'https://drive.google.com/file/d/' + fileId + '/view' };
  } catch (e) {
    if (/access denied|authorization|izin/i.test(String(e.message))) {
      throw new Error('Akses Drive belum diizinkan. Pemilik script: jalankan setupSekali() di editor, klik Izinkan, lalu Deploy > Kelola deployment > Edit > Versi baru > Deploy.');
    }
    throw e;
  }
}
