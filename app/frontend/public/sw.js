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
    inviteReceivedBy: ["{name} added you to a Space", ""],
    linkViewed: ["Someone opened your share link", "One of your share links was just opened."],
    invitePending: ["{name} invited you to a Space", "Unlock your vault to join."],
    memberJoined: ["{name} joined one of your Spaces", ""],
    memberLeft: ["{name} left one of your Spaces", ""],
    memberRemoved: ["You were removed from a Space", ""],
    roleChanged: ["Your role in a Space changed", ""],
    spaceDeleted: ["A Space you were in was deleted", ""],
    filesAdded: ["{name} added files to a Space", ""],
  },
  ar: {
    newSignIn: ["تسجيل دخول جديد إلى حسابك في zcrypt", "سجّل {device} الدخول للتو. لست أنت؟ راجع أجهزتك."],
    inviteReceived: ["تمت إضافتك إلى مساحة", "افتح zcrypt لترى ما تمت مشاركته معك."],
    inviteReceivedBy: ["أضافك {name} إلى مساحة", ""],
    linkViewed: ["فتح شخص ما رابط المشاركة الخاص بك", "تم فتح أحد روابط المشاركة الخاصة بك للتو."],
    invitePending: ["دعاك {name} إلى مساحة", "افتح خزنتك للانضمام."],
    memberJoined: ["انضم {name} إلى إحدى مساحاتك", ""],
    memberLeft: ["غادر {name} إحدى مساحاتك", ""],
    memberRemoved: ["تمت إزالتك من مساحة", ""],
    roleChanged: ["تغيّر دورك في مساحة", ""],
    spaceDeleted: ["تم حذف مساحة كنت فيها", ""],
    filesAdded: ["أضاف {name} ملفات إلى مساحة", ""],
  },
  de: {
    newSignIn: ["Neue Anmeldung bei deinem zcrypt-Konto", "{device} hat sich gerade angemeldet. Nicht du? Prüfe deine Geräte."],
    inviteReceived: ["Du wurdest zu einem Space hinzugefügt", "Öffne zcrypt, um zu sehen, was mit dir geteilt wurde."],
    inviteReceivedBy: ["{name} hat dich zu einem Space hinzugefügt", ""],
    linkViewed: ["Jemand hat deinen Freigabelink geöffnet", "Einer deiner Freigabelinks wurde gerade geöffnet."],
    invitePending: ["{name} hat dich zu einem Space eingeladen", "Entsperre deinen Tresor, um beizutreten."],
    memberJoined: ["{name} ist einem deiner Spaces beigetreten", ""],
    memberLeft: ["{name} hat einen deiner Spaces verlassen", ""],
    memberRemoved: ["Du wurdest aus einem Space entfernt", ""],
    roleChanged: ["Deine Rolle in einem Space hat sich geändert", ""],
    spaceDeleted: ["Ein Space, in dem du warst, wurde gelöscht", ""],
    filesAdded: ["{name} hat Dateien zu einem Space hinzugefügt", ""],
  },
  es: {
    newSignIn: ["Nuevo inicio de sesión en tu cuenta de zcrypt", "{device} acaba de iniciar sesión. ¿No eras tú? Revisa tus dispositivos."],
    inviteReceived: ["Te añadieron a un Space", "Abre zcrypt para ver lo que compartieron contigo."],
    inviteReceivedBy: ["{name} te añadió a un Space", ""],
    linkViewed: ["Alguien abrió tu enlace compartido", "Uno de tus enlaces compartidos se acaba de abrir."],
    invitePending: ["{name} te invitó a un Space", "Desbloquea tu bóveda para unirte."],
    memberJoined: ["{name} se unió a uno de tus Spaces", ""],
    memberLeft: ["{name} salió de uno de tus Spaces", ""],
    memberRemoved: ["Te quitaron de un Space", ""],
    roleChanged: ["Cambió tu rol en un Space", ""],
    spaceDeleted: ["Se eliminó un Space en el que estabas", ""],
    filesAdded: ["{name} añadió archivos a un Space", ""],
  },
  fr: {
    newSignIn: ["Nouvelle connexion à votre compte zcrypt", "{device} vient de se connecter. Ce n'est pas vous ? Vérifiez vos appareils."],
    inviteReceived: ["Vous avez été ajouté à un Space", "Ouvrez zcrypt pour voir ce qui a été partagé avec vous."],
    inviteReceivedBy: ["{name} vous a ajouté à un Space", ""],
    linkViewed: ["Quelqu'un a ouvert votre lien de partage", "L'un de vos liens de partage vient d'être ouvert."],
    invitePending: ["{name} vous a invité dans un Space", "Déverrouillez votre coffre pour le rejoindre."],
    memberJoined: ["{name} a rejoint l'un de vos Spaces", ""],
    memberLeft: ["{name} a quitté l'un de vos Spaces", ""],
    memberRemoved: ["Vous avez été retiré d'un Space", ""],
    roleChanged: ["Votre rôle dans un Space a changé", ""],
    spaceDeleted: ["Un Space dont vous faisiez partie a été supprimé", ""],
    filesAdded: ["{name} a ajouté des fichiers à un Space", ""],
  },
  ru: {
    newSignIn: ["Новый вход в ваш аккаунт zcrypt", "Только что выполнен вход: {device}. Это не вы? Проверьте устройства."],
    inviteReceived: ["Вас добавили в пространство", "Откройте zcrypt, чтобы увидеть, чем с вами поделились."],
    inviteReceivedBy: ["{name} добавил(а) вас в пространство", ""],
    linkViewed: ["Кто-то открыл вашу ссылку", "Одну из ваших ссылок только что открыли."],
    invitePending: ["{name} приглашает вас в пространство", "Разблокируйте хранилище, чтобы присоединиться."],
    memberJoined: ["{name} присоединился к одному из ваших пространств", ""],
    memberLeft: ["{name} покинул одно из ваших пространств", ""],
    memberRemoved: ["Вас удалили из пространства", ""],
    roleChanged: ["Ваша роль в пространстве изменилась", ""],
    spaceDeleted: ["Пространство, в котором вы были, удалено", ""],
    filesAdded: ["{name} добавил файлы в пространство", ""],
  },
  ur: {
    newSignIn: ["آپ کے zcrypt اکاؤنٹ میں نیا سائن ان", "{device} نے ابھی سائن ان کیا۔ آپ نہیں تھے؟ اپنے آلات دیکھیں۔"],
    inviteReceived: ["آپ کو ایک اسپیس میں شامل کیا گیا", "دیکھنے کے لیے zcrypt کھولیں کہ آپ کے ساتھ کیا شیئر ہوا۔"],
    inviteReceivedBy: ["{name} نے آپ کو ایک اسپیس میں شامل کیا", ""],
    linkViewed: ["کسی نے آپ کا شیئر لنک کھولا", "آپ کا ایک شیئر لنک ابھی کھولا گیا۔"],
    invitePending: ["{name} نے آپ کو ایک اسپیس میں مدعو کیا", "شامل ہونے کے لیے اپنی والٹ کھولیں۔"],
    memberJoined: ["{name} آپ کے ایک اسپیس میں شامل ہوئے", ""],
    memberLeft: ["{name} نے آپ کا ایک اسپیس چھوڑ دیا", ""],
    memberRemoved: ["آپ کو ایک اسپیس سے ہٹا دیا گیا", ""],
    roleChanged: ["ایک اسپیس میں آپ کا کردار بدل گیا", ""],
    spaceDeleted: ["جس اسپیس میں آپ تھے وہ حذف ہو گیا", ""],
    filesAdded: ["{name} نے ایک اسپیس میں فائلیں شامل کیں", ""],
  },
  zh: {
    newSignIn: ["你的 zcrypt 账户有新的登录", "{device} 刚刚登录。不是你本人？请检查你的设备。"],
    inviteReceived: ["你被添加到了一个空间", "打开 zcrypt 查看与你共享的内容。"],
    inviteReceivedBy: ["{name} 把你添加到了一个空间", ""],
    linkViewed: ["有人打开了你的分享链接", "你的一个分享链接刚刚被打开。"],
    invitePending: ["{name} 邀请你加入一个空间", "解锁你的保险库即可加入。"],
    memberJoined: ["{name} 加入了你的一个空间", ""],
    memberLeft: ["{name} 退出了你的一个空间", ""],
    memberRemoved: ["你已被移出一个空间", ""],
    roleChanged: ["你在一个空间中的角色已更改", ""],
    spaceDeleted: ["你所在的一个空间已被删除", ""],
    filesAdded: ["{name} 向一个空间添加了文件", ""],
  },
};

// Shared with lib/notify.ts eventTag: a live event and its push use one tag, so they replace each other.
const FIXED_TAGS = { newSignIn: "zcrypt-sign-in", inviteReceived: "zcrypt-invite", linkViewed: "zcrypt-link" };

function pushTag(msg) {
  if (FIXED_TAGS[msg.type]) return FIXED_TAGS[msg.type];
  const d = msg.data || {};
  return ["zcrypt", msg.type, d.space_id, d.user_id].filter(Boolean).join("-");
}

function pushText(msg) {
  const lang = PUSH_TEXT[msg.lang] ? msg.lang : "en";
  const d = msg.data || {};
  const lookup = (type) => PUSH_TEXT[lang][type] || PUSH_TEXT.en[type];
  let pair = lookup(msg.type);
  if (!pair) return null;
  if (msg.type === "inviteReceived" && d.username) pair = [lookup("inviteReceivedBy")[0], pair[1]];
  const fill = (s) => s.replace("{device}", d.device || "").replace("{name}", d.username || "");
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
    (async () => {
      // A visible tab already got the live event as a toast.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (windows.some((c) => c.visibilityState === "visible")) return;
      await self.registration.showNotification(text.title, {
        body: text.body,
        tag: pushTag(msg),
        renotify: false,
        icon: "/brand/icon-192.png",
        badge: "/brand/icon-192.png",
        data: { url, click: "go" },
      });
    })(),
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
