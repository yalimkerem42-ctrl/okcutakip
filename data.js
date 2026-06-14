// ════════════════════════════════════════════════════════════════════
//  data.js  —  Antrenman verisi katmanı (Firestore)
//  OKÇUTAKİP — Geleneksel Türk Okçuluğu Performans Takip Sistemi
// --------------------------------------------------------------------
//  Koleksiyon yapısı:
//    users/{uid}                       → profil (auth.js yönetir)
//    users/{uid}/trainings/{id}        → antrenman kayıtları
//
//  Çalışma mantığı:
//   • Kullanıcı giriş yapınca antrenmanlar Firestore'dan çekilir ve
//     window.storedTrainings önbelleğine yazılır; ekranlar tazelenir.
//   • Yeni kayıt/silme/içe aktarma işlemleri Firestore'a yansıtılır.
//   • localStorage KULLANILMAZ.
// ════════════════════════════════════════════════════════════════════

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-auth.js";
import {
  collection, doc, setDoc, deleteDoc, getDocs, query, orderBy, writeBatch
} from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

let currentUid = null;
let guestHintShown = false;

// ── Yardımcılar ──
function trainingsCol(uid) {
  return collection(db, "users", uid, "trainings");
}
function rerender() {
  if (typeof window.renderHistory === "function")    window.renderHistory();
  if (typeof window.renderStats === "function")      window.renderStats();
  if (typeof window.renderHomeRecent === "function") window.renderHomeRecent();
}
function toast(msg) {
  if (typeof window.showToast === "function") window.showToast(msg);
}

// ── Detaylı Firebase hata bildirimi (console + ekran) ──
function logFbError(label, err) {
  console.error("[data] " + label);
  console.error("Kod:", err && err.code);
  console.error("Mesaj:", err && err.message);
  console.error("Tam hata:", err);
  if (typeof window.showFbError === "function") {
    window.showFbError(
      "Firestore Hatası: " +
      ((err && err.code) || "bilinmiyor") +
      " | " +
      ((err && err.message) || "")
    );
  }
}

// ── Firestore'dan kullanıcının antrenmanlarını yükle ──
async function loadTrainings(uid) {
  if (!uid) {
    window.storedTrainings = [];
    rerender();
    return;
  }
  try {
    const snap = await getDocs(query(trainingsCol(uid), orderBy("datetime", "desc")));
    const arr = [];
    snap.forEach(function (d) { arr.push(d.data()); });
    window.storedTrainings = arr;
    rerender();
  } catch (err) {
    logFbError("Antrenmanlar yüklenemedi", err);
  }
}

// ── Tek antrenman kaydet ──
async function saveTraining(record) {
  if (!currentUid) {
    if (!guestHintShown) {
      toast("Verilerinizi kalıcı olarak saklamak için giriş yapın.");
      guestHintShown = true;
    }
    return; // misafir: yalnızca bu oturumda önbellekte kalır
  }
  try {
    await setDoc(doc(trainingsCol(currentUid), String(record.id)), record);
  } catch (err) {
    logFbError("Kayıt başarısız", err);
  }
}

// ── Tek antrenman sil ──
async function deleteTraining(id) {
  if (!currentUid) return;
  try {
    await deleteDoc(doc(trainingsCol(currentUid), String(id)));
  } catch (err) {
    logFbError("Silme başarısız", err);
  }
}

// ── Tüm antrenmanları sil ──
async function deleteAllTrainings() {
  if (!currentUid) return;
  try {
    const snap = await getDocs(trainingsCol(currentUid));
    const batch = writeBatch(db);
    snap.forEach(function (d) { batch.delete(d.ref); });
    await batch.commit();
  } catch (err) {
    logFbError("Toplu silme başarısız", err);
  }
}

// ── İçe aktarılan antrenmanları Firestore'a yaz ──
async function importTrainings(list) {
  if (!currentUid || !Array.isArray(list)) return;
  try {
    const batch = writeBatch(db);
    list.forEach(function (rec) {
      batch.set(doc(trainingsCol(currentUid), String(rec.id)), rec);
    });
    await batch.commit();
  } catch (err) {
    logFbError("İçe aktarma başarısız", err);
  }
}

// ── Oturum gözlemcisi: kullanıcı değişince verileri yükle/temizle ──
onAuthStateChanged(auth, function (user) {
  currentUid = user ? user.uid : null;
  guestHintShown = false;
  loadTrainings(currentUid);
});

// ── Klasik (inline) koda köprü ──
window.OTData = {
  saveTraining: saveTraining,
  deleteTraining: deleteTraining,
  deleteAllTrainings: deleteAllTrainings,
  importTrainings: importTrainings,
  reload: function () { return loadTrainings(currentUid); }
};
