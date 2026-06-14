// ════════════════════════════════════════════════════════════════════
//  firebase-config.js  —  Firebase bağlantı ve başlatma modülü
//  OKÇUTAKİP — Geleneksel Türk Okçuluğu Performans Takip Sistemi
// --------------------------------------------------------------------
//  Servisler: Authentication + Firestore + Storage
//  Bu dosya yalnızca başlatır ve servisleri dışa aktarır.
//  Mantık: auth.js (üyelik/profil) + data.js (antrenman verileri).
//  GitHub Pages uyumlu — derleme (build) gerektirmez.
// ════════════════════════════════════════════════════════════════════

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

// ────────────────────────────────────────────────────────────────────
//  ⚠️ FIREBASE YAPILANDIRMASI
//  Aşağıdaki değerleri Firebase Console → Proje Ayarları → "Web
//  uygulaması" bölümündeki KENDİ değerlerinizle değiştirin.
//  (Bu değerlerin tarayıcıda görünür olması normaldir ve güvenlidir;
//   asıl koruma Firestore/Storage güvenlik kurallarıyla sağlanır.)
// ────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "BURAYA_API_KEY",
  authDomain:        "BURAYA_AUTH_DOMAIN",
  projectId:         "BURAYA_PROJECT_ID",
  storageBucket:     "BURAYA_STORAGE_BUCKET",
  messagingSenderId: "BURAYA_SENDER_ID",
  appId:             "BURAYA_APP_ID",
  measurementId:     "BURAYA_MEASUREMENT_ID"
};

// ── Başlat ──
const app     = initializeApp(firebaseConfig);
const auth    = getAuth(app);
const db      = getFirestore(app);
const storage = getStorage(app);

// ── Oturum kalıcılığı: LOCAL (sayfa yenilense/kapansa bile açık kalır) ──
setPersistence(auth, browserLocalPersistence).catch(function (err) {
  console.warn("[Firebase] Oturum kalıcılığı ayarlanamadı:", err);
});

// ── Genel hata bildirimi (üst banner) — tüm modüller kullanabilir ──
window.showFbError = function (msg) {
  try {
    const el = document.getElementById("fb-error-banner");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(window._fbErrTimer);
    window._fbErrTimer = setTimeout(function () { el.classList.remove("show"); }, 6000);
  } catch (e) { /* sessiz */ }
};

// Yapılandırma doldurulmamışsa kullanıcıyı bilgilendir
if (typeof firebaseConfig.apiKey === "string" && firebaseConfig.apiKey.indexOf("BURAYA_") === 0) {
  window.addEventListener("load", function () {
    window.showFbError("Firebase yapılandırılmamış. firebase-config.js dosyasına kendi proje bilgilerinizi girin.");
  });
}

export { app, auth, db, storage };
