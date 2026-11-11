// Strings of the 3.7.1 features (tab sleep, restore points, work hours, assistant, morning summary, quick switcher).
// Each locale file attaches its part as `v371`; a missing string falls back to English, then Russian (renderer/i18n.js).
module.exports = {
    ru: {
        cancel: 'Отмена',
        hib: {
            title: 'Сон вкладок',
            after: 'Усыплять неиспользуемые вкладки',
            afterHint: 'Спящая вкладка не занимает память и просыпается при открытии. Вход в аккаунт сохраняется.',
            off: 'Не усыплять', minutes: 'Через {n} мин', hours: 'Через {n} ч',
            scope: 'Какие вкладки',
            scopeQuiet: 'Без новых сообщений', scopeAll: 'Все вкладки',
            scopeQuietHint: 'Засыпают задачи, документы, нейросети и мессенджеры с выключенными уведомлениями. Мессенджеры и почта продолжают получать сообщения.',
            scopeAllHint: 'Засыпают и мессенджеры. Пока вкладка спит, сообщения и уведомления из неё не приходят.',
            never: 'Никогда не засыпают: открытая вкладка, вкладки в разделённом экране и отдельных окнах, вкладки с непрочитанными, со звуком и мессенджеры команды. Чтобы вкладка не засыпала, включите «Не усыплять» в её меню (правая кнопка мыши).',
            keepAwake: 'Не усыплять'
        },
        rp: {
            title: 'Точки восстановления',
            lead: 'Сохранённые копии настроек',
            leadHint: 'Сервисы, папки, сплиты, быстрые ответы и настройки. Копия делается раз в день сама и перед каждым восстановлением. PIN, пароли и ключи не сохраняются.',
            saveNow: 'Сохранить сейчас', saved: 'Точка сохранена.', saveFailed: 'Не удалось сохранить точку.',
            empty: 'Пока нет точек. Первая появится через минуту после запуска.',
            restore: 'Восстановить', delete: 'Удалить',
            restoreFailed: 'Не удалось восстановить эту точку.',
            confirmTitle: 'Восстановить настройки?',
            confirmText: 'Сервисы, папки, сплиты и настройки вернутся к состоянию на {when}. Текущее состояние сохранится отдельной точкой, а Centrio перезапустится. Входы в мессенджеры не пострадают.',
            reason_daily: 'автоматически', reason_manual: 'вручную', 'reason_before-restore': 'перед восстановлением',
            services: 'Сервисов: {n}', folders: 'Папок: {n}', presets: 'Сплитов: {n}', replies: 'Быстрых ответов: {n}'
        },
        wh: {
            title: 'Рабочее время',
            teamLine: 'Рабочее время команды: {hours}',
            teamHint: 'Задаёт руководитель. Вне этого времени рабочие мессенджеры команды не присылают уведомлений и не звучат. Сообщения не теряются: они ждут в центре уведомлений и в утренней сводке.',
            enable: 'Мой график',
            enableHint: 'Рабочие сервисы затихают вне рабочего времени, личные — в рабочее время. Без всплывающих окон и звука; счётчик непрочитанных работает, сообщения ждут в центре уведомлений.',
            days: 'Рабочие дни', hours: 'Часы', hoursHint: 'Если конец раньше начала, смена переходит через полночь.',
            servicesTitle: 'Когда присылать уведомления',
            servicesHint: 'Рабочий — только в рабочее время. Личный — только вечером и в выходные. Всегда — как обычно.',
            mode_always: 'Всегда', mode_work: 'Рабочий', mode_personal: 'Личный', mode_alwaysHint: 'Уведомления приходят всегда', mode_workHint: 'Затихает вне рабочего времени и в выходные', mode_personalHint: 'Затихает в рабочее время, не отвлекает днём',
            d1: 'Пн', d2: 'Вт', d3: 'Ср', d4: 'Чт', d5: 'Пт', d6: 'Сб', d7: 'Вс'
        }
    },
    en: {
        cancel: 'Cancel',
        hib: {
            title: 'Tab sleep',
            after: 'Put unused tabs to sleep',
            afterHint: 'A sleeping tab uses no memory and wakes up when opened. You stay signed in.',
            off: 'Never', minutes: 'After {n} min', hours: 'After {n} h',
            scope: 'Which tabs',
            scopeQuiet: 'Without new messages', scopeAll: 'All tabs',
            scopeQuietHint: 'Task lists, documents, AI chats and messengers with notifications off fall asleep. Messengers and mail keep receiving messages.',
            scopeAllHint: 'Messengers fall asleep too. While a tab sleeps, its messages and notifications do not arrive.',
            never: 'Never put to sleep: the open tab, tabs in split screen or their own window, tabs with unread messages or sound, and team messengers. To keep a tab awake, turn on "Keep awake" in its menu (right click).',
            keepAwake: 'Keep awake'
        },
        rp: {
            title: 'Restore points',
            lead: 'Saved copies of your setup',
            leadHint: 'Services, folders, splits, quick replies and settings. A copy is made once a day and before every restore. PIN, passwords and keys are not saved.',
            saveNow: 'Save now', saved: 'Restore point saved.', saveFailed: 'Could not save a restore point.',
            empty: 'No points yet. The first one appears a minute after start.',
            restore: 'Restore', delete: 'Delete',
            restoreFailed: 'Could not restore this point.',
            confirmTitle: 'Restore your setup?',
            confirmText: 'Services, folders, splits and settings go back to how they were on {when}. The current state is saved as a separate point and Centrio restarts. Messenger sign-ins are not affected.',
            reason_daily: 'automatic', reason_manual: 'manual', 'reason_before-restore': 'before a restore',
            services: 'Services: {n}', folders: 'Folders: {n}', presets: 'Splits: {n}', replies: 'Quick replies: {n}'
        },
        wh: {
            title: 'Work hours',
            teamLine: 'Team work hours: {hours}',
            teamHint: 'Set by your manager. Outside these hours team messengers send no notifications and make no sound. Messages are not lost: they wait in the notification centre and the morning summary.',
            enable: 'My schedule',
            enableHint: 'Work services go quiet outside work hours, personal ones during them. No pop-ups and no sound; unread counters keep counting and messages wait in the notification centre.',
            days: 'Work days', hours: 'Hours', hoursHint: 'If the end is earlier than the start, the shift crosses midnight.',
            servicesTitle: 'When to notify',
            servicesHint: 'Work — only during work hours. Personal — only in the evening and on days off. Always — as usual.',
            mode_always: 'Always', mode_work: 'Work', mode_personal: 'Personal', mode_alwaysHint: 'Notifications always come', mode_workHint: 'Quiet outside work hours and on days off', mode_personalHint: 'Quiet during work hours',
            d1: 'Mon', d2: 'Tue', d3: 'Wed', d4: 'Thu', d5: 'Fri', d6: 'Sat', d7: 'Sun'
        }
    },
    de: {
        cancel: 'Abbrechen',
        hib: {
            title: 'Tab-Ruhezustand', after: 'Unbenutzte Tabs schlafen legen',
            afterHint: 'Ein schlafender Tab braucht keinen Speicher und wacht beim Öffnen auf. Du bleibst angemeldet.',
            off: 'Nie', minutes: 'Nach {n} Min.', hours: 'Nach {n} Std.',
            scope: 'Welche Tabs', scopeQuiet: 'Ohne neue Nachrichten', scopeAll: 'Alle Tabs',
            scopeQuietHint: 'Aufgaben, Dokumente, KI-Chats und Messenger mit ausgeschalteten Benachrichtigungen schlafen ein. Messenger und E-Mail empfangen weiter Nachrichten.',
            scopeAllHint: 'Auch Messenger schlafen ein. Solange ein Tab schläft, kommen keine Nachrichten und Benachrichtigungen an.',
            never: 'Nie schlafen gelegt: der offene Tab, Tabs im geteilten Bildschirm oder eigenen Fenster, Tabs mit Ungelesenem oder Ton und Team-Messenger. Damit ein Tab wach bleibt, aktiviere „Wach halten“ in seinem Menü (Rechtsklick).',
            keepAwake: 'Wach halten'
        },
        rp: {
            title: 'Wiederherstellungspunkte', lead: 'Gespeicherte Kopien deiner Einrichtung',
            leadHint: 'Dienste, Ordner, Splits, Schnellantworten und Einstellungen. Eine Kopie entsteht einmal täglich und vor jeder Wiederherstellung. PIN, Passwörter und Schlüssel werden nicht gespeichert.',
            saveNow: 'Jetzt speichern', saved: 'Punkt gespeichert.', saveFailed: 'Punkt konnte nicht gespeichert werden.',
            empty: 'Noch keine Punkte. Der erste entsteht eine Minute nach dem Start.',
            restore: 'Wiederherstellen', delete: 'Löschen', restoreFailed: 'Dieser Punkt konnte nicht wiederhergestellt werden.',
            confirmTitle: 'Einrichtung wiederherstellen?',
            confirmText: 'Dienste, Ordner, Splits und Einstellungen kehren zum Stand vom {when} zurück. Der aktuelle Stand wird als eigener Punkt gespeichert und Centrio startet neu. Messenger-Anmeldungen bleiben erhalten.',
            reason_daily: 'automatisch', reason_manual: 'manuell', 'reason_before-restore': 'vor einer Wiederherstellung',
            services: 'Dienste: {n}', folders: 'Ordner: {n}', presets: 'Splits: {n}', replies: 'Schnellantworten: {n}'
        },
        wh: {
            title: 'Arbeitszeit', teamLine: 'Arbeitszeit des Teams: {hours}',
            teamHint: 'Vom Vorgesetzten festgelegt. Außerhalb dieser Zeit senden Team-Messenger keine Benachrichtigungen und keinen Ton. Nachrichten gehen nicht verloren.',
            enable: 'Mein Zeitplan', enableHint: 'Arbeitsdienste werden außerhalb der Arbeitszeit still, private während der Arbeitszeit. Keine Pop-ups, kein Ton; Zähler laufen weiter.',
            days: 'Arbeitstage', hours: 'Uhrzeit', hoursHint: 'Liegt das Ende vor dem Beginn, geht die Schicht über Mitternacht.',
            servicesTitle: 'Wann benachrichtigen', servicesHint: 'Arbeit — nur während der Arbeitszeit. Privat — nur abends und an freien Tagen. Immer — wie gewohnt.',
            mode_always: 'Immer', mode_work: 'Arbeit', mode_personal: 'Privat', mode_alwaysHint: 'Benachrichtigungen kommen immer', mode_workHint: 'Still außerhalb der Arbeitszeit', mode_personalHint: 'Still während der Arbeitszeit',
            d1: 'Mo', d2: 'Di', d3: 'Mi', d4: 'Do', d5: 'Fr', d6: 'Sa', d7: 'So'
        }
    },
    es: {
        cancel: 'Cancelar',
        hib: {
            title: 'Suspensión de pestañas', after: 'Suspender pestañas sin usar',
            afterHint: 'Una pestaña suspendida no usa memoria y despierta al abrirla. La sesión se mantiene.',
            off: 'Nunca', minutes: 'Tras {n} min', hours: 'Tras {n} h',
            scope: 'Qué pestañas', scopeQuiet: 'Sin mensajes nuevos', scopeAll: 'Todas',
            scopeQuietHint: 'Se suspenden tareas, documentos, chats de IA y mensajeros con avisos desactivados. Mensajeros y correo siguen recibiendo mensajes.',
            scopeAllHint: 'También se suspenden los mensajeros. Mientras una pestaña duerme, no llegan sus mensajes ni avisos.',
            never: 'Nunca se suspenden: la pestaña abierta, las de pantalla dividida o ventana propia, las que tienen no leídos o sonido y los mensajeros del equipo. Para mantener una despierta, activa «Mantener despierta» en su menú (clic derecho).',
            keepAwake: 'Mantener despierta'
        },
        rp: {
            title: 'Puntos de restauración', lead: 'Copias guardadas de tu configuración',
            leadHint: 'Servicios, carpetas, divisiones, respuestas rápidas y ajustes. Se crea una copia al día y antes de cada restauración. PIN, contraseñas y claves no se guardan.',
            saveNow: 'Guardar ahora', saved: 'Punto guardado.', saveFailed: 'No se pudo guardar el punto.',
            empty: 'Aún no hay puntos. El primero aparece un minuto después del inicio.',
            restore: 'Restaurar', delete: 'Eliminar', restoreFailed: 'No se pudo restaurar este punto.',
            confirmTitle: '¿Restaurar la configuración?',
            confirmText: 'Servicios, carpetas, divisiones y ajustes vuelven al estado del {when}. El estado actual se guarda como otro punto y Centrio se reinicia. Las sesiones de los mensajeros no se ven afectadas.',
            reason_daily: 'automático', reason_manual: 'manual', 'reason_before-restore': 'antes de restaurar',
            services: 'Servicios: {n}', folders: 'Carpetas: {n}', presets: 'Divisiones: {n}', replies: 'Respuestas rápidas: {n}'
        },
        wh: {
            title: 'Horario laboral', teamLine: 'Horario del equipo: {hours}',
            teamHint: 'Lo fija tu responsable. Fuera de este horario los mensajeros del equipo no envían avisos ni sonido. Los mensajes no se pierden.',
            enable: 'Mi horario', enableHint: 'Los servicios de trabajo se silencian fuera del horario y los personales durante él. Sin ventanas ni sonido; los contadores siguen.',
            days: 'Días laborables', hours: 'Horas', hoursHint: 'Si el fin es antes del inicio, el turno pasa la medianoche.',
            servicesTitle: 'Cuándo notificar', servicesHint: 'Trabajo — solo en horario laboral. Personal — solo por la tarde y en días libres. Siempre — como de costumbre.',
            mode_always: 'Siempre', mode_work: 'Trabajo', mode_personal: 'Personal', mode_alwaysHint: 'Las notificaciones llegan siempre', mode_workHint: 'Silencio fuera del horario laboral', mode_personalHint: 'Silencio durante el horario laboral',
            d1: 'Lu', d2: 'Ma', d3: 'Mi', d4: 'Ju', d5: 'Vi', d6: 'Sá', d7: 'Do'
        }
    },
    fr: {
        cancel: 'Annuler',
        hib: {
            title: 'Mise en veille des onglets', after: 'Mettre en veille les onglets inutilisés',
            afterHint: 'Un onglet en veille n’utilise pas de mémoire et se réveille à l’ouverture. Vous restez connecté.',
            off: 'Jamais', minutes: 'Après {n} min', hours: 'Après {n} h',
            scope: 'Quels onglets', scopeQuiet: 'Sans nouveaux messages', scopeAll: 'Tous les onglets',
            scopeQuietHint: 'Tâches, documents, chats d’IA et messageries aux notifications coupées se mettent en veille. Messageries et e-mail continuent de recevoir les messages.',
            scopeAllHint: 'Les messageries aussi. Tant qu’un onglet dort, ses messages et notifications n’arrivent pas.',
            never: 'Jamais en veille : l’onglet ouvert, ceux en écran partagé ou dans leur propre fenêtre, ceux avec des non-lus ou du son et les messageries de l’équipe. Pour garder un onglet éveillé, activez « Garder éveillé » dans son menu (clic droit).',
            keepAwake: 'Garder éveillé'
        },
        rp: {
            title: 'Points de restauration', lead: 'Copies enregistrées de votre configuration',
            leadHint: 'Services, dossiers, écrans partagés, réponses rapides et réglages. Une copie est faite chaque jour et avant chaque restauration. PIN, mots de passe et clés ne sont pas enregistrés.',
            saveNow: 'Enregistrer', saved: 'Point enregistré.', saveFailed: 'Impossible d’enregistrer le point.',
            empty: 'Pas encore de points. Le premier apparaît une minute après le démarrage.',
            restore: 'Restaurer', delete: 'Supprimer', restoreFailed: 'Impossible de restaurer ce point.',
            confirmTitle: 'Restaurer la configuration ?',
            confirmText: 'Services, dossiers, écrans partagés et réglages reviennent à leur état du {when}. L’état actuel est enregistré comme un autre point et Centrio redémarre. Les connexions aux messageries ne changent pas.',
            reason_daily: 'automatique', reason_manual: 'manuel', 'reason_before-restore': 'avant une restauration',
            services: 'Services : {n}', folders: 'Dossiers : {n}', presets: 'Écrans partagés : {n}', replies: 'Réponses rapides : {n}'
        },
        wh: {
            title: 'Heures de travail', teamLine: 'Heures de l’équipe : {hours}',
            teamHint: 'Fixées par votre responsable. En dehors, les messageries de l’équipe n’envoient ni notification ni son. Les messages ne sont pas perdus.',
            enable: 'Mon horaire', enableHint: 'Les services pro se taisent hors des heures de travail, les services perso pendant celles-ci. Ni pop-up ni son ; les compteurs continuent.',
            days: 'Jours travaillés', hours: 'Heures', hoursHint: 'Si la fin précède le début, le service passe minuit.',
            servicesTitle: 'Quand notifier', servicesHint: 'Pro — seulement aux heures de travail. Perso — seulement le soir et les jours de repos. Toujours — comme d’habitude.',
            mode_always: 'Toujours', mode_work: 'Pro', mode_personal: 'Perso', mode_alwaysHint: 'Les notifications arrivent toujours', mode_workHint: 'Silencieux hors des heures de travail', mode_personalHint: 'Silencieux pendant les heures de travail',
            d1: 'Lu', d2: 'Ma', d3: 'Me', d4: 'Je', d5: 'Ve', d6: 'Sa', d7: 'Di'
        }
    },
    it: {
        cancel: 'Annulla',
        hib: {
            title: 'Sospensione schede', after: 'Sospendi le schede inutilizzate',
            afterHint: 'Una scheda sospesa non usa memoria e si risveglia all’apertura. L’accesso resta attivo.',
            off: 'Mai', minutes: 'Dopo {n} min', hours: 'Dopo {n} h',
            scope: 'Quali schede', scopeQuiet: 'Senza nuovi messaggi', scopeAll: 'Tutte le schede',
            scopeQuietHint: 'Si sospendono attività, documenti, chat IA e messenger con notifiche disattivate. Messenger e posta continuano a ricevere messaggi.',
            scopeAllHint: 'Si sospendono anche i messenger. Finché una scheda dorme, i suoi messaggi e notifiche non arrivano.',
            never: 'Mai sospese: la scheda aperta, quelle in schermo diviso o in una finestra propria, quelle con non letti o audio e i messenger del team. Per tenerne una sveglia, attiva «Tieni sveglia» nel suo menu (clic destro).',
            keepAwake: 'Tieni sveglia'
        },
        rp: {
            title: 'Punti di ripristino', lead: 'Copie salvate della configurazione',
            leadHint: 'Servizi, cartelle, schermi divisi, risposte rapide e impostazioni. Una copia al giorno e prima di ogni ripristino. PIN, password e chiavi non vengono salvati.',
            saveNow: 'Salva ora', saved: 'Punto salvato.', saveFailed: 'Impossibile salvare il punto.',
            empty: 'Ancora nessun punto. Il primo compare un minuto dopo l’avvio.',
            restore: 'Ripristina', delete: 'Elimina', restoreFailed: 'Impossibile ripristinare questo punto.',
            confirmTitle: 'Ripristinare la configurazione?',
            confirmText: 'Servizi, cartelle, schermi divisi e impostazioni tornano allo stato del {when}. Lo stato attuale viene salvato come altro punto e Centrio si riavvia. Gli accessi ai messenger restano.',
            reason_daily: 'automatico', reason_manual: 'manuale', 'reason_before-restore': 'prima di un ripristino',
            services: 'Servizi: {n}', folders: 'Cartelle: {n}', presets: 'Schermi divisi: {n}', replies: 'Risposte rapide: {n}'
        },
        wh: {
            title: 'Orario di lavoro', teamLine: 'Orario del team: {hours}',
            teamHint: 'Stabilito dal responsabile. Fuori orario i messenger del team non inviano notifiche né suoni. I messaggi non vanno persi.',
            enable: 'Il mio orario', enableHint: 'I servizi di lavoro tacciono fuori orario, quelli personali durante l’orario. Niente pop-up né suoni; i contatori continuano.',
            days: 'Giorni lavorativi', hours: 'Ore', hoursHint: 'Se la fine è prima dell’inizio, il turno supera la mezzanotte.',
            servicesTitle: 'Quando notificare', servicesHint: 'Lavoro — solo in orario di lavoro. Personale — solo la sera e nei giorni liberi. Sempre — come al solito.',
            mode_always: 'Sempre', mode_work: 'Lavoro', mode_personal: 'Personale', mode_alwaysHint: 'Le notifiche arrivano sempre', mode_workHint: 'Silenzioso fuori orario', mode_personalHint: 'Silenzioso in orario di lavoro',
            d1: 'Lu', d2: 'Ma', d3: 'Me', d4: 'Gi', d5: 'Ve', d6: 'Sa', d7: 'Do'
        }
    },
    zh: {
        cancel: '取消',
        hib: {
            title: '标签页休眠', after: '让未使用的标签页休眠',
            afterHint: '休眠的标签页不占内存，打开时自动唤醒，登录状态保留。',
            off: '从不', minutes: '{n} 分钟后', hours: '{n} 小时后',
            scope: '哪些标签页', scopeQuiet: '不会收到新消息的', scopeAll: '全部标签页',
            scopeQuietHint: '任务、文档、AI 对话以及已关闭通知的聊天工具会休眠。聊天工具和邮箱继续接收消息。',
            scopeAllHint: '聊天工具也会休眠。标签页休眠期间不会收到它的消息和通知。',
            never: '以下标签页从不休眠：当前打开的、分屏中或独立窗口中的、有未读或正在播放声音的，以及团队的聊天工具。如需保持唤醒，请在其菜单（右键）中开启“保持唤醒”。',
            keepAwake: '保持唤醒'
        },
        rp: {
            title: '还原点', lead: '已保存的配置副本',
            leadHint: '服务、文件夹、分屏、快捷回复和设置。每天自动保存一次，每次还原前也会保存。不保存 PIN、密码和密钥。',
            saveNow: '立即保存', saved: '已保存还原点。', saveFailed: '无法保存还原点。',
            empty: '还没有还原点。启动一分钟后会出现第一个。',
            restore: '还原', delete: '删除', restoreFailed: '无法还原此还原点。',
            confirmTitle: '还原配置？',
            confirmText: '服务、文件夹、分屏和设置将恢复到 {when} 的状态。当前状态会另存为一个还原点，Centrio 将重新启动。聊天工具的登录不受影响。',
            reason_daily: '自动', reason_manual: '手动', 'reason_before-restore': '还原前',
            services: '{n} 个服务', folders: '{n} 个文件夹', presets: '{n} 个分屏', replies: '{n} 条回复'
        },
        wh: {
            title: '工作时间', teamLine: '团队工作时间：{hours}',
            teamHint: '由管理者设置。非工作时间团队聊天工具不发送通知和声音。消息不会丢失。',
            enable: '我的时间表', enableHint: '工作服务在工作时间外静音，个人服务在工作时间内静音。无弹窗、无声音；未读计数照常。',
            days: '工作日', hours: '时间', hoursHint: '如果结束早于开始，班次跨越午夜。',
            servicesTitle: '何时通知', servicesHint: '工作 — 仅在工作时间。个人 — 仅在晚上和休息日。始终 — 照常。',
            mode_always: '始终', mode_work: '工作', mode_personal: '个人', mode_alwaysHint: '始终接收通知', mode_workHint: '工作时间外静音', mode_personalHint: '工作时间内静音',
            d1: '一', d2: '二', d3: '三', d4: '四', d5: '五', d6: '六', d7: '日'
        }
    }
}

// Morning summary and assistant strings live next door.
const ai = require('./v371-ai')
for (const lang of Object.keys(module.exports)) Object.assign(module.exports[lang], ai[lang] || {})
const qs = require('./v371-qs')
for (const lang of Object.keys(module.exports)) module.exports[lang].qs = qs[lang] || {}
const sx = require('./v371-sx')
for (const lang of Object.keys(module.exports)) module.exports[lang].sx = sx[lang] || {}
