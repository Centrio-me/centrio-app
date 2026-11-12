// Strings of the 3.8 features. Each locale file attaches its part as `v380`;
// a missing string falls back to English, then Russian (renderer/i18n.js).
module.exports = {
    ru: {
        // the morning summary (3.8.2): wider, «Чего хотят клиенты»
        ms: {
            wants: "Чего хотят клиенты",
            wantsShort: "Чего хотят клиенты?",
            moreServices: "и ещё сервисов: {n}",
            wantsPrompt: "Ниже — сообщения, которые пришли, пока меня не было. Разбери их: для каждого человека коротко — чего он хочет, насколько это срочно и что ему ответить. В конце скажи, с кого начать. Опирайся только на эти сообщения, ничего не додумывай."
        },
        // «Друг Centrio» — beta testers (3.8.2)
        friend: {
            title: "Бета-тестирование",
            label: "Участвовать в тестировании",
            hint: "Обновления приходят чаще: новые функции вы увидите первым. В тестовых версиях могут быть ошибки — напишите о них в поддержку, такие сообщения мы чиним в первую очередь.",
            needsAccount: "Войдите в аккаунт, чтобы участвовать в тестировании.",
            badge: "Друг Centrio",
            badgeTitle: "Вы помогаете тестировать новые версии Centrio",
            joined: "Спасибо! Теперь вы Друг Centrio — новые версии придут к вам первым.",
            left: "Готово. Следующее обновление будет обычной версией.",
            failed: "Не удалось сохранить. Проверьте интернет и попробуйте ещё раз."
        },
        weather: {
            city: "Город для погоды",
            cityHint: "Погода на экране блокировки. С включённым VPN город по сети может определяться неверно — укажите свой.",
            auto: "Определять автоматически",
            search: "Найти город",
            placeholder: "Например, Москва",
            notFound: "Город не найден",
            current: "Сейчас"
        },
        allInbox: {
            autoFilters: "Автофильтры",
            autoFiltersHint: "Личные, Группы и Каналы в колонке папок. Выключите, если раскладываете чаты по своим папкам.",
            feedbackLabel: 'Отзыв о режиме',
            feedbackHint: 'Режим в альфа-тестировании. Расскажите, что удобно, что сломалось и чего не хватает — читаем каждое сообщение.',
            alpha: 'Альфа',
            alphaTitle: 'Режим в альфа-тестировании',
            alphaText: 'Все переписки в одном окне — новый режим, мы его активно дорабатываем. Будем рады вашему отзыву: что удобно, что сломалось, чего не хватает.',
            feedback: 'Оставить отзыв',
            feedbackSubject: 'Отзыв о режиме «Все мессенджеры»',
            proTitle: 'Все мессенджеры — в ПРО',
            proDesc: 'Чаты Telegram, WhatsApp, MAX, VK и других в одном списке и одном окне переписки. Режим доступен на плане ПРО или Team.',
            settingsTitle: 'Все мессенджеры',
            settingsLabel: 'Режим «Все мессенджеры»',
            settingsHint: 'Кнопка в боковой панели: все чаты в одном списке и переписка в нашем окне. Если выключить, кнопка пропадёт.',
            settingsPro: 'Режим работает на плане ПРО или Team.',
            title: 'Все мессенджеры',
            search: 'Поиск по чатам',
            all: 'Все',
            unread: 'Непро­читанные',
            close: 'Закрыть',
            empty: 'Здесь пока пусто',
            noSources: 'Откройте Telegram, WhatsApp, MAX или ВКонтакте: их чаты появятся здесь',
            nothingFound: 'Ничего не найдено по запросу «{q}»',
            personal: 'Личные',
            groups: 'Группы',
            channels: 'Каналы',
            pinned: 'Закреплён',
            muted: 'Без звука',
            online: 'в сети',
            clear: 'Очистить',
            draft: 'Черновик',
            mentions: 'Вас упомянули'
        }
    },
    en: {
        // the morning summary (3.8.2): wider, «Чего хотят клиенты»
        ms: {
            wants: "What people want",
            wantsShort: "What do people want?",
            moreServices: "and {n} more services",
            wantsPrompt: "Below are the messages that came in while I was away. Go through them: for each person, briefly — what they want, how urgent it is and what to answer. At the end, say whom to start with. Use only these messages, do not make anything up."
        },
        // «Друг Centrio» — beta testers (3.8.2)
        friend: {
            title: "Beta testing",
            label: "Take part in testing",
            hint: "Updates come more often and you see new features first. Test versions may have bugs — tell us in support, we fix those reports first.",
            needsAccount: "Sign in to take part in testing.",
            badge: "Friend of Centrio",
            badgeTitle: "You help test new versions of Centrio",
            joined: "Thank you! You are a Friend of Centrio now — new versions reach you first.",
            left: "Done. The next update will be an ordinary version.",
            failed: "Could not save. Check the connection and try again."
        },
        weather: {
            city: "Weather city",
            cityHint: "Weather on the lock screen. With a VPN on, the city from your network may be wrong — set your own.",
            auto: "Detect automatically",
            search: "Find a city",
            placeholder: "For example, London",
            notFound: "City not found",
            current: "Now"
        },
        allInbox: {
            autoFilters: "Automatic filters",
            autoFiltersHint: "Personal, Groups and Channels in the folder column. Turn off if you sort chats into your own folders.",
            feedbackLabel: 'Feedback on the mode',
            feedbackHint: 'The mode is in alpha testing. Tell us what works, what broke and what is missing — we read every message.',
            alpha: 'Alpha',
            alphaTitle: 'This mode is in alpha testing',
            alphaText: 'All your conversations in one window is a new mode we are actively improving. We would love your feedback: what works, what broke, what is missing.',
            feedback: 'Leave feedback',
            feedbackSubject: 'Feedback on «All messengers»',
            proTitle: 'All messengers is a PRO feature',
            proDesc: 'Chats of Telegram, WhatsApp, MAX, VK and more in one list and one conversation window. Available on PRO or Team.',
            settingsTitle: 'All messengers',
            settingsLabel: '«All messengers» mode',
            settingsHint: 'A sidebar button: every chat in one list, conversations in our own window. Switch it off to hide the button.',
            settingsPro: 'Works on the PRO or Team plan.',
            title: 'All messengers',
            search: 'Search chats',
            all: 'All',
            unread: 'Unread',
            close: 'Close',
            empty: 'Nothing here yet',
            noSources: 'Open Telegram, WhatsApp, MAX or VK: their chats appear here',
            nothingFound: 'Nothing found for “{q}”',
            personal: 'Personal',
            groups: 'Groups',
            channels: 'Channels',
            pinned: 'Pinned',
            muted: 'Muted',
            online: 'online',
            clear: 'Clear',
            draft: 'Draft',
            mentions: 'You were mentioned'
        }
    },
    de: {
        // the morning summary (3.8.2): wider, «Чего хотят клиенты»
        ms: {
            wants: "Was die Leute wollen",
            wantsShort: "Was wollen die Leute?",
            moreServices: "und {n} weitere Dienste",
            wantsPrompt: "Unten stehen die Nachrichten, die kamen, während ich weg war. Geh sie durch: für jede Person kurz — was sie will, wie dringend es ist und was ich antworten soll. Sag am Ende, mit wem ich anfangen soll. Nutze nur diese Nachrichten, erfinde nichts."
        },
        // «Друг Centrio» — beta testers (3.8.2)
        friend: {
            title: "Beta-Test",
            label: "Am Test teilnehmen",
            hint: "Updates kommen öfter und du siehst neue Funktionen als Erster. Testversionen können Fehler haben — melde sie im Support, solche Meldungen beheben wir zuerst.",
            needsAccount: "Melde dich an, um am Test teilzunehmen.",
            badge: "Freund von Centrio",
            badgeTitle: "Du hilfst, neue Versionen von Centrio zu testen",
            joined: "Danke! Du bist jetzt ein Freund von Centrio — neue Versionen kommen zuerst zu dir.",
            left: "Fertig. Das nächste Update ist eine normale Version.",
            failed: "Speichern fehlgeschlagen. Prüfe die Verbindung und versuche es erneut."
        },
        weather: {
            city: "Stadt für das Wetter",
            cityHint: "Wetter auf dem Sperrbildschirm. Mit aktivem VPN kann die Stadt falsch erkannt werden — legen Sie Ihre fest.",
            auto: "Automatisch erkennen",
            search: "Stadt suchen",
            placeholder: "Zum Beispiel Berlin",
            notFound: "Stadt nicht gefunden",
            current: "Jetzt"
        },
        allInbox: {
            autoFilters: "Automatische Filter",
            autoFiltersHint: "Privat, Gruppen und Kanäle in der Ordnerspalte. Ausschalten, wenn du Chats selbst in Ordner sortierst.",
            feedbackLabel: 'Feedback zum Modus',
            feedbackHint: 'Der Modus ist in der Alpha-Phase. Sag uns, was gut ist, was kaputt ist und was fehlt.',
            alpha: 'Alpha',
            alphaTitle: 'Dieser Modus ist in der Alpha-Phase',
            alphaText: 'Alle Unterhaltungen in einem Fenster ist ein neuer Modus, den wir aktiv verbessern. Wir freuen uns über dein Feedback.',
            feedback: 'Feedback geben',
            feedbackSubject: 'Feedback zu «Alle Messenger»',
            proTitle: 'Alle Messenger ist eine PRO-Funktion',
            proDesc: 'Chats von Telegram, WhatsApp, MAX, VK und mehr in einer Liste und einem Fenster. Verfügbar mit PRO oder Team.',
            settingsTitle: 'Alle Messenger',
            settingsLabel: 'Modus «Alle Messenger»',
            settingsHint: 'Ein Knopf in der Seitenleiste: alle Chats in einer Liste. Ausschalten blendet den Knopf aus.',
            settingsPro: 'Funktioniert mit PRO oder Team.',
            title: 'Alle Messenger',
            search: 'Chats durchsuchen',
            all: 'Alle',
            unread: 'Ungelesen',
            close: 'Schließen',
            empty: 'Noch nichts hier',
            noSources: 'Öffnen Sie Telegram oder MAX: ihre Chats erscheinen hier',
            personal: 'Persönlich',
            groups: 'Gruppen',
            channels: 'Kanäle',
            pinned: 'Angeheftet',
            muted: 'Stumm',
            online: 'online',
            clear: 'Leeren',
            draft: 'Entwurf',
            mentions: 'Sie wurden erwähnt'
        }
    },
    es: {
        // the morning summary (3.8.2): wider, «Чего хотят клиенты»
        ms: {
            wants: "Qué quieren los clientes",
            wantsShort: "¿Qué quieren los clientes?",
            moreServices: "y {n} servicios más",
            wantsPrompt: "Abajo están los mensajes que llegaron mientras no estaba. Revísalos: para cada persona, en breve — qué quiere, qué tan urgente es y qué responder. Al final, di por quién empezar. Usa solo estos mensajes, no inventes nada."
        },
        // «Друг Centrio» — beta testers (3.8.2)
        friend: {
            title: "Pruebas beta",
            label: "Participar en las pruebas",
            hint: "Las actualizaciones llegan más a menudo y ves las novedades primero. Las versiones de prueba pueden tener errores: cuéntanoslos en soporte, los arreglamos primero.",
            needsAccount: "Inicia sesión para participar en las pruebas.",
            badge: "Amigo de Centrio",
            badgeTitle: "Ayudas a probar las nuevas versiones de Centrio",
            joined: "¡Gracias! Ahora eres Amigo de Centrio: las nuevas versiones te llegan primero.",
            left: "Listo. La próxima actualización será una versión normal.",
            failed: "No se pudo guardar. Revisa la conexión e inténtalo de nuevo."
        },
        weather: {
            city: "Ciudad para el tiempo",
            cityHint: "El tiempo en la pantalla de bloqueo. Con una VPN activa, la ciudad puede detectarse mal: indica la tuya.",
            auto: "Detectar automáticamente",
            search: "Buscar ciudad",
            placeholder: "Por ejemplo, Madrid",
            notFound: "Ciudad no encontrada",
            current: "Ahora"
        },
        allInbox: {
            autoFilters: "Filtros automáticos",
            autoFiltersHint: "Personales, Grupos y Canales en la columna de carpetas. Desactívalo si ordenas los chats en tus carpetas.",
            feedbackLabel: 'Opinión sobre el modo',
            feedbackHint: 'El modo está en fase alfa. Cuéntanos qué funciona, qué falla y qué falta.',
            alpha: 'Alfa',
            alphaTitle: 'Este modo está en fase alfa',
            alphaText: 'Todas las conversaciones en una ventana es un modo nuevo que mejoramos activamente. Nos encantará tu opinión.',
            feedback: 'Dejar opinión',
            feedbackSubject: 'Opinión sobre «Todos los mensajeros»',
            proTitle: 'Todos los mensajeros es una función PRO',
            proDesc: 'Chats de Telegram, WhatsApp, MAX, VK y más en una lista y una ventana. Disponible en PRO o Team.',
            settingsTitle: 'Todos los mensajeros',
            settingsLabel: 'Modo «Todos los mensajeros»',
            settingsHint: 'Un botón en la barra lateral: todos los chats en una lista. Al desactivarlo, el botón desaparece.',
            settingsPro: 'Funciona con PRO o Team.',
            title: 'Todos los mensajeros',
            search: 'Buscar chats',
            all: 'Todos',
            unread: 'No leídos',
            close: 'Cerrar',
            empty: 'Aún no hay nada',
            noSources: 'Abre Telegram o MAX: sus chats aparecerán aquí',
            personal: 'Personales',
            groups: 'Grupos',
            channels: 'Canales',
            pinned: 'Fijado',
            muted: 'Silenciado',
            online: 'en línea',
            clear: 'Borrar',
            draft: 'Borrador',
            mentions: 'Te mencionaron'
        }
    },
    fr: {
        // the morning summary (3.8.2): wider, «Чего хотят клиенты»
        ms: {
            wants: "Ce que veulent les clients",
            wantsShort: "Que veulent les clients ?",
            moreServices: "et {n} autres services",
            wantsPrompt: "Voici les messages arrivés pendant mon absence. Passe-les en revue : pour chaque personne, brièvement — ce qu’elle veut, l’urgence et quoi répondre. À la fin, dis par qui commencer. Appuie-toi uniquement sur ces messages, n’invente rien."
        },
        // «Друг Centrio» — beta testers (3.8.2)
        friend: {
            title: "Tests bêta",
            label: "Participer aux tests",
            hint: "Les mises à jour arrivent plus souvent et vous voyez les nouveautés en premier. Les versions de test peuvent contenir des erreurs — signalez-les au support, nous les corrigeons en priorité.",
            needsAccount: "Connectez-vous pour participer aux tests.",
            badge: "Ami de Centrio",
            badgeTitle: "Vous aidez à tester les nouvelles versions de Centrio",
            joined: "Merci ! Vous êtes maintenant Ami de Centrio — les nouvelles versions arrivent chez vous en premier.",
            left: "C’est fait. La prochaine mise à jour sera une version normale.",
            failed: "Impossible d’enregistrer. Vérifiez la connexion et réessayez."
        },
        weather: {
            city: "Ville pour la météo",
            cityHint: "La météo de l’écran de verrouillage. Avec un VPN actif, la ville peut être mal détectée — indiquez la vôtre.",
            auto: "Détecter automatiquement",
            search: "Chercher une ville",
            placeholder: "Par exemple, Paris",
            notFound: "Ville introuvable",
            current: "Actuelle"
        },
        allInbox: {
            autoFilters: "Filtres automatiques",
            autoFiltersHint: "Personnels, Groupes et Canaux dans la colonne des dossiers. Désactivez si vous rangez les chats vous-même.",
            feedbackLabel: 'Avis sur le mode',
            feedbackHint: 'Le mode est en phase alpha. Dites-nous ce qui marche, ce qui casse et ce qui manque.',
            alpha: 'Alpha',
            alphaTitle: 'Ce mode est en phase alpha',
            alphaText: 'Toutes vos conversations dans une seule fenêtre : un nouveau mode que nous améliorons activement. Votre avis nous aidera beaucoup.',
            feedback: 'Donner mon avis',
            feedbackSubject: 'Avis sur «Toutes les messageries»',
            proTitle: 'Toutes les messageries : fonction PRO',
            proDesc: 'Les chats de Telegram, WhatsApp, MAX, VK et autres dans une liste et une fenêtre. Disponible en PRO ou Team.',
            settingsTitle: 'Toutes les messageries',
            settingsLabel: 'Mode «Toutes les messageries»',
            settingsHint: 'Un bouton dans la barre latérale : tous les chats dans une liste. Désactivé, le bouton disparaît.',
            settingsPro: 'Fonctionne avec PRO ou Team.',
            title: 'Toutes les messageries',
            search: 'Rechercher des discussions',
            all: 'Toutes',
            unread: 'Non lues',
            close: 'Fermer',
            empty: 'Rien pour l’instant',
            noSources: 'Ouvrez Telegram ou MAX : leurs discussions apparaissent ici',
            personal: 'Personnelles',
            groups: 'Groupes',
            channels: 'Chaînes',
            pinned: 'Épinglée',
            muted: 'En sourdine',
            online: 'en ligne',
            clear: 'Effacer',
            draft: 'Brouillon',
            mentions: 'Vous avez été mentionné'
        }
    },
    it: {
        // the morning summary (3.8.2): wider, «Чего хотят клиенты»
        ms: {
            wants: "Cosa vogliono i clienti",
            wantsShort: "Cosa vogliono i clienti?",
            moreServices: "e altri {n} servizi",
            wantsPrompt: "Qui sotto ci sono i messaggi arrivati mentre ero via. Esaminali: per ogni persona, in breve — cosa vuole, quanto è urgente e cosa rispondere. Alla fine dimmi da chi iniziare. Usa solo questi messaggi, non inventare nulla."
        },
        // «Друг Centrio» — beta testers (3.8.2)
        friend: {
            title: "Beta test",
            label: "Partecipa ai test",
            hint: "Gli aggiornamenti arrivano più spesso e vedi per primo le novità. Le versioni di prova possono avere errori: segnalali al supporto, li correggiamo per primi.",
            needsAccount: "Accedi per partecipare ai test.",
            badge: "Amico di Centrio",
            badgeTitle: "Aiuti a testare le nuove versioni di Centrio",
            joined: "Grazie! Ora sei Amico di Centrio: le nuove versioni arrivano prima a te.",
            left: "Fatto. Il prossimo aggiornamento sarà una versione normale.",
            failed: "Salvataggio non riuscito. Controlla la connessione e riprova."
        },
        weather: {
            city: "Città per il meteo",
            cityHint: "Il meteo nella schermata di blocco. Con una VPN attiva la città può essere sbagliata: indica la tua.",
            auto: "Rileva automaticamente",
            search: "Cerca città",
            placeholder: "Ad esempio, Roma",
            notFound: "Città non trovata",
            current: "Ora"
        },
        allInbox: {
            autoFilters: "Filtri automatici",
            autoFiltersHint: "Personali, Gruppi e Canali nella colonna delle cartelle. Disattiva se ordini le chat nelle tue cartelle.",
            feedbackLabel: 'Parere sulla modalità',
            feedbackHint: 'La modalità è in fase alpha. Dicci cosa funziona, cosa non va e cosa manca.',
            alpha: 'Alpha',
            alphaTitle: 'Questa modalità è in fase alpha',
            alphaText: 'Tutte le conversazioni in una finestra è una nuova modalità che stiamo migliorando. Ci farebbe piacere il tuo parere.',
            feedback: 'Lascia un parere',
            feedbackSubject: 'Parere su «Tutti i messenger»',
            proTitle: 'Tutti i messenger è una funzione PRO',
            proDesc: 'Le chat di Telegram, WhatsApp, MAX, VK e altri in un elenco e una finestra. Disponibile con PRO o Team.',
            settingsTitle: 'Tutti i messenger',
            settingsLabel: 'Modalità «Tutti i messenger»',
            settingsHint: 'Un pulsante nella barra laterale: tutte le chat in un elenco. Se disattivata, il pulsante sparisce.',
            settingsPro: 'Funziona con PRO o Team.',
            title: 'Tutti i messenger',
            search: 'Cerca chat',
            all: 'Tutte',
            unread: 'Non lette',
            close: 'Chiudi',
            empty: 'Ancora niente',
            noSources: 'Apri Telegram o MAX: le loro chat appaiono qui',
            personal: 'Personali',
            groups: 'Gruppi',
            channels: 'Canali',
            pinned: 'Fissata',
            muted: 'Silenziata',
            online: 'online',
            clear: 'Cancella',
            draft: 'Bozza',
            mentions: 'Sei stato menzionato'
        }
    },
    zh: {
        // the morning summary (3.8.2): wider, «Чего хотят клиенты»
        ms: {
            wants: "客户想要什么",
            wantsShort: "客户想要什么？",
            moreServices: "另有 {n} 个服务",
            wantsPrompt: "下面是我不在时收到的消息。请逐一分析：对每个人简要说明——他想要什么、有多紧急、该怎么回复。最后告诉我先回复谁。只依据这些消息，不要编造。"
        },
        // «Друг Centrio» — beta testers (3.8.2)
        friend: {
            title: "Beta 测试",
            label: "参与测试",
            hint: "更新更频繁，您将率先体验新功能。测试版本可能存在问题——请告诉支持团队，我们会优先修复。",
            needsAccount: "登录后即可参与测试。",
            badge: "Centrio 之友",
            badgeTitle: "您正在帮助测试 Centrio 的新版本",
            joined: "谢谢！您现在是 Centrio 之友——新版本会最先送到您这里。",
            left: "已完成。下一次更新将是正式版本。",
            failed: "保存失败。请检查网络后重试。"
        },
        weather: {
            city: "天气城市",
            cityHint: "锁屏上的天气。开启 VPN 时，按网络判断的城市可能不对——请设置您的城市。",
            auto: "自动识别",
            search: "查找城市",
            placeholder: "例如：北京",
            notFound: "未找到城市",
            current: "当前"
        },
        allInbox: {
            autoFilters: "自动筛选",
            autoFiltersHint: "文件夹栏中的个人、群组和频道。如果你自己整理聊天到文件夹，可以关闭。",
            feedbackLabel: '关于此模式的反馈',
            feedbackHint: '此模式正在 Alpha 测试中。告诉我们哪些好用、哪些有问题、还缺什么。',
            alpha: 'Alpha 测试',
            alphaTitle: '此模式正在 Alpha 测试中',
            alphaText: '所有对话集中在一个窗口是我们正在积极完善的新模式。欢迎留下您的反馈。',
            feedback: '留下反馈',
            feedbackSubject: '关于「所有消息应用」的反馈',
            proTitle: '「所有消息应用」是 PRO 功能',
            proDesc: 'Telegram、WhatsApp、MAX、VK 等的聊天集中在一个列表和窗口中。PRO 或 Team 可用。',
            settingsTitle: '所有消息应用',
            settingsLabel: '「所有消息应用」模式',
            settingsHint: '侧栏中的按钮：所有聊天在一个列表中。关闭后按钮将隐藏。',
            settingsPro: '在 PRO 或 Team 方案中可用。',
            title: '所有消息应用',
            search: '搜索聊天',
            all: '全部',
            unread: '未读',
            close: '关闭',
            empty: '这里还没有内容',
            noSources: '打开 Telegram 或 MAX，它们的聊天会显示在这里',
            personal: '私聊',
            groups: '群组',
            channels: '频道',
            pinned: '已置顶',
            muted: '已静音',
            online: '在线',
            clear: '清除',
            draft: '草稿',
            mentions: '有人提到了你'
        }
    }
}
