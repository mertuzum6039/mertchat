
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
  serverTimestamp,
  where,
  getDocs,
  updateDoc,
  arrayUnion
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

const ADMIN_UID = "qpi0ozUZ8QRSzKyM92OAaTy8Mhc2";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const realtimeDb = getDatabase(app);

// HTML elemanları
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

// Bildirim dinleyicileri
let stopChatNotificationsListener = null;
const notificationMessageListeners = new Map();
const latestNotificationMessageIds = new Map();

let notificationAudioContext = null;
let notificationPermissionRequested = false;

let toastTimer;
let activeChatId = null;
let markingRead = new Set();

// Genel yardımcılar
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3200);
}

function setAuthMessage(message, error = true) {
  authMessage.textContent = message;
  authMessage.style.color = error ? "#b42318" : "#087443";
}

function safeUsername(value) {
  return /^[a-zA-Z0-9_]{3,20}$/.test(value);
}

function usernameEmail(username) {
  return `${username.toLowerCase()}@users.mertchat.invalid`;
}

function avatarLetter(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function formatTime(timestamp) {
  if (!timestamp?.toDate) return "";

  return timestamp.toDate().toLocaleTimeString("tr-TR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

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

function makeChatId(uidA, uidB) {
  return [uidA, uidB].sort().join("_");
}

// Dinleyicileri kapat
function cleanListenerStops() {
  if (stopUsersListener) stopUsersListener();
  if (stopMessagesListener) stopMessagesListener();
  if (stopAdminListener) stopAdminListener();
  if (stopPresenceListener) stopPresenceListener();
  if (stopConnectionListener) stopConnectionListener();
  if (stopChatNotificationsListener) {
    stopChatNotificationsListener();
  }

  stopUsersListener = null;
  stopMessagesListener = null;
  stopAdminListener = null;
  stopPresenceListener = null;
  stopConnectionListener = null;
  stopChatNotificationsListener = null;

  for (const stop of notificationMessageListeners.values()) {
    stop();
  }

  notificationMessageListeners.clear();
  latestNotificationMessageIds.clear();
  markingRead.clear();
}


/* ========== BİLDİRİM SİSTEMİ ========== */

async function enableNotifications() {
  try {
    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      await Notification.requestPermission();
    }

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (AudioContextClass && !notificationAudioContext) {
      notificationAudioContext = new AudioContextClass();
    }

    if (notificationAudioContext?.state === "suspended") {
      await notificationAudioContext.resume();
    }
  } catch (error) {
    console.error("Bildirim hazırlama hatası:", error);
  }
}

// Kullanıcı tıklaması ses sistemini başlatmaya yardımcı olur.
document.addEventListener("click", () => {
  if (currentUser) void enableNotifications();
});

function playNotificationSound() {
  try {
    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext;

    if (!AudioContextClass) return;

    if (!notificationAudioContext) {
      notificationAudioContext = new AudioContextClass();
    }

    if (notificationAudioContext.state !== "running") {
      console.warn("Ses sistemi çalışmıyor; sayfaya tıklayıp tekrar dene.");
      return;
    }

    const audio = notificationAudioContext;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audio.currentTime);

    gain.gain.setValueAtTime(0.0001, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.14,
      audio.currentTime + 0.025
    );
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      audio.currentTime + 0.28
    );

    oscillator.connect(gain);
    gain.connect(audio.destination);

    oscillator.start();
    oscillator.stop(audio.currentTime + 0.3);
  } catch (error) {
    console.error("Bildirim sesi çalınamadı:", error);
  }
}

function showNewMessageNotification(chatId, messageData) {
  if (!currentUser || messageData.senderId === currentUser.uid) return;

  // Sohbet açık olsa bile yeni mesajda ses çalmayı dene.
  playNotificationSound();

  if (!("Notification" in window)) {
    console.warn("Tarayıcı bildirim API'sini desteklemiyor.");
    return;
  }

  if (Notification.permission !== "granted") {
    console.warn("Bildirim izni:", Notification.permission);
    return;
  }

  const sender = allUsers.find(
    person => person.uid === messageData.senderId
  );

  const senderName =
    messageData.senderName || sender?.username || "Yeni mesaj";

  try {
    const notification = new Notification(
      `MertChat • ${senderName}`,
      {
        body: String(
          messageData.text || "Sana yeni bir mesaj gönderildi."
        ).slice(0, 180),
        tag: `mertchat-${chatId}`,
        renotify: true
      }
    );

    notification.onclick = () => {
      window.focus();

      const person = allUsers.find(
        item => item.uid === messageData.senderId
      );

      if (person) void openChat(person);
      notification.close();
    };
  } catch (error) {
    console.error("Tarayıcı bildirimi gösterilemedi:", error);
  }
}

function listenForNewMessageNotifications() {
  if (!currentUser) return;

  if (stopChatNotificationsListener) {
    stopChatNotificationsListener();
    stopChatNotificationsListener = null;
  }

  for (const stop of notificationMessageListeners.values()) {
    stop();
  }

  notificationMessageListeners.clear();
  latestNotificationMessageIds.clear();

  const uidAtStart = currentUser.uid;

  const chatsQuery = query(
    collection(db, "chats"),
    where("participants", "array-contains", uidAtStart)
  );

  stopChatNotificationsListener = onSnapshot(
    chatsQuery,
    snapshot => {
      if (!currentUser || currentUser.uid !== uidAtStart) return;

      const existingChatIds = new Set(
        snapshot.docs.map(chatDoc => chatDoc.id)
      );

      for (const [chatId, stop] of notificationMessageListeners) {
        if (!existingChatIds.has(chatId)) {
          stop();
          notificationMessageListeners.delete(chatId);
          latestNotificationMessageIds.delete(chatId);
        }
      }

      for (const chatDoc of snapshot.docs) {
        const chatId = chatDoc.id;

        if (notificationMessageListeners.has(chatId)) continue;

        const latestMessageQuery = query(
          collection(db, "chats", chatId, "messages"),
          orderBy("createdAt", "desc"),
          limit(1)
        );

        let initialSnapshot = true;

        const stop = onSnapshot(
          latestMessageQuery,
          messageSnapshot => {
            if (!currentUser || currentUser.uid !== uidAtStart) return;
            if (messageSnapshot.empty) return;

            const messageDoc = messageSnapshot.docs[0];
            const messageData = messageDoc.data();

            // İlk açılışta eski mesajları yeni bildirim gibi gösterme.
            if (initialSnapshot) {
              initialSnapshot = false;
              latestNotificationMessageIds.set(chatId, messageDoc.id);
              return;
            }

            const previousId =
              latestNotificationMessageIds.get(chatId);

            if (previousId === messageDoc.id) return;

            latestNotificationMessageIds.set(chatId, messageDoc.id);
            showNewMessageNotification(chatId, messageData);
          },
          error => {
            console.error(
              "Mesaj bildirimi dinlenemedi:",
              chatId,
              error
            );
          }
        );

        notificationMessageListeners.set(chatId, stop);
      }
    },
    error => {
      console.error("Sohbet bildirimleri dinlenemedi:", error);
    }
  );
}


// Giriş / kayıt ekranı
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

    setAuthMessage(
      messages[error.code] || error.message || "İşlem başarısız."
    );
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent =
      authMode === "login" ? "Giriş yap" : "Hesap oluştur";
  }
});

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

  // Yeni mesaj bildirimlerini dinlemeye başla.
  listenForNewMessageNotifications();

  setDoc(
    doc(db, "users", user.uid),
    { lastSeen: serverTimestamp() },
    { merge: true }
  ).catch(console.error);
}

// Kullanıcı listesi
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

// Çevrim içi durumları
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

function startPresence() {
  const uid = currentUser.uid;
  const connectionRef = ref(realtimeDb, ".info/connected");
  const myPresenceRef = ref(realtimeDb, `presence/${uid}`);

  stopConnectionListener = onValue(connectionRef, async (snapshot) => {
    if (
      snapshot.val() !== true ||
      !currentUser ||
      currentUser.uid !== uid
    ) {
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
      showToast(
        "Çevrim içi durumu ayarlanamadı. Firebase kurallarını kontrol et."
      );
    }
  });
}

// Kullanıcı listesini ekrana çiz
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

function updateChatStatus() {
  if (!selectedUser) return;

  const chatStatus = document.querySelector("#chatStatus");

  if (chatStatus) {
    chatStatus.textContent = formatPresence(selectedUser);
  }
}

// Gelen mesajları okundu olarak işaretle
async function markIncomingMessagesRead(chatId, messageDocs) {
  if (
    !currentUser ||
    activeChatId !== chatId ||
    document.visibilityState !== "visible"
  ) {
    return;
  }

  for (const messageDoc of messageDocs) {
    const data = messageDoc.data();

    if (
      data.senderId === currentUser.uid ||
      (Array.isArray(data.readBy) &&
        data.readBy.includes(currentUser.uid)) ||
      markingRead.has(messageDoc.id)
    ) {
      continue;
    }

    markingRead.add(messageDoc.id);

    try {
      await updateDoc(
        doc(db, "chats", chatId, "messages", messageDoc.id),
        { readBy: arrayUnion(currentUser.uid) }
      );
    } catch (error) {
      console.error("Okundu bilgisi güncellenemedi:", error);
    } finally {
      markingRead.delete(messageDoc.id);
    }
  }
}

// Sohbeti aç
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
  activeChatId = chatId;

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

          const meta = document.createElement("div");
          meta.className = "message-meta";

          const time = document.createElement("time");
          time.textContent = formatTime(data.createdAt);
          meta.append(time);

          if (data.senderId === currentUser.uid) {
            const receipt = document.createElement("span");
            receipt.className = "message-receipt";

            const isRead =
              Array.isArray(data.readBy) &&
              data.readBy.includes(person.uid);

            receipt.textContent = "✓✓";
            receipt.setAttribute(
              "aria-label",
              isRead ? "Okundu" : "Gönderildi, henüz okunmadı"
            );
            receipt.title = isRead
              ? "Okundu"
              : "Gönderildi, henüz okunmadı";

            if (isRead) {
              receipt.classList.add("read");
            }

            meta.append(receipt);
          }

          bubble.append(body, meta);
          messagesBox.append(bubble);
        }

        messagesBox.scrollTop = messagesBox.scrollHeight;

        void markIncomingMessagesRead(chatId, snapshot.docs);
      },
      (error) => showToast("Mesajlar yüklenemedi: " + error.message)
    );
  } catch (error) {
    showToast("Sohbet açılamadı. Firebase kurallarını kontrol et.");
    console.error(error);
  }
}

// Mesaj gönder
messageForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const text = messageInput.value.trim();

  if (!text || !selectedUser || !currentUser) return;

  void enableNotifications();

  const sendButton = messageForm.querySelector("button");
  sendButton.disabled = true;

  const chatId = makeChatId(currentUser.uid, selectedUser.uid);

  try {
    await addDoc(collection(db, "chats", chatId, "messages"), {
      text,
      senderId: currentUser.uid,
      senderName: currentProfile.username,
      createdAt: serverTimestamp(),
      readBy: []
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

// Sekme tekrar görünür olduğunda okunmamış mesajları işaretle
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState !== "visible" ||
    !activeChatId ||
    !selectedUser ||
    !currentUser
  ) {
    return;
  }

  const chatId = activeChatId;

  getDocs(query(
    collection(db, "chats", chatId, "messages"),
    orderBy("createdAt"),
    limit(300)
  ))
    .then((snapshot) => {
      if (activeChatId === chatId) {
        void markIncomingMessagesRead(chatId, snapshot.docs);
      }
    })
    .catch((error) => {
      console.error("Okundu bilgisi yenilenemedi:", error);
    });
});

// Çıkış yap
document.querySelector("#logoutButton").addEventListener("click", async () => {
  cleanListenerStops();

  selectedUser = null;
  activeChatId = null;
  presenceData = {};

  await signOut(auth);
});

// Sohbet ekranına geri dön
document.querySelector("#backButton").addEventListener("click", () => {
  document.querySelector("#appScreen").classList.remove("chat-open");
  activeChatId = null;
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

// Oturum durumunu kontrol et
onAuthStateChanged(auth, async (user) => {
  cleanListenerStops();

  if (!user) {
    currentUser = null;
    currentProfile = null;
    selectedUser = null;
    allUsers = [];
    presenceData = {};
    activeChatId = null;

    appScreen.classList.add("hidden");
    authScreen.classList.remove("hidden");
    appScreen.classList.remove("chat-open");

    return;
  }

  try {
    const profileSnap = await getDoc(doc(db, "users", user.uid));

    if (!profileSnap.exists()) {
      await signOut(auth);
      setAuthMessage(
        "Kullanıcı profili bulunamadı. Tekrar kayıt olmayı dene."
      );
      return;
    }

    enterApp(user, profileSnap.data());
  } catch (error) {
    console.error(error);
    showToast("Profil alınamadı. Firestore kurallarını kontrol et.");
  }
});

// Son görülme zamanını güncelle
setInterval(() => {
  if (currentUser && document.visibilityState === "visible") {
    setDoc(
      doc(db, "users", currentUser.uid),
      { lastSeen: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  }
}, 60000);
