# Maison Vault

Lüks ikinci el çanta (Hermès, Louis Vuitton, Chanel), saat (Rolex, Patek Philippe) ve mücevher (Van Cleef & Arpels) için mat siyah + şampanya altını **vitrin sitesi**. Yapı olarak [vdmcars.de](https://vdmcars.de) örnek alındı. Diller: Almanca (varsayılan), İngilizce, Türkçe.

> **Durum: demo.** Ürünler, fiyatlar ve fotoğraflar yer tutucudur. Yasal sayfalar (Impressum, Datenschutz, AGB, Widerruf) avukat tarafından yazılmadan yayına alınmamalıdır.

## Hızlı başlangıç

Gereksinim: Node.js ≥ 20.9

```bash
npm install
```

```bash
npm run dev
```

Arayüz: <http://localhost:1111> (tarayıcı diline göre `/de`, `/en` veya `/tr`'ye yönlendirir).

## Komutlar

| Komut                     | Ne yapar                                                                                                         |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `npm run dev`             | Geliştirme sunucusu, port 1111                                                                                   |
| `npm run build` / `start` | Üretim derlemesi / üretim sunucusu (port 1111)                                                                   |
| `npm run typecheck`       | Route tiplerini üretir + `tsc --noEmit`                                                                          |
| `npm run lint`            | ESLint                                                                                                           |
| `npm run format:check`    | Prettier kontrolü (`npm run format` düzeltir)                                                                    |
| `npm test`                | Vitest: unit, property-based, contract ve bileşen testleri                                                       |
| `npm run test:e2e`        | Playwright: akışlar, 404'ler, güvenlik başlıkları, axe (WCAG 2.2 AA), responsive (375/768/1280), görsel regresyon |
| `npm run audit`           | Üretim bağımlılıkları için `npm audit`                                                                           |
| `npm run verify`          | Hepsi sırayla; E2E'yi 3 kez tekrarlayarak flaky testleri yakalar                                                 |

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
