# Maison Vault

Lüks ikinci el çanta (Hermès, Louis Vuitton, Chanel), saat (Rolex, Patek Philippe) ve mücevher (Van Cleef & Arpels) için mat siyah + şampanya altını **vitrin sitesi**. Yapı olarak [vdmcars.de](https://vdmcars.de) örnek alındı. Diller: Almanca (varsayılan), İngilizce, Türkçe.

> **Durum: demo.** Ürünler, fiyatlar ve fotoğraflar yer tutucudur. Yasal sayfalar (Impressum, Datenschutz, AGB, Widerruf) avukat tarafından yazılmadan yayına alınmamalıdır.

## Hızlı başlangıç

Gereksinimler: Node.js ≥ 20.9, Docker (macOS'ta `colima start`) ve `docker-compose`.

1. Bağımlılıklar:

```bash
npm install
```

2. Ortam dosyası: `.env.example`'ı `.env.local` olarak kopyalayın ve `change-me` yerine güçlü bir parola yazın (`openssl rand -hex 24`). `.env.local` asla commit edilmez.

3. Veritabanını başlat, şemayı kur, demo veriyi yükle:

```bash
npm run db:up
```

```bash
npm run db:migrate
```

```bash
npm run db:seed
```

4. Geliştirme sunucusu:

```bash
npm run dev
```

Arayüz: <http://localhost:1111> (tarayıcı diline göre `/de`, `/en` veya `/tr`'ye yönlendirir).

> Katalog verisi `"use cache"` ile önbelleğe alınır ve admin panelindeki her kayıt önbelleği anında yeniler. `db:seed` gibi **panel dışından** yapılan değişikliklerden sonra çalışan dev sunucusunu yeniden başlatın.

### Veritabanı ve dosyalar

| Komut                 | Ne yapar                                                                                  |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `npm run db:up/down`  | PostgreSQL 17 konteynerini başlatır/durdurur (yalnızca `127.0.0.1:5433`)                  |
| `npm run db:migrate`  | `db/migrations/` içindeki sürümlü SQL migration'ları uygular (tekrar çalıştırmak güvenli) |
| `npm run db:generate` | `db/schema.ts` değişince yeni migration üretir                                            |
| `npm run db:seed`     | Demo katalogu yükler; mevcut kayıtlara dokunmaz (idempotent)                              |
| `npm run test:int`    | Gerçek PostgreSQL'e karşı entegrasyon testleri (`*_test` veritabanı sıfırdan kurulur)     |

Yüklenen görseller `storage/media/` altında **asla üzerine yazılmayan**, sürümlü adlarla tutulur:
`{tür}/{varlık}/{YYYYMMDD-HHmmss}_v{N}_{sha256-8}.webp` — ör. `product/rolex-explorer-224270/20261013-220805_v1_2a3acf12.webp`. Görseller yüklenirken doğrulanır, EXIF/GPS bilgisi silinir ve WebP'ye dönüştürülür.

## Komutlar

| Komut                     | Ne yapar                                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Geliştirme sunucusu, port 1111                                                                                    |
| `npm run build` / `start` | Üretim derlemesi / üretim sunucusu (port 1111)                                                                    |
| `npm run typecheck`       | Route tiplerini üretir + `tsc --noEmit`                                                                           |
| `npm run lint`            | ESLint                                                                                                            |
| `npm run format:check`    | Prettier kontrolü (`npm run format` düzeltir)                                                                     |
| `npm test`                | Vitest: unit, property-based, contract ve bileşen testleri                                                        |
| `npm run test:e2e`        | Playwright: akışlar, 404'ler, güvenlik başlıkları, axe (WCAG 2.2 AA), responsive (375/768/1280), görsel regresyon |
| `npm run audit`           | Üretim bağımlılıkları için `npm audit`                                                                            |
| `npm run verify`          | Hepsi sırayla; E2E'yi 3 kez tekrarlayarak flaky testleri yakalar                                                  |

E2E testleri kendi üretim sunucusunu **port 1112**'de başlatır (dev sunucusu 1111'de açık kalabilir). 1112 doluysa Playwright hata verir; farklı port için `E2E_PORT=1113 npm run test:e2e`.

E2E testleri önce `npm run build` gerektirir (`verify` bunu sırayla yapar). İlk seferde: `npx playwright install chromium`.
Görsel referans ekran görüntüleri (`e2e/quality.spec.ts-snapshots/`) macOS'ta üretildi; farklı işletim sisteminde/CI'da `npx playwright test --update-snapshots` ile o platform için yeniden üretilmeli ve gözle kontrol edilmelidir.

## Proje yapısı

```
app/[locale]/            Sayfalar (ana sayfa, collection, collection/[slug], sell, about, journal, contact, legal/[page])
components/              UI — layout/, home/, catalog/, forms/, ui/ (ortak parçalar)
config/site.ts           Marka adı ve iletişim bilgileri (tek kaynak)
data/                    Markalar, ürünler, journal (statik, tip güvenli)
lib/                     Saf iş mantığı: i18n, katalog filtre/sorgu, form şemaları, link üretimi, formatlama
messages/{de,en,tr}.json Tüm arayüz metinleri
proxy.ts                 Dil öneki yoksa Accept-Language'e göre yönlendirme
tests/, e2e/             Contract + bileşen testleri, Playwright testleri
```

## Sık yapılan işler

- **Marka adı / telefon / e-posta / WhatsApp değiştirme:** sadece `config/site.ts`. Şu anki numara ve e-posta bilerek ulaşılamayan yer tutuculardır (+44 7700 900xxx kurgu aralığı, `example.com`).
- **Ürün ekleme:** `data/products.ts` içine yeni bir nesne ekleyin, fotoğrafı `public/images/` altına koyun. `npm test` şemayı, benzersiz slug'ı, marka–kategori uyumunu ve görselin varlığını otomatik kontrol eder.
- **Metin değiştirme:** `messages/*.json`. Üç dosyanın anahtarları birebir aynı olmak zorundadır (contract test kontrol eder).
- **Tasarım:** renk, font ve harf aralığı token'ları sadece `app/globals.css` içindeki `@theme` bloğunda tanımlıdır; bileşenlerde ham renk kullanılmaz.

## Tasarım ve mühendislik kararları

- **Vitrin, ödeme yok:** formlar tarayıcıda zod ile doğrulanır ve ziyaretçinin e-posta uygulamasını hazır mesajla açar; site hiçbir veri saklamaz. WhatsApp linkine sadece ürün adı eklenir (kişisel veri üçüncü taraf URL'ye gitmez).
- **Çerez banner'ı yok:** site çerez kullanmıyor ve üçüncü taraf kaynak yüklemiyor (fontlar kendi sunucumuzdan). Analytics/pazarlama aracı eklenirse banner zorunlu hale gelir.
- **Fotoğraf yükleme alanı yok:** backend olmadan çalışmayacağı için sahte UI eklenmedi; kullanıcıya fotoğrafları e-posta/WhatsApp ile göndermesi söylenir.
- **Fail-closed:** geçersiz filtre değerleri varsayılana döner; bilinmeyen ürün/sayfa gerçek HTTP 404 döner (`ensureStatic = "navigation"`).
- **Güvenlik başlıkları:** CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (`next.config.ts`). HSTS barındırma tarafında (ör. Vercel) açılmalı.
- **Erişilebilirlik:** WCAG 2.2 AA kontrastları hesaplandı (`app/globals.css`), tüm dokunma hedefleri ≥ 44 px, `prefers-reduced-motion` desteklenir, menü yerel `<dialog>` (odak hapsi + Escape).
- **Marka adları:** satış için tanımlayıcı olarak kullanılır; logo kullanılmaz. Footer'da bağımsız satıcı olunduğu belirtilir.

## Abin için sonraki adımlar

1. Gerçek stok, kendi fotoğrafları ve doğrulanmış ürün bilgileri (`data/products.ts`) — ileride bir CMS/veritabanına taşınabilir; `lib/catalog/schema.ts` sözleşmesi korunmalı.
2. Form backend'i (ör. Route Handler + e-posta servisi), spam koruması ve fotoğraf yükleme.
3. Ödeme: Stripe / Shopify Headless — kart verisi asla kendi sunucunuzda tutulmamalı.
4. Yasal metinler, Impressum ve şirket bilgileri (Almanya e-ticaret avukatı).
5. Yayın: Vercel; alan adı, HSTS, gerçek `SITE.url` (`config/site.ts`).

## Görsel lisansları

`public/images/` altındaki fotoğraflar [Unsplash](https://unsplash.com/license) lisanslıdır (ticari kullanım serbest, atıf gerekmez). Başka bir markanın logosu okunan fotoğraflar bilinçli olarak çıkarıldı; uygun fotoğrafı olmayan ürünlerde `placeholder-mv.jpg` (kendi monogramımız) kullanılır. Unsplash fotoğraf kimlikleri: 1535632066927, 1547996160, 1566150905458, 1587836374828, 1590548784585, 1594534475808, 1599643478518, 1600721391776, 1605100804763, 1611591437281, 1575032617751, 1594223274512, 1609587312208, 1617038220319, 1620625515032.

## Kayıtlar

- [`ACTIONS-TAKEN.md`](ACTIONS-TAKEN.md) — yapılan her adımın komut ve kanıtlarıyla denetim kaydı
- [`CURRENT-CONTEXT.md`](CURRENT-CONTEXT.md) — güncel durum, kararlar, açık riskler

## Yönetim paneli

İlk yönetici hesabını terminalden oluşturun (parola gizli sorulur, hiçbir dosyaya yazılmaz):

```bash
npm run admin:create -- --email siz@ornek.com --name "Ad Soyad" --role owner
```

Panel: <http://localhost:1111/admin>. Roller:

| Rol      | Yetkiler                                                                  |
| -------- | ------------------------------------------------------------------------- |
| `owner`  | Her şey + kullanıcı yönetimi + denetim kaydı                              |
| `editor` | Ürün, marka, kategori, ana sayfa içeriği, journal, medya ve sürüm geçmişi |

Güvenlik: parolalar argon2id ile saklanır, oturum çerezi `httpOnly` + `SameSite=Strict`, veritabanında yalnızca token'ın SHA-256 özeti tutulur, 15 dakikada 5 hatalı denemede hesap geçici olarak kilitlenir, her yönetim işlemi denetim kaydına yazılır.

E2E testleri kendi izole veritabanını (`maison_vault_e2e`) her çalıştırmada sıfırdan kurar ve rastgele parolalı geçici test hesapları oluşturur; geliştirme verinize dokunmaz.

### Panelde neler yapılabilir?

| Bölüm                 | İşlev                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Ürünler               | Ekle/düzenle, 4 dilde malzeme ve açıklama, fiyat (boş = "fiyat sorunuz"), durum, görünürlük, çoklu görsel                              |
| Markalar              | Ekle/düzenle (ör. Miu Miu), açıklama, marka sayfası görseli, sıra, görünürlük — her markanın kendi sayfası olur                        |
| Kategoriler           | Ekle/düzenle (ör. Ayakkabılar), kategori görseli                                                                                       |
| Ana sayfa içeriği     | Giriş (hero) görseli ve metinleri dahil ana sayfadaki **her bölüm**, iletişim bilgileri (e-posta, telefon, WhatsApp, adres, Instagram) |
| Journal               | Yazı ekle/düzenle, görsel                                                                                                              |
| Medya                 | Yüklenen tüm görsellerin tüm sürümleri                                                                                                 |
| Sürüm geçmişi         | Her kaydın her sürümü, alan bazında farklar, **"Bu sürüme dön"**                                                                       |
| Denetim kaydı (sahip) | Kim, ne zaman, neyi değiştirdi                                                                                                         |

**Sürümleme:** Her kaydetme yeni bir sürüm oluşturur; geri dönmek eski sürümü **yeni bir sürüm olarak** yayınlar, geçmiş asla silinmez. Görseller üzerine yazılmaz: yeni görsel yeni bir dosya sürümüdür (`home/home-hero/20261014-153000_v3_a1b2c3d4.webp`), eski dosya arşivde kalır. İki kişi aynı kaydı aynı anda düzenlerse ikinci kayıt reddedilir (veri kaybı olmaz).

**Diller:** Almanca zorunludur; İngilizce, Fransızca ve Türkçe boş bırakılırsa sitede Almanca gösterilir ve panel eksik çevirileri listeler.

**Değişiklikler sitede anında görünür** (önbellek her kayıtta yenilenir).

### Gelen talepler ve kişisel veriler

- Sitedeki formlar (ürün sorusu, iletişim, satış) talepleri **sunucuda saklar**; JavaScript kapalıyken de çalışır, kişisel veri asla URL'ye girmez.
- Satış formunda en fazla 4 fotoğraf (her biri ≤ 10 MB, toplam ≤ 20 MB); fotoğraflar yeniden kodlanır (EXIF/GPS silinir) ve **herkese açık değildir** (`storage/private`, yalnızca oturum açmış yetkili personel görür).
- Kötüye kullanım koruması: adres başına (IPv6'da /64 blok başına) saatte 5 talep; fotoğraflı talepler için ayrıca tüm ziyaretçiler toplamında saatte 200 sınır (fotoğrafsız sorular hiçbir zaman toplam sınırla engellenmez — bilinçli tercih: çok sayıda adres bloğu kontrol eden bir saldırgan kutuyu metin taleplerle doldurabilir ama gerçek müşterileri engelleyemez); aynı anda adres başına 1, toplam 4 fotoğraf yüklemesi işlenir; disk boşluğu 2 GB'ın altına inerse fotoğraf kabul edilmez; botlar için gizli alan (honeypot).
- Ham IP adresi saklanmaz. Sınır için kullanılan değer, her gün değişen ve yalnızca sunucu belleğinde duran gizli bir anahtarla üretilen HMAC'tir (geri çözülemez, günler arasında ilişkilendirilemez) ve 24 saat sonra silinir. Yan etkisi: sayaç gece yarısı (UTC) ve sunucu yeniden başlayınca sıfırlanır; uygulama tek sunucu örneği olarak çalışmalıdır.
- Saklama süresi: tamamlanan talepler 6 ay sonra, diğerleri en geç 1 yıl sonra **otomatik silinir** (fotoğraflarıyla birlikte). Kurallar sunucu açılırken ve sonra saatte bir kendiliğinden (`next start`, trafik gerekmez), ayrıca her talepte ve gelen kutusu her açıldığında uygulanır; süreç sürekli çalışmıyorsa veya zamanlayıcı `RETENTION_TIMER=off` ile kapatıldıysa günlük görev kullanın: `npm run inquiries:purge` (ör. cron `15 3 * * * cd /uygulama/klasoru && npm run inquiries:purge`; `.env.local` içinde `PRIVATE_STORAGE_ROOT` **mutlak yol** olmalı, yoksa dosyalar bulunamaz).
- Oturum verileri de aynı yolla temizlenir: süresi dolan oturumlar ve güvenilen cihazlar silinir, giriş denemeleri (e-posta ve adres içerir) 7 gün sonra silinir.
- Bilinen sınır: oturumu çalınan biri 5 yanlış denemeyle gerçek kullanıcının kendi parola değişikliğini 15 dakika engelleyebilir; sahip (owner) parolayı her zaman sıfırlayabilir.
- **Yayından önce:** Datenschutzerklärung (gizlilik politikası) bu işleme, saklama süresine ve silme hakkına göre bir hukukçuyla güncellenmelidir. Yeni talep için e-posta bildirimi henüz yok (SMTP gerektirir); panelde "Talepler" yanında yeni talep sayısı görünür.

### Analiz (çerezsiz)

- Ziyaretçi tarafında çerez, IP adresi, tarayıcı bilgisi **saklanmaz**; yalnızca "hangi sayfa, hangi gün, kaç kez" sayılır (400 gün tutulur).
- "Do Not Track" / "Global Privacy Control" gönderen ziyaretçiler, botlar, başka sitelerden gelen istekler ve var olmayan sayfalar sayılmaz.
- Sayaçlar kasıtlı sahte isteklerle şişirilebilir (kimlik tutulmadığı için ayırt edilemez; adres başına dakikada 60 ile sınırlıdır); sayılar eğilim göstergesidir, kesin ölçüm değildir.
- Yayından önce gizlilik politikasında kısaca belirtilmelidir (hukukçu onayı).

### Yedekleme ve geri yükleme

Veritabanı, görseller ve gizli dosyalar (talep fotoğrafları) birlikte yedeklenir:

```bash
npm run db:backup
```

```bash
npm run db:restore -- backups/<dosya>.dump
```

Silinen kayıtlar yedekten geri gelmez: panelden yapılan her kalıcı silme ve saklama süresi dolduğu için yapılan her otomatik silme, `PRIVATE_STORAGE_ROOT` altındaki `erasure-ledger.jsonl` dosyasına (yalnızca talep kimliği ve zamanı) silme tamamlanmadan önce yazılır; bu dosya yazılamazsa silme yapılmaz. Geri yükleme, yedek klasöründeki tüm `private_*.tar.gz` arşivlerinin kopyalarında olup canlı dosyada olmayan kayıtları canlı dosyaya **ekler** (canlı dosya hiçbir kaydını kaybetmez; canlı dosya hiç yoksa arşivlerdeki kopyalardan oluşur), veritabanını şemalarıyla birlikte boşaltıp yedeği yükler, gerekiyorsa migration'ları çalıştırır, listedeki talepleri ve fotoğraflarını yeniden siler, ardından saklama kurallarını uygular ve yalnızca sayıları raporlar. Arşivler veritabanına dokunulmadan önce doğrulanır; bozuk bir arşivde veya dosyada bozuk bir satır varsa geri yükleme veritabanına dokunmadan durur (satır numarasını belirterek); geri yüklenen setin dışındaki okunamayan arşivler ise atlanır ve yalnızca sayıları raporlanır. Yalnızca dosyanın sonunda yarım kalmış tek bir satır (tamamlanmamış yazma) yok sayılır ve sayısı raporlanır. Veritabanı değiştirildikten sonra bir adım başarısız olsa bile liste yeniden uygulanır; bu da başarısız olursa geri yükleme yüksek sesle uyarır ve hata koduyla biter. Dosyayı silmeyin veya elle düzenlemeyin.

Yedekler 30 gün saklanır: `npm run db:backup` başarılı olduktan sonra ve `npm run inquiries:purge` her çalıştığında `BACKUP_DIR` (varsayılan `backups`) klasöründeki 30 günden eski yedek setleri silinir; kişisel veriler bu yüzden yedeklerde silme tarihinden sonra **en fazla 30 gün** daha bulunabilir. Web sunucusunun zamanlayıcısı yedek silmez, bu yüzden günlük `inquiries:purge` görevi yedekleri tutan makinede çalışmalıdır. Yalnızca `<veritabanı>_<zaman>.dump`, `media_<zaman>.tar.gz` ve `private_<zaman>.tar.gz` adlı normal dosyalara dokunulur; en yeni tam set, eski olsa bile her zaman korunur (yeni yedek alınmıyorsa veriler 30 günü aşabilir). `BACKUP_DIR` sembolik bağlantı olamaz; öyleyse döndürme yapılmaz ve hata verilir.

### Yayına alırken (güvenlik)

- Uygulamayı doğrudan internete açmayın; önüne `X-Forwarded-For` başlığını **kendisi ekleyen/üzerine yazan** bir ters proxy (ör. nginx, Caddy, platform yük dengeleyicisi) koyun. **Zorunludur:** Next.js bu başlığa gerçek adresi eklemez (yalnızca başlık hiç yoksa doldurur); proxy olmadan ziyaretçi kendi adresini seçebilir ve giriş/talep/analiz sınırlarını aşabilir. Proxy'nin arkasında başka güvenilir proxy varsa sayısını `TRUSTED_PROXY_HOPS` ile belirtin. Üretimde bu değer **açıkça** ayarlanmalıdır (genelde `0`); ayarlanmazsa uygulama adres gerektiren ilk istekte bilinçli olarak hata verir.
- Sunucu eylemlerinin gövde sınırı 21 MB'tır (satış formundaki fotoğraflar için); bu sınır tüm formlar için geçerlidir. Proxy'de de makul bir istek boyutu sınırı (ör. nginx `client_max_body_size 21m`) ayarlayın.
- Giriş koruması: aynı e-posta + adres için 15 dakikada 5, aynı adres için 20, bir e-posta için tüm adreslerden 50 hatalı deneme sınırı. Daha önce başarıyla giriş yapılmış tarayıcılar ("güvenilir cihaz", 90 gün) e-posta sınırından etkilenmez — saldırgan sahibi kilitleyemez.
- HTTPS zorunludur (çerezler `__Host-` önekli ve `Secure`, HSTS açık).
