
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js";

import {
  getDatabase,
  ref,
  set,
  onValue,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-database.js";

// Firebase ayarları
const firebaseConfig = {
  apiKey: "AIzaSyBLT1Qu-oTpacg3pwI2k-MOfVbazAi9Z3Y",
  authDomain: "mertchat-53652.firebaseapp.com",
  databaseURL: "https://mertchat-53652-default-rtdb.firebaseio.com",
  projectId: "mertchat-53652",
  storageBucket: "mertchat-53652.firebasestorage.app",
  messagingSenderId: "1004601117974",
  appId: "1:1004601117974:web:5d0963739b7671f82f9437",
  measurementId: "G-HX67K1WJZ6"
};

// Yönetici UID'si
const ADMIN_UID = "qpi0ozUZ8QRSzKyM92OAaTy8Mhc2";

// Firebase bağlantıları
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const realtimeDb = getDatabase(app);

// Sayfa elemanları
const authScreen = document.querySelector("#authScreen");
const appScreen = document.querySelector("#appScreen");
const authForm = document.querySelector("#authForm");
const usernameInput = document.querySelector("#username");
const passwordInput = document.querySelector("#password");
const authSubmit = document.querySelector("#authSubmit");
const authMessage = document.querySelector("#authMessage");
const showLogin = document.querySelector("#showLogin");
const showRegister = document.querySelector("#showRegister");
const usersList = document.querySelector("#usersList");
const userSearch = document.querySelector("#userSearch");
const messagesBox = document.querySelector("#messages");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");
const toast = document.querySelector("#toast");

let authMode = "login";
let currentUser = null;
let currentProfile = null;
let selectedUser = null;
let allUsers = [];
let presenceData = {};

let stopUsersListener = null;
let stopMessagesListener = null;
let stopAdminListener = null;
let stopPresenceListener = null;
let stopConnectionListener = null;

let toastTimer;

// Bildirim
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

// Giriş ekranındaki mesaj
function setAuthMessage(message, error = true) {
  authMessage.textContent = message;
  authMessage.style.color = error ? "#b42318" : "#087443";
}

// Kullanıcı adı kontrolü
function safeUsername(value) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

// Kullanıcı adını Firebase e-posta biçimine dönüştürür
function usernameEmail(username) {
  return `${username.toLowerCase()}@users.mertchat.invalid`;
}

// Avatar harfi
function avatarLetter(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

// Mesaj saati
function formatTime(timestamp) {
  if (!timestamp?.toDate) return "";

  return timestamp.toDate().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

// Son görülme zamanı
function formatLastSeen(timestamp) {
  if (!timestamp?.toDate) return "Son görülme bilgisi yok";

  return "Son görülme: " +
    timestamp.toDate().toLocaleString("tr-TR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
}

// Kullanıcı durumunu gösterir
function formatPresence(person) {
  const status = presenceData[person.uid];

  if (status?.state === "online") {
    return "● Çevrim içi";
  }

  if (status?.lastChanged) {
    const date = new Date(status.lastChanged);

    if (!Number.isNaN(date.getTime())) {
      return "Son görülme: " +
        date.toLocaleString("tr-TR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
    }
  }

  return formatLastSeen(person.lastSeen);
}

// Sohbet kimliği
function makeChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// Açık dinleyicileri kapatır
function cleanListenerStops() {
  if (stopUsersListener) stopUsersListener();
  if (stopMessagesListener) stopMessagesListener();
  if (stopAdminListener) stopAdminListener();
  if (stopPresenceListener) stopPresenceListener();
  if (stopConnectionListener) stopConnectionListener();

  stopUsersListener = null;
  stopMessagesListener = null;
  stopAdminListener = null;
  stopPresenceListener = null;
  stopConnectionListener = null;
}

// Giriş ve kayıt sekmeleri
showLogin.addEventListener("click", () => setAuthMode("login"));
showRegister.addEventListener("click", () => setAuthMode("register"));

function setAuthMode(mode) {
  authMode = mode;

  showLogin.classList.toggle("active", mode === "login");
  showRegister.classList.toggle("active", mode === "register");

  authSubmit.textContent =
    mode === "login" ? "Giriş yap" : "Hesap oluştur";

  passwordInput.autocomplete =
    mode === "login" ? "current-password" : "new-password";

  setAuthMessage("");
}

// Kayıt ve giriş işlemleri
authForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!safeUsername(username)) {
    setAuthMessage(
      "Kullanıcı adı 3-20 karakter olmalı; İngilizce harf, rakam ve _ kullan."
    );
    return;
  }

  if (password.length < 6) {
    setAuthMessage("Şifre en az 6 karakter olmalı.");
    return;
  }

  authSubmit.disabled = true;
  authSubmit.textContent = "Lütfen bekle...";
  setAuthMessage("");

  try {
    if (authMode === "register") {
      await registerUser(username, password);
    } else {
      await signInWithEmailAndPassword(
        auth,
        usernameEmail(username),
        password
      );
    }
  } catch (error) {
    const messages = {
      "auth/email-already-in-use": "Bu kullanıcı adı alınmış.",
      "auth/invalid-credential": "Kullanıcı adı veya şifre yanlış.",
      "auth/invalid-email": "Kullanıcı adı biçimi geçersiz.",
      "auth/weak-password": "Daha güçlü bir şifre seç.",
      "auth/too-many-requests": "Çok fazla deneme yapıldı. Sonra tekrar dene.",
      "permission-denied": "Firebase güvenlik kurallarını kontrol et."
    };

    setAuthMessage(messages[error.code] || error.message || "İşlem başarısız.");
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent =
      authMode === "login" ? "Giriş yap" : "Hesap oluştur";
  }
});

// Yeni kullanıcı oluşturur
async function registerUser(username, password) {
  const credential = await createUserWithEmailAndPassword(
    auth,
    usernameEmail(username),
    password
  );

  await updateProfile(credential.user, {
    displayName: username
  });

  await setDoc(doc(db, "users", credential.user.uid), {
    username,
    usernameLower: username.toLowerCase(),
    createdAt: serverTimestamp(),
    lastSeen: serverTimestamp()
  });
}

// Uygulamaya giriş
function enterApp(user, profile) {
  currentUser = user;
  currentProfile = profile;

  authScreen.classList.add("hidden");
  appScreen.classList.remove("hidden");

  document.querySelector("#myUsername").textContent = profile.username;
  document.querySelector("#myAvatar").textContent =
    avatarLetter(profile.username);

  document.querySelector("#adminButton").classList.toggle(
    "hidden",
    user.uid !== ADMIN_UID
  );

  listenForUsers();
  listenForPresence();
  startPresence();

  setDoc(
    doc(db, "users", user.uid),
    { lastSeen: serverTimestamp() },
    { merge: true }
  ).catch(console.error);
}

// Kullanıcıları canlı olarak dinler
function listenForUsers() {
  if (stopUsersListener) stopUsersListener();

  stopUsersListener = onSnapshot(
    query(collection(db, "users"), orderBy("usernameLower")),
    (snapshot) => {
      allUsers = snapshot.docs
        .map((item) => ({ uid: item.id, ...item.data() }))
        .filter((person) => person.uid !== currentUser.uid);

      renderUsers();

      if (selectedUser) {
        const latest = allUsers.find(
          (person) => person.uid === selectedUser.uid
        );

        if (latest) {
          selectedUser = latest;
          updateChatStatus();
        }
      }
    },
    (error) => showToast("Kullanıcı listesi alınamadı: " + error.message)
  );
}

// Çevrim içi durumlarını canlı dinler
function listenForPresence() {
  if (stopPresenceListener) stopPresenceListener();

  stopPresenceListener = onValue(
    ref(realtimeDb, "presence"),
    (snapshot) => {
      presenceData = snapshot.val() || {};
      renderUsers();
      updateChatStatus();
    },
    (error) => {
      console.error("Çevrim içi durumları alınamadı:", error);
    }
  );
}

// Kullanıcının çevrim içi durumunu ayarlar
function startPresence() {
  const uid = currentUser.uid;
  const connectionRef = ref(realtimeDb, ".info/connected");
  const myPresenceRef = ref(realtimeDb, `presence/${uid}`);

  stopConnectionListener = onValue(connectionRef, async (snapshot) => {
    if (snapshot.val() !== true || !currentUser || currentUser.uid !== uid) {
      return;
    }

    try {
      await onDisconnect(myPresenceRef).set({
        state: "offline",
        lastChanged: { ".sv": "timestamp" }
      });

      await set(myPresenceRef, {
        state: "online",
        lastChanged: { ".sv": "timestamp" }
      });
    } catch (error) {
      console.error("Durum güncellenemedi:", error);
      showToast("Çevrim içi durumu ayarlanamadı. Firebase kurallarını kontrol et.");
    }
  });
}

// Kullanıcı listesini oluşturur
function renderUsers() {
  if (!currentUser) return;

  const search = userSearch.value.trim().toLocaleLowerCase("tr");

  const filtered = allUsers.filter((person) =>
    (person.username || "").toLocaleLowerCase("tr").includes(search)
  );

  document.querySelector("#userCount").textContent = allUsers.length;
  usersList.replaceChildren();

  if (!filtered.length) {
    const p = document.createElement("p");
    p.className = "empty-list";
    p.textContent = search
      ? "Bu isimde kullanıcı bulunamadı."
      : "Henüz başka kullanıcı yok. Arkadaşlarını davet edebilirsin.";

    usersList.append(p);
    return;
  }

  for (const person of filtered) {
    const button = document.createElement("button");
    button.type = "button";

    button.className =
      "user-item" +
      (selectedUser?.uid === person.uid ? " selected" : "");

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = avatarLetter(person.username);

    const details = document.createElement("span");
    details.className = "user-details";

    const name = document.createElement("strong");
    name.textContent = person.username || "Kullanıcı";

    const status = document.createElement("span");
    status.textContent = formatPresence(person);

    details.append(name, status);
    button.append(avatar, details);

    button.addEventListener("click", () => openChat(person));

    usersList.append(button);
  }
}

userSearch.addEventListener("input", renderUsers);

// Sohbet başlığındaki durumu günceller
function updateChatStatus() {
  if (!selectedUser) return;

  const chatStatus = document.querySelector("#chatStatus");

  if (chatStatus) {
    chatStatus.textContent = formatPresence(selectedUser);
  }
}

// Sohbeti açar
async function openChat(person) {
  selectedUser = person;

  document.querySelector("#appScreen").classList.add("chat-open");
  document.querySelector("#welcomePanel").classList.add("hidden");
  document.querySelector("#adminPanel").classList.add("hidden");
  document.querySelector("#conversation").classList.remove("hidden");

  document.querySelector("#chatUsername").textContent = person.username;
  document.querySelector("#chatAvatar").textContent =
    avatarLetter(person.username);

  updateChatStatus();
  renderUsers();

  if (stopMessagesListener) stopMessagesListener();
  stopMessagesListener = null;

  const chatId = makeChatId(currentUser.uid, person.uid);
  const chatRef = doc(db, "chats", chatId);

  try {
    const chatSnapshot = await getDoc(chatRef);

    if (!chatSnapshot.exists()) {
      await setDoc(chatRef, {
        participants: [currentUser.uid, person.uid].sort(),
        createdAt: serverTimestamp(),
        lastMessage: "",
        updatedAt: serverTimestamp()
      });
    }

    // Kullanıcı sohbet değiştirdiyse eski sohbeti dinleme
    if (selectedUser?.uid !== person.uid) return;

    const messageQuery = query(
      collection(db, "chats", chatId, "messages"),
      orderBy("createdAt"),
      limit(300)
    );

    stopMessagesListener = onSnapshot(
      messageQuery,
      (snapshot) => {
        if (selectedUser?.uid !== person.uid) return;

        messagesBox.replaceChildren();

        if (snapshot.empty) {
          const p = document.createElement("p");
          p.className = "message-placeholder";
          p.textContent = "Henüz mesaj yok. İlk mesajı sen gönder!";
          messagesBox.append(p);
          return;
        }

        for (const messageDoc of snapshot.docs) {
          const data = messageDoc.data();

          const bubble = document.createElement("article");
          bubble.className =
            "message" +
            (data.senderId === currentUser.uid ? " mine" : "");

          if (data.senderId !== currentUser.uid) {
            const author = document.createElement("div");
            author.className = "message-author";
            author.textContent = data.senderName || person.username;
            bubble.append(author);
          }

          const body = document.createElement("div");
          body.className = "message-text";
          body.textContent = data.text || "";

          const time = document.createElement("time");
          time.textContent = formatTime(data.createdAt);

          bubble.append(body, time);
          messagesBox.append(bubble);
        }

        messagesBox.scrollTop = messagesBox.scrollHeight;
      },
      (error) => showToast("Mesajlar yüklenemedi: " + error.message)
    );
  } catch (error) {
    showToast("Sohbet açılamadı. Firebase kurallarını kontrol et.");
    console.error(error);
  }
}

// Mesaj gönderme
messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text || !selectedUser || !currentUser) return;

  const sendButton = messageForm.querySelector("button");
  sendButton.disabled = true;

  const chatId = makeChatId(currentUser.uid, selectedUser.uid);

  try {
    await addDoc(collection(db, "chats", chatId, "messages"), {
      text,
      senderId: currentUser.uid,
      senderName: currentProfile.username,
      createdAt: serverTimestamp()
    });

    await setDoc(
      doc(db, "chats", chatId),
      {
        lastMessage: text.slice(0, 100),
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );

    messageInput.value = "";
    messageInput.focus();
  } catch (error) {
    showToast("Mesaj gönderilemedi. Firebase kurallarını kontrol et.");
    console.error(error);
  } finally {
    sendButton.disabled = false;
  }
});

// Çıkış
document.querySelector("#logoutButton").addEventListener("click", async () => {
  cleanListenerStops();

  selectedUser = null;
  presenceData = {};

  await signOut(auth);
});

// Sohbetten geri dön
document.querySelector("#backButton").addEventListener("click", () => {
  document.querySelector("#appScreen").classList.remove("chat-open");
});

// Yönetici paneli
document.querySelector("#adminButton").addEventListener("click", openAdminPanel);

document.querySelector("#closeAdmin").addEventListener("click", () => {
  document.querySelector("#adminPanel").classList.add("hidden");

  if (selectedUser) {
    document.querySelector("#conversation").classList.remove("hidden");
  } else {
    document.querySelector("#welcomePanel").classList.remove("hidden");
  }
});

function openAdminPanel() {
  if (!currentUser || currentUser.uid !== ADMIN_UID) {
    showToast("Yönetici yetkisi bulunamadı.");
    return;
  }

  document.querySelector("#conversation").classList.add("hidden");
  document.querySelector("#welcomePanel").classList.add("hidden");

  const panel = document.querySelector("#adminPanel");
  panel.classList.remove("hidden");

  if (stopAdminListener) stopAdminListener();

  stopAdminListener = onSnapshot(
    query(collection(db, "users"), orderBy("usernameLower")),
    (snapshot) => {
      const container = document.querySelector("#adminUsers");
      container.replaceChildren();

      const heading = document.createElement("p");
      heading.textContent = `Toplam kayıtlı kullanıcı: ${snapshot.size}`;
      container.append(heading);

      for (const row of snapshot.docs) {
        const user = row.data();

        const item = document.createElement("div");
        item.className = "admin-user-row";

        const avatar = document.createElement("span");
        avatar.className = "avatar";
        avatar.textContent = avatarLetter(user.username);

        const details = document.createElement("div");
        details.className = "user-details";

        const name = document.createElement("strong");
        name.textContent = user.username || "Kullanıcı";

        const lastSeen = document.createElement("small");

        lastSeen.textContent =
          row.id === currentUser.uid
            ? "Bu hesap"
            : formatPresence({ uid: row.id, ...user });

        details.append(name, lastSeen);
        item.append(avatar, details);
        container.append(item);
      }
    },
    (error) => {
      document.querySelector("#adminUsers").textContent =
        "Yetki hatası: " + error.message;
    }
  );
}

// Oturum kontrolü
onAuthStateChanged(auth, async (user) => {
  cleanListenerStops();

  if (!user) {
    currentUser = null;
    currentProfile = null;
    selectedUser = null;
    allUsers = [];
    presenceData = {};

    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
    appScreen.classList.remove("chat-open");

    return;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));

    if (!profileSnap.exists()) {
      await signOut(auth);
      setAuthMessage("Kullanıcı profili bulunamadı. Tekrar kayıt olmayı dene.");
      return;
    }

    enterApp(user, profileSnap.data());
  } catch (error) {
    console.error(error);
    showToast("Profil alınamadı. Firestore kurallarını kontrol et.");
  }
});

// Son görülme bilgisini düzenli güncelle
setInterval(() => {
  if (currentUser && document.visibilityState === "visible") {
    setDoc(
      doc(db, "users", currentUser.uid),
      { lastSeen: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  }
}, 60000);
