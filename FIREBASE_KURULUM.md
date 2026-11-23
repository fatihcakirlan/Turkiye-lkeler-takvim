# Firebase ve Ortam Değişkenleri Kurulum Talimatları

## 1. Firebase Konfigürasyonu
Proje kök dizinindeki `firebase-applet-config.json` dosyası Firebase istemci SDK'sını (`Auth`, `Firestore`, `Storage`) otomatik olarak yapılandırır:
- `projectId`, `apiKey`, `authDomain`, `firestoreDatabaseId`, `storageBucket` değerleri ProvisionFirebase ile otomatik atanır.
- Sunucu (`server.ts`), Firebase ID token doğrulaması (`verifyIdToken`) için `firebase-admin/app` ve `firebase-admin/auth` kullanır.

## 2. Ortam Değişkenleri (AI Studio Settings -> Secrets veya `.env`)
Sunucu tarafındaki gizli değişkenleri `.env.example` dosyasını referans alarak tanımlayın:

- `ADMIN_INITIAL_PASSWORD`: Yönetici paneli (`/#/yoneticipaneli`) ilk giriş şifresi. Kaynak kodda asla düz metin olarak saklanmaz; sunucuda `scrypt` ile özetlenerek doğrulanır. Eğer ortam değişkeni tanımlı değilse, `/#/yoneticipaneli` ilk açılışta tek seferlik **İlk Kurulum Şifre Belirleme** ekranı sunar.
- `ADMIN_SESSION_SECRET`: Sunucu oturum token imzalama anahtarı (tanımlanmazsa bellek içi güvenli rastgele anahtar üretilir).
- `INSTAGRAM_ACCESS_TOKEN`: (İsteğe bağlı) `@kirmizivemavitakim` için resmi Instagram Graph API erişim anahtarı. Tanımlı değilse sunucu genel profil sorgusu dener ve erişilemediğinde son geçerli takipçi sayısını korur.

## 3. Firestore Güvenlik Kuralları ve Koleksiyonlar
- `adminler`: Yönetici hesapları ve rolleri (yalnızca yetkili yöneticiler okuyabilir ve yazabilir).
- `ulkeler`: Ülke tanımları, bayraklar, takım renkleri, 3B asker modelleri ve asker sayıları.
- `savaslar`: Canlı savaş durumu, duvar yüksekliği, seçili ülkeler ve kalan asker sayıları.
- `ayarlar`: Takipçi başına asker sayısı, arena teması, duvar iniş süresi ve simülasyon hızı.
- `instagram`: `@kirmizivemavitakim` takipçi sayısı, senkronizasyon durumu ve son güncelleme zamanı.
- `battle_history`: Tamamlanan savaşlar, ülke karşılaştırma geçmişi ve Firebase Storage Reels video bağlantıları.

## 4. Firebase Storage (Reels Video Kaydı)
Firebase Storage kurallarında yalnızca yetkili yöneticilerin `/reels/**` altına `.mp4`/`.webm` yüklemesine izin verin, okuma erişimini yayınlanan Reels videoları için açın.
