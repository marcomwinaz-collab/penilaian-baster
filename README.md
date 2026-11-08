# Penilaian Karyawan Bakso Terbang

Aplikasi web untuk penilaian bulanan karyawan dan crew Bakso Terbang. Isinya: login HRD dan Supervisor, data karyawan, input penilaian 14 indikator, analisis per kategori dan per outlet, hasil akhir dan peringkat, serta dashboard bergrafik.

- **Tampilan web**: GitHub Pages (gratis). Folder ini berisi `index.html` dan `config.js`.
- **Database**: Google Sheets milik Anda, lewat Google Apps Script (`apps-script/Code.gs`).
- **Update otomatis**: setiap layar yang sedang terbuka memeriksa perubahan setiap 15 detik. Nilai yang disimpan Supervisor di outlet akan muncul sendiri di layar HRD.

```
GitHub Pages (index.html)  ──HTTPS──▶  Google Apps Script (Code.gs)  ──▶  Google Sheets (data)
```

---

## Langkah 1: Siapkan database di Google Sheets

1. Buka <https://sheets.new> untuk membuat spreadsheet baru. Beri nama, misalnya **Database Penilaian Baster**.
2. Klik menu **Extensions → Apps Script**.
3. Di editor Apps Script, hapus semua isi file `Code.gs`, lalu tempel seluruh isi file [`apps-script/Code.gs`](apps-script/Code.gs). Tekan **Ctrl+S** untuk menyimpan.
4. Di bagian atas editor, pilih fungsi **`setup`**, lalu klik **Run**.
   - Google akan meminta izin. Pilih akun Anda → **Advanced** → **Go to … (unsafe)** → **Allow**.
   - Peringatan ini wajar karena skrip ini buatan sendiri, bukan aplikasi yang diverifikasi Google.
5. Jika Anda ingin mengambil data dari spreadsheet penilaian lama, pilih fungsi **`imporAwal`**, lalu klik **Run**.
   - Fungsi ini membaca sheet *Performance Leader* dan *Performance Crew* dari spreadsheet yang ID-nya tercantum di `SUMBER_SPREADSHEET_ID`.
   - Data dimasukkan sebagai periode `SUMBER_PERIODE`. Ubah kedua nilai itu di bagian bawah `Code.gs` bila perlu.
   - Fungsi ini aman dijalankan ulang: data dengan periode yang sama akan ditimpa, bukan digandakan.
6. Hasil impor bisa dicek di menu **View → Executions/Logs**. Di sana terlihat jumlah data yang masuk dan apakah semua total sama dengan spreadsheet lama.
7. Klik **Deploy → New deployment**, lalu:
   - Klik ikon ⚙ dan pilih **Web app**.
   - **Execute as**: *Me*.
   - **Who has access**: *Anyone*.
   - Klik **Deploy**, lalu **salin URL Web app**. Bentuknya `https://script.google.com/macros/s/…/exec`.

> "Anyone" artinya halaman web bisa menghubungi skrip ini. **Data tetap terkunci:** semua permintaan (kecuali login) wajib membawa token sesi yang hanya didapat dengan username dan password yang benar.

## Langkah 2: Pasang tampilan web di GitHub Pages

1. Buka file `config.js` di repo ini, klik ikon ✏️ (Edit), lalu ganti `PASTE_URL_WEB_APP_DI_SINI` dengan URL dari Langkah 1.7. Klik **Commit changes**.
2. Buka **Settings → Pages**.
   - **Source**: *Deploy from a branch*.
   - **Branch**: *main*, folder */ (root)*.
   - Klik **Save**.
3. Tunggu sekitar 1 menit. Aplikasi bisa dibuka di:
   **`https://USERNAME-GITHUB.github.io/NAMA-REPO/`**

Bagikan link tersebut ke HRD dan Supervisor. Mereka cukup login dengan akun aplikasi dan tidak perlu punya akun GitHub atau Google.

> GitHub Pages gratis hanya untuk repo **Public**. Repo ini hanya berisi kode, tanpa data karyawan, jadi aman dijadikan publik. Semua data tersimpan di Google Sheets Anda.

## Akun login

- Saat aplikasi pertama kali dibuka, halaman login akan meminta Anda **membuat akun HRD pertama**. Username dan password Anda tentukan sendiri.
- Akun baru dibuat lewat menu **Pengaturan → + Akun**. Semua akun punya akses yang sama.
- Password disimpan dalam bentuk hash (SHA-256 + salt) di sheet *Akun*. Kolom hash disembunyikan.
- Sesi login berlaku 6 jam sejak terakhir aktif.

## Memakai aplikasi setiap bulan

1. Buka **Input Penilaian** dan pilih periode. Gunakan **+ Periode baru** untuk bulan baru.
2. Klik **Nilai** pada tiap karyawan, isi 14 indikator (0–100), lalu **Simpan**. Total dihitung otomatis.
3. Atau gunakan **Impor dari spreadsheet**:
   1. Salin baris data dari sheet *Performance Crew* atau *Performance Leader* tanpa judul kolom.
   2. Tempel di kolom yang tersedia.
   3. Klik **Impor**.
4. Lihat hasilnya di **Dashboard**, **Per Kategori**, **Per Outlet**, dan **Hasil Akhir**. Tabel hasil akhir bisa disalin atau diunduh sebagai CSV.

**Rumus:** Total skor = Σ (nilai indikator × bobot). Indikator yang kosong dihitung 0, sama seperti spreadsheet asli. Peringkat dipisah untuk kategori **Leader** dan **Crew/Waitress**.

## Mengubah kode Apps Script di kemudian hari

1. Setelah mengedit `Code.gs`, klik **Deploy → Manage deployments**.
2. Klik ✏️, lalu pada **Version** pilih **New version** → **Deploy**.

Dengan cara ini URL tetap sama, jadi `config.js` tidak perlu diubah.

## Cadangan data

Semua data ada di Google Sheets, jadi Anda bisa:
- melihat dan memulihkan versi lama lewat **File → Version history**;
- mengunduh salinan lewat **File → Download → Excel**.

Jangan mengubah urutan kolom atau nama sheet secara manual. Mengedit nilai di sel boleh, dan perubahannya akan terlihat di aplikasi setelah halaman dimuat ulang.

## Struktur repo

```
index.html            Aplikasi web (satu file, logo sudah tertanam)
config.js             URL Web App Google Apps Script
apps-script/Code.gs   Backend + fungsi imporAwal: tempel di Extensions → Apps Script
.nojekyll             Agar GitHub Pages menyajikan file apa adanya
```
