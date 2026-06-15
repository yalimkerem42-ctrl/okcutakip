// ════════════════════════════════════════════════════════════════════
//  auth.js  —  Üyelik + Profil yönetimi (Firebase Auth + Firestore + Storage)
//  OKÇUTAKİP — Geleneksel Türk Okçuluğu Performans Takip Sistemi
// --------------------------------------------------------------------
//  Sorumluluklar:
//   • Kayıt / Giriş / Çıkış (Email & Password)
//   • Oturum durumunu izleme ve arayüzü güncelleme (chip, sidebar, kart)
//   • Profil: ad, e-posta, şifre değişikliği; profil fotoğrafı (Storage)
//   • Hesap silme; gerektiğinde yeniden kimlik doğrulama (reauth)
//   • Profil bilgileri Firestore'da users/{uid} dokümanında saklanır
// ════════════════════════════════════════════════════════════════════

import { auth, db, storage } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendEmailVerification,
  updateProfile,
  updateEmail,
  updatePassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  doc, setDoc, updateDoc, getDoc, deleteDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-storage.js";

let currentUser = null;
let pendingReauthAction = null; // { fn, okMsg }

// ────────────────────────────────────────────────────────────────────
//  YARDIMCILAR
// ────────────────────────────────────────────────────────────────────
function toast(msg) { if (typeof window.showToast === "function") window.showToast(msg); }
function $(id) { return document.getElementById(id); }

function firstName(user) {
  if (!user) return "Okçu";
  if (user.displayName) return user.displayName.split(" ")[0];
  if (user.email) return user.email.split("@")[0];
  return "Okçu";
}
function initialOf(user) {
  const base = (user && (user.displayName || user.email)) || "O";
  return base.trim().charAt(0).toUpperCase() || "O";
}

// Avatar elemanına foto veya baş harf uygula
function applyAvatar(el, photoURL, initial) {
  if (!el) return;
  if (photoURL) {
    el.style.backgroundImage = 'url("' + photoURL + '")';
    el.classList.add("has-photo");
  } else {
    el.style.backgroundImage = "";
    el.classList.remove("has-photo");
    el.textContent = initial;
  }
}

// ────────────────────────────────────────────────────────────────────
//  MODAL KONTROLÜ (Giriş / Üye Ol)
// ────────────────────────────────────────────────────────────────────
function openAuthModal(which) {
  if (typeof window.closeSidebar === "function") window.closeSidebar();
  closeAuthModal();
  clearAuthErrors();
  const id = which === "register" ? "register-backdrop" : "login-backdrop";
  const el = $(id);
  if (el) el.classList.add("open");
  const firstInput = which === "register" ? $("register-name") : $("login-email");
  if (firstInput) setTimeout(function () { firstInput.focus(); }, 60);
}
function closeAuthModal() {
  document.querySelectorAll(".auth-backdrop").forEach(function (b) {
    if (b.id !== "reauth-backdrop") b.classList.remove("open");
  });
}
function clearAuthErrors() {
  ["login-error", "register-error"].forEach(function (id) {
    const el = $(id);
    if (el) { el.textContent = ""; el.classList.remove("show"); }
  });
}
function showAuthError(formId, message) {
  const el = $(formId + "-error");
  if (el) { el.textContent = message; el.classList.add("show"); }
}

// Reauth modal
function openReauthModal() {
  const el = $("reauth-backdrop");
  if (el) el.classList.add("open");
  const pw = $("reauth-password");
  if (pw) { pw.value = ""; setTimeout(function () { pw.focus(); }, 60); }
}
function closeReauthModal() {
  const el = $("reauth-backdrop");
  if (el) el.classList.remove("open");
  const er = $("reauth-error");
  if (er) { er.textContent = ""; er.classList.remove("show"); }
  pendingReauthAction = null;
}
function showReauthError(msg) {
  const el = $("reauth-error");
  if (el) { el.textContent = msg; el.classList.add("show"); }
}

// Dışına tıklama / Escape ile kapat
document.addEventListener("click", function (e) {
  if (e.target && e.target.classList && e.target.classList.contains("auth-backdrop")) {
    if (e.target.id === "reauth-backdrop") closeReauthModal();
    else e.target.classList.remove("open");
  }
});
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") { closeAuthModal(); closeReauthModal(); }
});

// Buton yükleniyor durumu
function setLoading(btnId, loading, idleText) {
  const btn = $(btnId);
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
//  YAPILANDIRMA + HATA MESAJLARI
// ────────────────────────────────────────────────────────────────────
function configNotSet() {
  try {
    return auth && auth.app && auth.app.options &&
           typeof auth.app.options.apiKey === "string" &&
           auth.app.options.apiKey.indexOf("BURAYA_") === 0;
  } catch (e) { return false; }
}
function translateError(err) {
  const code = (err && err.code) ? err.code : "";
  switch (code) {
    case "auth/invalid-email": return "Geçersiz e-posta adresi.";
    case "auth/missing-password": return "Lütfen şifrenizi girin.";
    case "auth/weak-password": return "Şifre en az 6 karakter olmalıdır.";
    case "auth/email-already-in-use": return "Bu e-posta adresiyle zaten bir hesap mevcut.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "E-posta veya şifre hatalı.";
    case "auth/too-many-requests": return "Çok fazla deneme yapıldı. Lütfen bir süre sonra tekrar deneyin.";
    case "auth/network-request-failed": return "Ağ hatası. İnternet bağlantınızı kontrol edin.";
    case "auth/requires-recent-login": return "Bu işlem için kimliğinizi yeniden doğrulamanız gerekiyor.";
    case "auth/operation-not-allowed": return "E-posta/Şifre girişi etkin değil. Firebase Console → Authentication → Sign-in method bölümünden etkinleştirin.";
    case "auth/invalid-api-key": return "Firebase API anahtarı geçersiz. firebase-config.js dosyasını kontrol edin.";
    default: return "Bir hata oluştu" + (code ? " (" + code + ")" : "") + ". Lütfen tekrar deneyin.";
  }
}

// ────────────────────────────────────────────────────────────────────
//  FIRESTORE PROFİL DOKÜMANI
// ────────────────────────────────────────────────────────────────────
async function ensureProfileDoc(user) {
  try {
    const refDoc = doc(db, "users", user.uid);
    const snap = await getDoc(refDoc);
    if (!snap.exists()) {
      await setDoc(refDoc, {
        displayName: user.displayName || "",
        email: user.email || "",
        photoURL: user.photoURL || "",
        createdAt: serverTimestamp()
      }, { merge: true });
    }
  } catch (e) {
    console.warn("[auth] Profil dokümanı oluşturulamadı:", e);
  }
}
async function updateProfileDoc(fields) {
  if (!currentUser) return;
  try {
    await setDoc(doc(db, "users", currentUser.uid), fields, { merge: true });
  } catch (e) {
    console.warn("[auth] Profil dokümanı güncellenemedi:", e);
  }
}

// ────────────────────────────────────────────────────────────────────
//  KAYIT / GİRİŞ / ÇIKIŞ
// ────────────────────────────────────────────────────────────────────
async function authRegister() {
  clearAuthErrors();
  const name  = (($("register-name").value) || "").trim();
  const email = (($("register-email").value) || "").trim();
  const pass  = $("register-password").value || "";

  if (configNotSet()) { showAuthError("register", "Firebase yapılandırılmamış. firebase-config.js dosyasına bilgilerinizi girin."); return; }
  if (!name)  { showAuthError("register", "Lütfen ad soyadınızı girin."); return; }
  if (!email) { showAuthError("register", "Lütfen e-posta adresinizi girin."); return; }
  if (pass.length < 6) { showAuthError("register", "Şifre en az 6 karakter olmalıdır."); return; }

  setLoading("register-submit", true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db, "users", cred.user.uid), {
      displayName: name, email: email, photoURL: "", createdAt: serverTimestamp()
    }, { merge: true });
    // Doğrulama e-postası gönder
    try {
      await sendEmailVerification(cred.user);
      toast("Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.");
    } catch (ve) {
      console.warn("[auth] Doğrulama e-postası gönderilemedi:", ve);
      toast("Hesabınız oluşturuldu, ancak doğrulama e-postası gönderilemedi. 'Tekrar Gönder' ile deneyin.");
    }
    closeAuthModal();
    refreshAuthUI(cred.user);
  } catch (err) {
    showAuthError("register", translateError(err));
  } finally {
    setLoading("register-submit", false, "Üye Ol");
  }
}

async function authLogin() {
  clearAuthErrors();
  const email = (($("login-email").value) || "").trim();
  const pass  = $("login-password").value || "";
  if (configNotSet()) { showAuthError("login", "Firebase yapılandırılmamış. firebase-config.js dosyasına bilgilerinizi girin."); return; }
  if (!email) { showAuthError("login", "Lütfen e-posta adresinizi girin."); return; }
  if (!pass)  { showAuthError("login", "Lütfen şifrenizi girin."); return; }

  setLoading("login-submit", true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    closeAuthModal();
    toast("Tekrar hoş geldiniz, " + firstName(cred.user) + "!");
  } catch (err) {
    showAuthError("login", translateError(err));
  } finally {
    setLoading("login-submit", false, "Giriş Yap");
  }
}

async function authLogout() {
  if (typeof window.closeSidebar === "function") window.closeSidebar();
  try {
    await signOut(auth);
    toast("Çıkış yapıldı.");
    if (typeof window.showSection === "function") window.showSection("home");
  } catch (err) {
    toast("Çıkış yapılamadı. Tekrar deneyin.");
  }
}

// ────────────────────────────────────────────────────────────────────
//  HASSAS İŞLEM ÇALIŞTIRICI (gerekirse reauth)
// ────────────────────────────────────────────────────────────────────
async function runSensitive(actionFn, okMsg) {
  try {
    await actionFn();
    if (okMsg) toast(okMsg);
    refreshAuthUI(auth.currentUser);
    renderProfile();
  } catch (err) {
    if (err && err.code === "auth/requires-recent-login") {
      pendingReauthAction = { fn: actionFn, okMsg: okMsg };
      openReauthModal();
    } else if (typeof window.showFbError === "function") {
      window.showFbError(translateError(err));
    } else {
      toast(translateError(err));
    }
  }
}

async function submitReauth() {
  const pw = $("reauth-password").value || "";
  if (!pw) { showReauthError("Lütfen mevcut şifrenizi girin."); return; }
  const user = auth.currentUser;
  if (!user) { closeReauthModal(); return; }

  setLoading("reauth-submit", true);
  try {
    const cred = EmailAuthProvider.credential(user.email, pw);
    await reauthenticateWithCredential(user, cred);
    const act = pendingReauthAction;
    closeReauthModal();
    if (act) await runSensitive(act.fn, act.okMsg);
  } catch (err) {
    showReauthError(translateError(err));
  } finally {
    setLoading("reauth-submit", false, "Doğrula ve Devam Et");
  }
}

// ────────────────────────────────────────────────────────────────────
//  PROFİL: AD / E-POSTA / ŞİFRE
// ────────────────────────────────────────────────────────────────────
function profileUpdateName() {
  const name = (($("edit-name").value) || "").trim();
  if (!name) { window.showFbError && window.showFbError("Lütfen geçerli bir ad girin."); return; }
  runSensitive(async function () {
    await updateProfile(auth.currentUser, { displayName: name });
    await updateProfileDoc({ displayName: name });
  }, "Adınız güncellendi.");
}

function profileUpdateEmail() {
  const email = (($("edit-email").value) || "").trim();
  if (!email) { window.showFbError && window.showFbError("Lütfen geçerli bir e-posta girin."); return; }
  runSensitive(async function () {
    await updateEmail(auth.currentUser, email);
    await updateProfileDoc({ email: email });
    try { await sendEmailVerification(auth.currentUser); } catch (e) {}
  }, "E-posta güncellendi. Yeni adresinize doğrulama bağlantısı gönderildi.");
}

function profileUpdatePassword() {
  const p1 = $("edit-password").value || "";
  const p2 = $("edit-password2").value || "";
  if (p1.length < 6) { window.showFbError && window.showFbError("Şifre en az 6 karakter olmalıdır."); return; }
  if (p1 !== p2) { window.showFbError && window.showFbError("Şifreler eşleşmiyor."); return; }
  runSensitive(async function () {
    await updatePassword(auth.currentUser, p1);
    $("edit-password").value = "";
    $("edit-password2").value = "";
  }, "Şifreniz güncellendi.");
}

// ────────────────────────────────────────────────────────────────────
//  PROFİL FOTOĞRAFI (Firebase Storage)
// ────────────────────────────────────────────────────────────────────
// Storage hatalarını ayrıntılı raporla (console + ekranda gerçek kod)
function logStorageError(label, err) {
  console.error("[auth] " + label);
  console.error("error.code:", err && err.code);
  console.error("error.message:", err && err.message);
  console.error("Tam hata nesnesi:", err);
  if (err && err.serverResponse) console.error("serverResponse:", err.serverResponse);
  if (typeof window.showFbError === "function") {
    window.showFbError(
      "Storage Hatası: " +
      ((err && err.code) || "bilinmiyor") +
      " | " +
      ((err && err.message) || "")
    );
  }
}

async function handlePhotoUpload(file) {
  if (!file || !currentUser) return;
  if (!/^image\//.test(file.type)) { window.showFbError && window.showFbError("Lütfen bir resim dosyası seçin."); return; }
  if (file.size > 2 * 1024 * 1024) { window.showFbError && window.showFbError("Fotoğraf en fazla 2 MB olmalıdır."); return; }

  const btn = $("photo-upload-btn");
  const idle = btn ? btn.textContent : "";
  if (btn) { btn.textContent = "Yükleniyor..."; btn.classList.add("btn-loading"); }

  const path = "users/" + currentUser.uid + "/profile_photo";
  let bucket = "";
  try { bucket = storage.app.options.storageBucket || ""; } catch (e) {}
  console.log("[auth] Fotoğraf yükleme başladı:", {
    dosyaAdi: file.name, tip: file.type, boyut: file.size, yol: path, bucket: bucket, uid: currentUser.uid
  });

  try {
    const storageRef = ref(storage, path);

    console.log("[auth] uploadBytes çağrılıyor...");
    const snap = await uploadBytes(storageRef, file);
    console.log("[auth] uploadBytes tamamlandı:", snap && snap.metadata);

    console.log("[auth] getDownloadURL çağrılıyor...");
    const url = await getDownloadURL(storageRef);
    console.log("[auth] downloadURL alındı:", url);

    await updateProfile(currentUser, { photoURL: url });
    await updateProfileDoc({ photoURL: url });
    console.log("[auth] Profil photoURL güncellendi.");

    refreshAuthUI(auth.currentUser);
    renderProfile();
    toast("Profil fotoğrafınız güncellendi.");
  } catch (err) {
    logStorageError("Fotoğraf yüklenemedi", err);
  } finally {
    if (btn) { btn.textContent = idle || "📤 Fotoğraf Yükle"; btn.classList.remove("btn-loading"); }
  }
}

async function profileRemovePhoto() {
  if (!currentUser) return;
  try {
    try {
      await deleteObject(ref(storage, "users/" + currentUser.uid + "/profile_photo"));
    } catch (e) {
      // Dosya yoksa sorun değil; diğer hataları görünür kıl
      if (e && e.code && e.code !== "storage/object-not-found") {
        console.warn("[auth] Fotoğraf silme uyarısı:", e.code, e.message);
      }
    }
    await updateProfile(currentUser, { photoURL: "" });
    await updateProfileDoc({ photoURL: "" });
    refreshAuthUI(auth.currentUser);
    renderProfile();
    toast("Profil fotoğrafınız kaldırıldı.");
  } catch (err) {
    logStorageError("Fotoğraf kaldırılamadı", err);
  }
}

// ────────────────────────────────────────────────────────────────────
//  HESAP SİLME
// ────────────────────────────────────────────────────────────────────
function profileDeleteAccount() {
  const doDelete = function () {
    runSensitive(async function () {
      const uid = auth.currentUser.uid;
      // 1) Antrenmanları sil
      if (window.OTData && window.OTData.deleteAllTrainings) {
        try { await window.OTData.deleteAllTrainings(); } catch (e) {}
      }
      // 2) Profil fotoğrafını sil
      try { await deleteObject(ref(storage, "users/" + uid + "/profile_photo")); } catch (e) {}
      // 3) Profil dokümanını sil
      try { await deleteDoc(doc(db, "users", uid)); } catch (e) {}
      // 4) Auth hesabını sil
      await deleteUser(auth.currentUser);
      if (typeof window.showSection === "function") window.showSection("home");
    }, "Hesabınız kalıcı olarak silindi.");
  };

  if (typeof window.openConfirm === "function") {
    window.openConfirm("⚠️", "Hesabınız ve tüm antrenman verileriniz kalıcı olarak silinecek. Bu işlem geri alınamaz. Devam edilsin mi?", "Hesabı Sil", doDelete);
  } else if (confirm("Hesabınız ve tüm verileriniz kalıcı olarak silinecek. Devam edilsin mi?")) {
    doDelete();
  }
}

// ────────────────────────────────────────────────────────────────────
//  TARİH BİÇİMLENDİRME
// ────────────────────────────────────────────────────────────────────
function formatDate(value) {
  if (!value) return "—";
  try {
    let d;
    if (value && typeof value.toDate === "function") d = value.toDate(); // Firestore Timestamp
    else d = new Date(value);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  } catch (e) { return "—"; }
}

// ────────────────────────────────────────────────────────────────────
//  PROFİL EKRANINI DOLDUR
// ────────────────────────────────────────────────────────────────────
async function renderProfile() {
  const u = currentUser;
  if (!u) return;
  const name = u.displayName || "İsimsiz Okçu";
  const email = u.email || "—";
  const initial = initialOf(u);

  const set = function (id, val) { const el = $(id); if (el) el.textContent = val; };
  set("profile-name", name);
  set("profile-email-top", email);
  set("profile-fullname", name);
  set("profile-email", email);

  // Düzenleme alanlarını mevcut değerlerle doldur (boşsa)
  const en = $("edit-name");  if (en && !en.value) en.value = u.displayName || "";
  const ee = $("edit-email"); if (ee && !ee.value) ee.value = u.email || "";

  // Avatarlar
  applyAvatar($("profile-avatar"), u.photoURL, initial);
  applyAvatar($("photo-preview"), u.photoURL, initial);

  // Hesap oluşturma tarihi — önce Firestore, yoksa Auth metadata
  let created = u.metadata ? u.metadata.creationTime : null;
  try {
    const snap = await getDoc(doc(db, "users", u.uid));
    if (snap.exists() && snap.data().createdAt) created = snap.data().createdAt;
  } catch (e) { /* metadata kullanılır */ }
  set("profile-created", formatDate(created));
}

// ────────────────────────────────────────────────────────────────────
//  ARAYÜZÜ OTURUM DURUMUNA GÖRE GÜNCELLE
// ────────────────────────────────────────────────────────────────────
function refreshAuthUI(user) {
  const authed = !!user;
  document.querySelectorAll(".member-view, .member-item").forEach(function (el) {
    el.classList.toggle("hidden-auth", !authed);
  });
  document.querySelectorAll(".guest-view, .guest-item").forEach(function (el) {
    el.classList.toggle("hidden-auth", authed);
  });

  if (authed) {
    const fn = firstName(user);
    const initial = initialOf(user);
    const greet = $("home-greet-name"); if (greet) greet.textContent = fn;

    const chipName = $("user-chip-name"); if (chipName) chipName.textContent = fn;
    applyAvatar($("user-chip-avatar"), user.photoURL, initial);

    const sName = $("sidebar-user-name"); if (sName) sName.textContent = user.displayName || fn;
    const sMail = $("sidebar-user-email"); if (sMail) sMail.textContent = user.email || "";
    applyAvatar($("sidebar-user-avatar"), user.photoURL, initial);
  }

  applyVerificationUI(user);
}

// ────────────────────────────────────────────────────────────────────
//  E-POSTA DOĞRULAMA
// ────────────────────────────────────────────────────────────────────
let verifyTimer = null;

function isVerified(user) { return !!(user && user.emailVerified); }

// Arayüzü doğrulama durumuna göre güncelle (body.unverified + e-posta metinleri)
function applyVerificationUI(user) {
  const blocked = !!user && !isVerified(user);
  document.body.classList.toggle("unverified", blocked);
  const email = (user && user.email) || "";
  document.querySelectorAll(".verify-email").forEach(function (el) { el.textContent = email; });
  if (blocked) startVerifyPolling(); else stopVerifyPolling();
}

// Doğrulama e-postasını tekrar gönder
async function resendVerification() {
  const user = auth.currentUser;
  if (!user) { toast("Önce giriş yapın."); return; }
  if (user.emailVerified) { toast("E-posta adresiniz zaten doğrulanmış."); return; }
  try {
    await sendEmailVerification(user);
    toast("Doğrulama e-postası gönderildi. Lütfen gelen kutunuzu kontrol edin.");
  } catch (err) {
    if (err && err.code === "auth/too-many-requests") {
      toast("Çok fazla istek gönderildi. Lütfen birkaç dakika sonra tekrar deneyin.");
    } else if (typeof window.showFbError === "function") {
      window.showFbError(translateError(err));
    } else {
      toast("Doğrulama e-postası gönderilemedi.");
    }
  }
}

// Doğrulama durumunu yeniden kontrol et (kullanıcıyı tazele)
async function checkVerification(opts) {
  const manual = opts && opts.manual;
  const user = auth.currentUser;
  if (!user) return;
  try {
    await user.reload();
    const u = auth.currentUser;
    currentUser = u;
    refreshAuthUI(u);
    if (u && u.emailVerified) {
      if (manual) toast("E-posta adresiniz doğrulandı! Tüm özellikler açıldı.");
      if (typeof window.OTData !== "undefined" && window.OTData.reload) window.OTData.reload();
    } else if (manual) {
      toast("E-posta henüz doğrulanmamış. Bağlantıya tıkladıktan sonra tekrar deneyin.");
    }
  } catch (e) {
    console.warn("[auth] Doğrulama kontrolü başarısız:", e);
  }
}

// Doğrulanana kadar arka planda periyodik kontrol
function startVerifyPolling() {
  if (verifyTimer) return;
  verifyTimer = setInterval(function () {
    if (auth.currentUser && !auth.currentUser.emailVerified) checkVerification();
    else stopVerifyPolling();
  }, 20000);
}
function stopVerifyPolling() {
  if (verifyTimer) { clearInterval(verifyTimer); verifyTimer = null; }
}

// Sekmeye geri dönüldüğünde de kontrol et
document.addEventListener("visibilitychange", function () {
  if (!document.hidden && auth.currentUser && !auth.currentUser.emailVerified) checkVerification();
});

// ────────────────────────────────────────────────────────────────────
//  OTURUM GÖZLEMCİSİ
// ────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, function (user) {
  currentUser = user;
  refreshAuthUI(user);
  if (user) {
    ensureProfileDoc(user);
    renderProfile();
  }
});

// ────────────────────────────────────────────────────────────────────
//  ENTER TUŞU + DOSYA SEÇİMİ
// ────────────────────────────────────────────────────────────────────
function bindEnter(ids, handler) {
  ids.forEach(function (id) {
    const el = $(id);
    if (el) el.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); handler(); }
    });
  });
}
bindEnter(["login-email", "login-password"], authLogin);
bindEnter(["register-name", "register-email", "register-password"], authRegister);
bindEnter(["reauth-password"], submitReauth);

(function () {
  const fileInput = $("photo-file-input");
  if (fileInput) fileInput.addEventListener("change", function (e) {
    const f = e.target.files && e.target.files[0];
    handlePhotoUpload(f);
    e.target.value = ""; // aynı dosya tekrar seçilebilsin
  });
})();

// ────────────────────────────────────────────────────────────────────
//  GLOBAL ERİŞİM — HTML onclick işleyicileri için
// ────────────────────────────────────────────────────────────────────
window.openAuthModal       = openAuthModal;
window.closeAuthModal      = closeAuthModal;
window.closeReauthModal    = closeReauthModal;
window.submitReauth        = submitReauth;
window.authRegister        = authRegister;
window.authLogin           = authLogin;
window.authLogout          = authLogout;
window.renderProfile       = renderProfile;
window.profileUpdateName     = profileUpdateName;
window.profileUpdateEmail    = profileUpdateEmail;
window.profileUpdatePassword = profileUpdatePassword;
window.profileRemovePhoto    = profileRemovePhoto;
window.profileDeleteAccount  = profileDeleteAccount;
window.resendVerification    = resendVerification;
window.checkVerification     = checkVerification;
