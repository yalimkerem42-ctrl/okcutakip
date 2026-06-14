// ════════════════════════════════════════════════════════════════════
//  auth.js  —  Üyelik (Firebase Authentication) mantığı
//  OKÇUTAKİP — Geleneksel Türk Okçuluğu Performans Takip Sistemi
// --------------------------------------------------------------------
//  Sorumluluklar:
//   • Kayıt / Giriş / Çıkış işlemleri (Email & Password)
//   • Oturum durumunu izleme (onAuthStateChanged) ve arayüzü güncelleme
//   • Profil bilgilerini gösterme
//   • Giriş/Üyelik modallarının açılıp kapanması
//
//  Not: Bağlantı ayarları firebase-config.js içindedir (modüler yapı).
// ════════════════════════════════════════════════════════════════════

import { auth } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";

// Aktif kullanıcı referansı (gözlemci tarafından güncellenir)
let currentUser = null;

// ────────────────────────────────────────────────────────────────────
//  YARDIMCI: Toast (mevcut global fonksiyonu kullan, yoksa sessiz geç)
// ────────────────────────────────────────────────────────────────────
function toast(msg) {
  if (typeof window.showToast === "function") window.showToast(msg);
}

// ────────────────────────────────────────────────────────────────────
//  MODAL KONTROLÜ
// ────────────────────────────────────────────────────────────────────
function openAuthModal(which) {
  // Sidebar açıksa kapat (mevcut fonksiyon)
  if (typeof window.closeSidebar === "function") window.closeSidebar();
  closeAuthModal(); // diğerini kapat
  clearAuthErrors();

  const id = which === "register" ? "register-backdrop" : "login-backdrop";
  const el = document.getElementById(id);
  if (el) el.classList.add("open");

  // İlk alana odaklan
  const firstInput = which === "register"
    ? document.getElementById("register-name")
    : document.getElementById("login-email");
  if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
}

function closeAuthModal() {
  document.querySelectorAll(".auth-backdrop").forEach(function (b) {
    b.classList.remove("open");
  });
}

function clearAuthErrors() {
  ["login-error", "register-error"].forEach(function (id) {
    const el = document.getElementById(id);
    if (el) { el.textContent = ""; el.classList.remove("show"); }
  });
}

function showAuthError(formId, message) {
  const el = document.getElementById(formId + "-error");
  if (el) { el.textContent = message; el.classList.add("show"); }
}

// Modal dışına / Escape tuşuna basınca kapat
document.addEventListener("click", function (e) {
  if (e.target && e.target.classList && e.target.classList.contains("auth-backdrop")) {
    closeAuthModal();
  }
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeAuthModal();
});

// ────────────────────────────────────────────────────────────────────
//  BUTON YÜKLENİYOR DURUMU
// ────────────────────────────────────────────────────────────────────
function setLoading(btnId, loading, idleText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.idle = btn.textContent;
    btn.textContent = "Lütfen bekleyin...";
    btn.classList.add("btn-loading");
  } else {
    btn.textContent = idleText || btn.dataset.idle || btn.textContent;
    btn.classList.remove("btn-loading");
  }
}

// ────────────────────────────────────────────────────────────────────
//  KONFIGÜRASYON KONTROLÜ
// ────────────────────────────────────────────────────────────────────
function configNotSet() {
  // firebase-config.js'deki placeholder değerleri hâlâ duruyorsa uyar
  try {
    return auth && auth.app && auth.app.options &&
           typeof auth.app.options.apiKey === "string" &&
           auth.app.options.apiKey.indexOf("BURAYA_") === 0;
  } catch (e) { return false; }
}

// ────────────────────────────────────────────────────────────────────
//  HATA MESAJLARI (Türkçe)
// ────────────────────────────────────────────────────────────────────
function translateError(err) {
  const code = (err && err.code) ? err.code : "";
  switch (code) {
    case "auth/invalid-email":
      return "Geçersiz e-posta adresi.";
    case "auth/missing-password":
      return "Lütfen şifrenizi girin.";
    case "auth/weak-password":
      return "Şifre en az 6 karakter olmalıdır.";
    case "auth/email-already-in-use":
      return "Bu e-posta adresiyle zaten bir hesap mevcut.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "E-posta veya şifre hatalı.";
    case "auth/too-many-requests":
      return "Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.";
    case "auth/network-request-failed":
      return "Ağ hatası. İnternet bağlantınızı kontrol edin.";
    case "auth/operation-not-allowed":
      return "E-posta/Şifre girişi etkin değil. Firebase Console → Authentication → Sign-in method bölümünden etkinleştirin.";
    case "auth/invalid-api-key":
    case "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      return "Firebase API anahtarı geçersiz. firebase-config.js dosyasını kontrol edin.";
    default:
      return "Bir hata oluştu" + (code ? " (" + code + ")" : "") + ". Lütfen tekrar deneyin.";
  }
}

// ────────────────────────────────────────────────────────────────────
//  KAYIT (Üye Ol)
// ────────────────────────────────────────────────────────────────────
async function authRegister() {
  clearAuthErrors();

  const name  = (document.getElementById("register-name").value || "").trim();
  const email = (document.getElementById("register-email").value || "").trim();
  const pass  = document.getElementById("register-password").value || "";

  if (configNotSet()) {
    showAuthError("register", "Firebase yapılandırılmamış. Lütfen firebase-config.js dosyasına kendi bilgilerinizi girin.");
    return;
  }
  if (!name)  { showAuthError("register", "Lütfen ad soyadınızı girin."); return; }
  if (!email) { showAuthError("register", "Lütfen e-posta adresinizi girin."); return; }
  if (pass.length < 6) { showAuthError("register", "Şifre en az 6 karakter olmalıdır."); return; }

  setLoading("register-submit", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    // Ad Soyad bilgisini profile yaz
    await updateProfile(cred.user, { displayName: name });
    closeAuthModal();
    toast("Hoş geldiniz, " + name.split(" ")[0] + "! Hesabınız oluşturuldu.");
    // Gözlemci arayüzü güncelleyecek; profili tazele
    refreshAuthUI(cred.user);
  } catch (err) {
    showAuthError("register", translateError(err));
  } finally {
    setLoading("register-submit", false, "Üye Ol");
  }
}

// ────────────────────────────────────────────────────────────────────
//  GİRİŞ (Giriş Yap)
// ────────────────────────────────────────────────────────────────────
async function authLogin() {
  clearAuthErrors();

  const email = (document.getElementById("login-email").value || "").trim();
  const pass  = document.getElementById("login-password").value || "";

  if (configNotSet()) {
    showAuthError("login", "Firebase yapılandırılmamış. Lütfen firebase-config.js dosyasına kendi bilgilerinizi girin.");
    return;
  }
  if (!email) { showAuthError("login", "Lütfen e-posta adresinizi girin."); return; }
  if (!pass)  { showAuthError("login", "Lütfen şifrenizi girin."); return; }

  setLoading("login-submit", true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    closeAuthModal();
    const ad = (cred.user.displayName || "").split(" ")[0] || "Okçu";
    toast("Tekrar hoş geldiniz, " + ad + "!");
  } catch (err) {
    showAuthError("login", translateError(err));
  } finally {
    setLoading("login-submit", false, "Giriş Yap");
  }
}

// ────────────────────────────────────────────────────────────────────
//  ÇIKIŞ (Çıkış Yap)
// ────────────────────────────────────────────────────────────────────
async function authLogout() {
  if (typeof window.closeSidebar === "function") window.closeSidebar();
  try {
    await signOut(auth);
    toast("Çıkış yapıldı.");
    // Çıkışta ana sayfaya dön
    if (typeof window.showSection === "function") window.showSection("home");
  } catch (err) {
    toast("Çıkış yapılamadı. Tekrar deneyin.");
  }
}

// ────────────────────────────────────────────────────────────────────
//  TARİH BİÇİMLENDİRME (Türkçe)
// ────────────────────────────────────────────────────────────────────
function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("tr-TR", {
      day: "numeric", month: "long", year: "numeric"
    });
  } catch (e) {
    return "—";
  }
}

// ────────────────────────────────────────────────────────────────────
//  PROFİL EKRANINI DOLDUR
// ────────────────────────────────────────────────────────────────────
function renderProfile() {
  const u = currentUser;
  if (!u) return; // misafir görünümü zaten gösteriliyor

  const name  = u.displayName || "İsimsiz Okçu";
  const email = u.email || "—";
  const created = u.metadata ? formatDate(u.metadata.creationTime) : "—";
  const initial = (name || email || "O").trim().charAt(0).toUpperCase() || "O";

  const set = function (id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  set("profile-avatar", initial);
  set("profile-name", name);
  set("profile-email-top", email);
  set("profile-fullname", name);
  set("profile-email", email);
  set("profile-created", created);
}

// ────────────────────────────────────────────────────────────────────
//  ARAYÜZÜ OTURUM DURUMUNA GÖRE GÜNCELLE
// ────────────────────────────────────────────────────────────────────
function refreshAuthUI(user) {
  const authed = !!user;

  // Sidebar öğeleri ve görünüm blokları (.member-* göster / .guest-* gizle)
  document.querySelectorAll(".member-view, .member-item").forEach(function (el) {
    el.classList.toggle("hidden-auth", !authed);
  });
  document.querySelectorAll(".guest-view, .guest-item").forEach(function (el) {
    el.classList.toggle("hidden-auth", authed);
  });

  // Ana sayfa kartındaki selamlama adı
  if (authed) {
    const ad = (user.displayName || "").split(" ")[0]
            || (user.email ? user.email.split("@")[0] : "Okçu");
    const greet = document.getElementById("home-greet-name");
    if (greet) greet.textContent = ad;
  }

  // Profil ekranı açıksa tazele
  renderProfile();
}

// ────────────────────────────────────────────────────────────────────
//  OTURUM GÖZLEMCİSİ — sayfa yüklenince ve her durum değişiminde çalışır
//  (oturum kalıcılığı firebase-config.js'de LOCAL olarak ayarlandı)
// ────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, function (user) {
  currentUser = user;
  refreshAuthUI(user);

  // Giriş yapılmamış kullanıcı profildeyse ana sayfaya yönlendir
  if (!user) {
    const profileSection = document.getElementById("profile");
    if (profileSection && profileSection.classList.contains("active")
        && typeof window.showSection === "function") {
      window.showSection("home");
    }
  }
});

// ────────────────────────────────────────────────────────────────────
//  ENTER TUŞU İLE GÖNDERME
// ────────────────────────────────────────────────────────────────────
function bindEnter(inputIds, handler) {
  inputIds.forEach(function (id) {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); handler(); }
      });
    }
  });
}
bindEnter(["login-email", "login-password"], authLogin);
bindEnter(["register-name", "register-email", "register-password"], authRegister);

// ────────────────────────────────────────────────────────────────────
//  GLOBAL ERİŞİM — HTML onclick işleyicileri bu fonksiyonları çağırır
// ────────────────────────────────────────────────────────────────────
window.openAuthModal  = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.authRegister   = authRegister;
window.authLogin      = authLogin;
window.authLogout     = authLogout;
window.renderProfile  = renderProfile;
