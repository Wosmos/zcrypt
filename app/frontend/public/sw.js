self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Web Push (lib/push.ts, cmd/push.go): the server sends only an event type,
// encrypted to this browser; the wording lives here, per language.
const PUSH_TEXT = {
  en: {
    newSignIn: ["New sign-in to your zcrypt account", "{device} just signed in. Not you? Review your devices."],
    inviteReceived: ["You were added to a Space", "Open zcrypt to see what was shared with you."],
    linkViewed: ["Someone opened your share link", "One of your share links was just opened."],
  },
  ar: {
    newSignIn: ["تسجيل دخول جديد إلى حسابك في zcrypt", "سجّل {device} الدخول للتو. لست أنت؟ راجع أجهزتك."],
    inviteReceived: ["تمت إضافتك إلى مساحة", "افتح zcrypt لترى ما تمت مشاركته معك."],
    linkViewed: ["فتح شخص ما رابط المشاركة الخاص بك", "تم فتح أحد روابط المشاركة الخاصة بك للتو."],
  },
  de: {
    newSignIn: ["Neue Anmeldung bei deinem zcrypt-Konto", "{device} hat sich gerade angemeldet. Nicht du? Prüfe deine Geräte."],
    inviteReceived: ["Du wurdest zu einem Space hinzugefügt", "Öffne zcrypt, um zu sehen, was mit dir geteilt wurde."],
    linkViewed: ["Jemand hat deinen Freigabelink geöffnet", "Einer deiner Freigabelinks wurde gerade geöffnet."],
  },
  es: {
    newSignIn: ["Nuevo inicio de sesión en tu cuenta de zcrypt", "{device} acaba de iniciar sesión. ¿No eras tú? Revisa tus dispositivos."],
    inviteReceived: ["Te añadieron a un Space", "Abre zcrypt para ver lo que compartieron contigo."],
    linkViewed: ["Alguien abrió tu enlace compartido", "Uno de tus enlaces compartidos se acaba de abrir."],
  },
  fr: {
    newSignIn: ["Nouvelle connexion à votre compte zcrypt", "{device} vient de se connecter. Ce n'est pas vous ? Vérifiez vos appareils."],
    inviteReceived: ["Vous avez été ajouté à un Space", "Ouvrez zcrypt pour voir ce qui a été partagé avec vous."],
    linkViewed: ["Quelqu'un a ouvert votre lien de partage", "L'un de vos liens de partage vient d'être ouvert."],
  },
  ru: {
    newSignIn: ["Новый вход в ваш аккаунт zcrypt", "Только что выполнен вход: {device}. Это не вы? Проверьте устройства."],
    inviteReceived: ["Вас добавили в пространство", "Откройте zcrypt, чтобы увидеть, чем с вами поделились."],
    linkViewed: ["Кто-то открыл вашу ссылку", "Одну из ваших ссылок только что открыли."],
  },
  ur: {
    newSignIn: ["آپ کے zcrypt اکاؤنٹ میں نیا سائن ان", "{device} نے ابھی سائن ان کیا۔ آپ نہیں تھے؟ اپنے آلات دیکھیں۔"],
    inviteReceived: ["آپ کو ایک اسپیس میں شامل کیا گیا", "دیکھنے کے لیے zcrypt کھولیں کہ آپ کے ساتھ کیا شیئر ہوا۔"],
    linkViewed: ["کسی نے آپ کا شیئر لنک کھولا", "آپ کا ایک شیئر لنک ابھی کھولا گیا۔"],
  },
  zh: {
    newSignIn: ["你的 zcrypt 账户有新的登录", "{device} 刚刚登录。不是你本人？请检查你的设备。"],
    inviteReceived: ["你被添加到了一个空间", "打开 zcrypt 查看与你共享的内容。"],
    linkViewed: ["有人打开了你的分享链接", "你的一个分享链接刚刚被打开。"],
  },
};

function pushText(msg) {
  const lang = PUSH_TEXT[msg.lang] ? msg.lang : "en";
  const pair = PUSH_TEXT[lang][msg.type] || PUSH_TEXT.en[msg.type];
  if (!pair) return null;
  const fill = (s) => s.replace("{device}", (msg.data && msg.data.device) || "");
  return { title: fill(pair[0]), body: fill(pair[1]) };
}

self.addEventListener("push", (event) => {
  let msg = null;
  try {
    msg = event.data ? event.data.json() : null;
  } catch {
    msg = null;
  }
  const text = msg && pushText(msg);
  if (!text) return;
  const url = typeof msg.url === "string" && /^\/(?![\/\\])/.test(msg.url) ? msg.url : "/dashboard";
  event.waitUntil(
    self.registration.showNotification(text.title, {
      body: text.body,
      tag: "zcrypt-push-" + msg.type,
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      data: { url, click: "go" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const data = notification.data || {};
  const action = event.action || data.click || "open";
  notification.close();

  const url = action === "view" && typeof data.url === "string" ? data.url : "/dashboard";

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = windows.find((c) => new URL(c.url).origin === self.location.origin);
      if (action === "go") {
        const target = typeof data.url === "string" ? data.url : "/dashboard";
        if (client && "navigate" in client) {
          const moved = await client.navigate(target).catch(() => null);
          await (moved || client).focus();
          return;
        }
        await self.clients.openWindow(target);
        return;
      }
      if (client) {
        await client.focus();
        client.postMessage({
          type: "zcrypt:notification",
          action,
          folderId: typeof data.folderId === "string" ? data.folderId : null,
        });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
