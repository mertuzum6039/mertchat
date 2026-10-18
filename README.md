# MertChat — kurulum rehberi

Bu proje telefon, tablet ve bilgisayarlara uyumlu bir web mesajlaşma uygulaması başlangıcıdır. Gerçek hesaplar ve mesajlar Firebase üzerinden çalışır. Firebase bilgileri eklenmeden uygulama çevrim içi çalışmaz.

## Dosyalar
- `index.html`: Sayfa yapısı
- `styles.css`: Duyarlı tasarım
- `app.js`: Firebase Authentication ve Firestore işlemleri
- `firestore.rules`: Veritabanı güvenlik kuralları

## 1. Firebase projesi oluştur
1. https://console.firebase.google.com/ adresini aç.
2. **Add project / Proje ekle** seçeneğine basıp `mertchat` gibi bir proje adı ver.
3. Proje açılınca **Build > Authentication > Get started** bölümüne gir.
4. **Sign-in method** bölümünde **Email/Password** yöntemini etkinleştir.
5. **Build > Firestore Database > Create database** bölümünden veritabanı oluştur. Başlangıçta üretim modu seçebilirsin; birazdan kuralları yayınlayacağız.

## 2. Web uygulaması ekle
1. Firebase Console > Project Overview > web simgesi (`</>`) ile web uygulaması ekle.
2. Uygulamaya `MertChat` adını ver. Firebase Hosting'i şimdi etkinleştirmek zorunda değilsin.
3. Firebase sana `firebaseConfig` kodunu gösterecek.
4. `app.js` dosyasını bir metin editöründe aç. `const firebaseConfig = { ... }` içindeki `BURAYA_...` değerlerini kendi projenin değerleriyle değiştir.
   - `apiKey`
   - `authDomain`
   - `projectId`
   - `storageBucket`
   - `messagingSenderId`
   - `appId`

Firebase web config'i kullanıcı şifresi değildir; yine de güvenliği asıl sağlayan Firestore kuralları ve Authentication ayarlarıdır. Şifreni veya özel anahtarlarını kimseyle paylaşma.

## 3. İlk yönetici hesabını oluştur
1. Uygulamayı bir yerel web sunucusu ile aç (aşağıya bak); `file://` üzerinden açma.
2. **Hesap oluştur** bölümünden kendi kullanıcı adınla ilk hesabını oluştur. Örneğin `mert_uzum`. Şifren en az 6 karakter olmalı.
3. Firebase Console > Build > Authentication > Users bölümünü aç ve oluşturduğun hesabı seç.
4. Kullanıcının **UID** değerini kopyala.
5. `app.js` içindeki `const ADMIN_UID = "BURAYA_YONETICI_UID";` alanına UID'ni yapıştır.
6. `firestore.rules` dosyasında `isAdmin()` fonksiyonundaki `"BURAYA_YONETICI_UID"` yazısını da aynı UID ile değiştir.
7. Firebase Console > Firestore Database > Rules bölümüne `firestore.rules` dosyasının içeriğini yapıştır ve **Publish** düğmesine bas.
8. Sayfayı yenile. ⚙ yönetici düğmesi yalnızca senin hesabında görünmelidir.

**Önemli:** Yönetici UID'sini sadece kendi hesabına ver. UID gizli bir parola değildir; yetki kontrolü Firestore güvenlik kurallarıyla da yapılır.

## 4. Bilgisayarında dene
`MertChat` klasörünü VS Code ile aç. VS Code'da Live Server eklentisi varsa `index.html` dosyasına sağ tıklayıp **Open with Live Server** seç. Yoksa Python kurulu bilgisayarda klasör içinde terminal açıp şunu çalıştırabilirsin:

```bash
python -m http.server 8000
```

Sonra tarayıcıda `http://localhost:8000` adresini aç.

## 5. Herkesin kullanabilmesi için yayınla
Bu proje statik dosyalardan oluştuğu için Firebase Hosting veya GitHub Pages üzerinde yayınlanabilir. Firebase Hosting kullanmak istersen Firebase Console'da Hosting bölümünü açıp yönergeleri takip et. Yayınladıktan sonra verdiğin web adresini arkadaşlarınla paylaşabilirsin. Telefon, tablet ve bilgisayarda aynı hesapla giriş yapabilirler.

## Nasıl çalışır?
- Herkes bir kullanıcı adı ve şifreyle hesap açabilir.
- Kullanıcı adları benzersiz olmalı; Firebase Authentication bu kontrolü dahili kullanıcı adı adresi üzerinden yapar.
- Giriş yapan kullanıcılar diğer kullanıcıları görebilir.
- Kullanıcı seçerek bire bir mesaj gönderebilir.
- Yönetici paneli kayıtlı kullanıcı adlarını ve son görülme bilgisini gösterir; parolaları göstermez.

## Güvenlik ve sınırlar
- Kullanıcı adları ve son görülme bilgileri giriş yapan kullanıcılara görünür. Gerçek ad, telefon, adres veya okul gibi kişisel bilgileri kullanıcı adı olarak seçmeyin.
- Bu başlangıç sürümünde mesajlar iki katılımcı arasında bire bir sohbet şeklindedir. Grup sohbeti, görsel gönderme, mesaj silme ve şifre sıfırlama henüz ekli değildir.
- Bu örnek, kullanıcı adıyla giriş yapabilmek için Firebase Authentication'da `kullaniciadi@users.mertchat.invalid` biçiminde dahili bir e-posta adresi kullanır. Kullanıcıdan gerçek e-posta istenmez; bu nedenle şifre sıfırlama akışı henüz yoktur.
- Firestore ücretleri ve kullanım kotaları olabilir. Firebase Console'da bütçe/usage bilgilerini kontrol et.
- Herkese açık yayın öncesi güvenlik kurallarını test et; şifreleri asla Firestore'a kaydetme.
