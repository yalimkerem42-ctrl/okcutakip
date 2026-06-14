// ════════════════════════════════════════════════════════════════════
//  firebase-config.js  —  Firebase bağlantı ve başlatma modülü
//  OKÇUTAKİP — Geleneksel Türk Okçuluğu Performans Takip Sistemi
// --------------------------------------------------------------------
//  Bu dosya YALNIZCA Firebase'i başlatır ve servisleri dışa aktarır.
//  Uygulama mantığı auth.js içindedir. Böylece ileride Firestore,
//  kulüp sistemi, antrenör paneli, ısı haritası vb. eklemek kolaydır.
//
//  GitHub Pages uyumlu: derleme (build) gerektirmez, doğrudan çalışır.
// ════════════════════════════════════════════════════════════════════

// Firebase JS SDK (modüler, CDN üzerinden — kurulum gerektirmez)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

// İleride Firestore eklemek için bu satırı açın (yorumu kaldırın):
// import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

// ────────────────────────────────────────────────────────────────────
//  ⚠️ ÖNEMLİ — KENDİ FIREBASE BİLGİLERİNİZİ BURAYA YAZIN
//  Firebase Console → Proje Ayarları → "Web uygulaması" bölümünden
//  alacağınız config değerlerini aşağıdaki tırnakların içine yapıştırın.
//  (Bu değerlerin tarayıcıda görünür olması normaldir ve güvenlidir.)
// ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyA9q1e_Eq3NMiyXGVJZil1CIWdfOof2yOs",
  authDomain: "okcutakip.firebaseapp.com",
  projectId: "okcutakip",
  storageBucket: "okcutakip.firebasestorage.app",
  messagingSenderId: "352557086680",
  appId: "1:352557086680:web:9845916795413e51c524ad",
  measurementId: "G-48F86YNJ75"
};

// ── Firebase'i başlat ──
const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// İleride Firestore için:
// const db = getFirestore(app);

// ── Oturum kalıcılığı: LOCAL ──
// Kullanıcı giriş yaptıktan sonra sayfa yenilense, sekme/uygulama
// kapanıp tekrar açılsa bile oturum açık kalır (çıkış yapana kadar).
setPersistence(auth, browserLocalPersistence).catch(function (err) {
  console.warn("[Firebase] Oturum kalıcılığı ayarlanamadı:", err);
});

// ── Dışa aktarımlar (auth.js ve gelecekteki modüller kullanır) ──
export { app, auth };
// export { db };  // Firestore eklerseniz bunu da açın
