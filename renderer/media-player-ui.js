// FEATURE (2026-08-28, "Добавить индикатор/мини-плеер (иконка плеера с
// переключением между источниками и паузой), который появляется справа под
// задачами/вкладками, когда в любой открытой вкладке играет видео или аудио"
// — live user request).
//
// UPDATE (2026-08-28, тот же день, live user correction — "Включил музыку -
// нигде не появился медиа-плеер. Он должен появляться иконкой в правом
// сайдбаре. При нажатии - всплывает окно с управлением. Под задачами."):
// первая версия рисовала ВСЕГДА-плавающую "плашку" (position:fixed поверх
// контента, top:44px/right:16px) с инлайн-кнопкой паузы и ОТДЕЛЬНЫМ
// маленьким dropdown-списком "остальных источников", открывавшимся по
// отдельной кнопке-стрелке. Пользователь явно поправил на другой паттерн —
// тот же, что уже используют #assistantBtn/#todosBtn: скрытая по умолчанию
// иконка в правом activity-bar (#mediaPlayerBtn, index.html, сразу под
// #todosBtn), которая появляется, только когда где-то реально играет медиа,
// и по клику раскрывает ОДНО всплывающее окно со списком всех играющих
// источников и управлением (а не плашка+отдельный dropdown). Реализовано
// ниже как единая .media-player-popup, без деления на "primary pill" и
// "secondary dropdown" — если играющих источников несколько, все они просто
// строки одного списка.
//
// UPDATE 2 (2026-08-28, третья живая правка — "Инстаграм запускает медиа, а
// вот Яндекс Музыка нет. И нет кнопок управления (Вперед, назад)."):
// детект/данные больше НЕ приходят из webview-preload.js — на используемой
// версии Electron preload-атрибут <webview> вообще не исполняется в
// гостевой странице (см. main/bootstrap/registerAppEvents.js,
// startMediaStatePolling) — main-процесс сам опрашивает страницу через
// executeJavaScript и шлёт готовый {playing, title, hasNext, hasPrev} прямым
// IPC-каналом 'media-state', который слушает webview-tabs-bind.js и
// вызывает onMediaState(messengerId, payload) отсюда же, как и раньше.
// Кнопки "вперёд"/"назад" стали возможны той же правкой: main перехватывает
// navigator.mediaSession.setActionHandler('previoustrack'|'nexttrack', fn) —
// единственный способ вообще узнать/вызвать такой обработчик у произвольной
// веб-страницы — и репортит, зарегистрированы ли они (hasNext/hasPrev),
// показываем кнопки только когда сервис их реально поддерживает.
//
// Команды (пауза/плей/некст/пред) теперь шлются НЕ через webview.send()
// (тоже мёртвый канал — уходил в тот же неисполняемый preload), а через
// <webview>.executeJavaScript(...) прямо из этого модуля — это отдельный,
// рабочий метод самого элемента <webview> в хост-рендерере, не связанный с
// preload-атрибутом вообще.
//
// REDESIGN (2026-09-10, "все равно скачут вверх вниз табы... Нажимаешь
// паузу и вкладка пропадает. Чтобы обратно включить приходится идти и
// руками включать. Наверное нужно сохранять, пока вкладка открыта. И
// добавить крестик, если хочешь убрать из медиаплеера" — live user
// request): the original design (see history above) deleted a source from
// mediaState the instant it paused, which caused two separate problems —
// (1) the row vanished from the popup and the whole list re-sorted/jumped
// around every other source's row, and (2) there was no way to resume from
// the popup at all once paused, since a paused source didn't exist in
// mediaState to click "play" on — the user had to go back into the
// messenger tab itself. Now an entry is created once (`addedAt` fixed at
// that moment, never touched again — this is what keeps ordering stable,
// instead of the old resort-by-updatedAt-on-every-change) and stays until
// EITHER the tab closes (onMessengerRemoved) OR the user explicitly
// dismisses it with the new × button. `playing` is now a per-entry flag
// instead of presence-in-the-Map, so a paused source keeps its row with a
// "Play" button in place of "Pause".
function createMediaPlayerUiApi({ state, tGet, switchTab, mediaPlayerBtn }) {
    const mediaState = new Map() // messengerId -> { title, hasNext, hasPrev, playing, addedAt }
    let popupEl = null
    let popupOpen = false

    function getMessenger(id) {
        return state.activeMessengers.find((m) => m.id === id)
    }

    // Stable insertion order (addedAt never changes after creation) — a
    // source doesn't jump around the list just because it paused/resumed
    // or its track title changed.
    function trackedIds() {
        return [...mediaState.keys()]
            .filter((id) => getMessenger(id))
            .sort((a, b) => mediaState.get(a).addedAt - mediaState.get(b).addedAt)
    }

    // Kept for getPlayingSources() (AI assistant tool) — only sources
    // actually playing right now, unlike trackedIds() which includes
    // paused-but-not-dismissed ones too.
    function playingIds() {
        return trackedIds().filter((id) => mediaState.get(id).playing)
    }

    // Каждый скрипт сначала пробует перехваченный mediaSession-обработчик
    // (единственный способ, работающий для плееров без настоящего
    // <video>/<audio> — например Яндекс Музыка, см. комментарий выше), и
    // только для pause/play подстраховывается прямым вызовом
    // HTMLMediaElement.pause()/play() — на случай простых сервисов вроде
    // Instagram, которые обычного <video> и не патчат mediaSession вообще.
    //
    // BUGFIX (2026-08-28 v3, live retest после фикса userGesture — "Кнопки
    // пуск и переключение - не работают увы"): userGesture:true (см.
    // sendCommand ниже) снял блокировку автоплей-политики, но кнопки всё
    // равно молчали. Причина в другом месте: браузерный MediaSession API
    // всегда вызывает зарегистрированный обработчик с объектом
    // MediaSessionActionDetails, например handler({action:'pause'}), а не
    // без аргументов. Яндекс.Музыка (как и многие другие плееры) читает
    // поле этого объекта (например details.action) сразу в начале своего
    // обработчика — вызов a.pause() совсем без аргумента бросал исключение
    // ("Cannot read properties of undefined") на первой же строке ИХ кода,
    // до того как обработчик успевал дойти до настоящего
    // audioContext.suspend()/resume(). try/catch вокруг вызова тихо гасил
    // эту ошибку, так что снаружи выглядело как "ничего не произошло".
    // Передаём тот же по форме объект, что и настоящий браузер.
    const MEDIA_ACTION_SCRIPTS = {
        pause: `(function(){
            try {
                var a = window.__centrioMediaActions;
                if (a && typeof a.pause === 'function') { a.pause({ action: 'pause' }); }
            } catch (e) {}
            document.querySelectorAll('video, audio').forEach(function (el) {
                if (!el.paused) { try { el.pause() } catch (e) {} }
            });
        })()`,
        play: `(function(){
            try {
                var a = window.__centrioMediaActions;
                if (a && typeof a.play === 'function') { a.play({ action: 'play' }); return; }
            } catch (e) {}
            var el = document.querySelector('video, audio');
            if (el && typeof el.play === 'function') { el.play().catch(function () {}) }
        })()`,
        next: `(function(){
            try {
                var a = window.__centrioMediaActions;
                if (a && typeof a.nexttrack === 'function') a.nexttrack({ action: 'nexttrack' });
            } catch (e) {}
        })()`,
        previous: `(function(){
            try {
                var a = window.__centrioMediaActions;
                if (a && typeof a.previoustrack === 'function') a.previoustrack({ action: 'previoustrack' });
            } catch (e) {}
        })()`
    }

    // BUGFIX (2026-08-28, "кнопки управления не работают. Ни пауза, ни
    // переключение" — live user report): webview.executeJavaScript(code,
    // userGesture) defaults userGesture to false. Yandex Music (Web Audio
    // API, see the long history above) gates play/pause through
    // AudioContext.resume()/suspend(), and Chromium's autoplay policy
    // silently refuses AudioContext.resume() unless the call chain carries
    // real user activation — an injected script without the userGesture
    // flag doesn't count, so the page's own action handler would run but
    // quietly no-op. Passing `true` here marks the injected script as
    // user-initiated, which is exactly what a click on this button is.
    function sendCommand(id, cmd) {
        const webview = document.getElementById(`webview-${id}`)
        const script = MEDIA_ACTION_SCRIPTS[cmd]
        if (!webview || !script || typeof webview.executeJavaScript !== 'function') return
        try { webview.executeJavaScript(script, true).catch(() => {}) } catch {}
    }

    function closePopup() {
        popupOpen = false
        if (popupEl) popupEl.classList.remove('show')
    }

    function ensurePopup() {
        if (popupEl) return popupEl

        popupEl = document.createElement('div')
        popupEl.className = 'media-player-popup'
        document.body.appendChild(popupEl)

        document.addEventListener('click', (e) => {
            if (!popupOpen) return
            if (popupEl.contains(e.target) || (mediaPlayerBtn && mediaPlayerBtn.contains(e.target))) return
            closePopup()
        })
        window.addEventListener('resize', closePopup)

        return popupEl
    }

    function positionPopup() {
        if (!popupEl || !mediaPlayerBtn) return
        const rect = mediaPlayerBtn.getBoundingClientRect()
        popupEl.style.top = `${Math.round(rect.top)}px`
        popupEl.style.right = `${Math.round(window.innerWidth - rect.left + 8)}px`
    }

    function renderPopup() {
        const el = ensurePopup()
        el.innerHTML = ''

        const header = document.createElement('div')
        header.className = 'media-player-popup-header'
        header.textContent = tGet ? tGet('rightbar.mediaPlayer') : 'Медиаплеер'
        el.appendChild(header)

        const ids = trackedIds()
        if (!ids.length) {
            const empty = document.createElement('div')
            empty.className = 'media-player-popup-empty'
            empty.textContent = tGet ? tGet('mediaPlayer.nothingPlaying') : 'Сейчас ничего не воспроизводится'
            el.appendChild(empty)
        }

        ids.forEach((id) => {
            const messenger = getMessenger(id)
            if (!messenger) return
            const info = mediaState.get(id) || {}

            const row = document.createElement('div')
            row.className = 'media-player-popup-item' + (info.playing ? '' : ' paused')
            const subtitle = info.title && info.title !== messenger.name ? info.title : ''
            const prevLabel  = tGet ? tGet('mediaPlayer.previous') : 'Предыдущий трек'
            const pauseLabel = tGet ? tGet('mediaPlayer.pause')    : 'Пауза'
            const playLabel  = tGet ? tGet('mediaPlayer.play')     : 'Play'
            const nextLabel  = tGet ? tGet('mediaPlayer.next')     : 'Следующий трек'
            const removeLabel = tGet ? tGet('mediaPlayer.remove')  : 'Убрать'
            // Play/pause is a single toggle button now (was always "Pause"
            // when a source could only exist while playing).
            const toggleSvg = info.playing
                ? `<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>`
                : `<path d="M6 4l14 8-14 8V4z"/>`
            row.innerHTML = `
                <img src="${messenger.icon || ''}" alt="" width="28" height="28">
                <div class="media-player-popup-info">
                    <span class="media-player-popup-name">${messenger.name}</span>
                    <span class="media-player-popup-title" style="display:${subtitle ? '' : 'none'}">${subtitle}</span>
                </div>
                <div class="media-player-popup-controls">
                    <button type="button" class="media-player-popup-btn media-player-popup-prev" title="${prevLabel}" style="display:${info.hasPrev ? '' : 'none'}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg>
                    </button>
                    <button type="button" class="media-player-popup-btn media-player-popup-toggle" title="${info.playing ? pauseLabel : playLabel}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">${toggleSvg}</svg>
                    </button>
                    <button type="button" class="media-player-popup-btn media-player-popup-next" title="${nextLabel}" style="display:${info.hasNext ? '' : 'none'}">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>
                    </button>
                    <button type="button" class="media-player-popup-btn media-player-popup-remove" title="${removeLabel}">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </div>
            `
            row.addEventListener('click', () => {
                switchTab(id)
                closePopup()
            })
            row.querySelector('.media-player-popup-prev').addEventListener('click', (e) => {
                e.stopPropagation()
                sendCommand(id, 'previous')
            })
            row.querySelector('.media-player-popup-toggle').addEventListener('click', (e) => {
                e.stopPropagation()
                sendCommand(id, info.playing ? 'pause' : 'play')
            })
            row.querySelector('.media-player-popup-next').addEventListener('click', (e) => {
                e.stopPropagation()
                sendCommand(id, 'next')
            })
            row.querySelector('.media-player-popup-remove').addEventListener('click', (e) => {
                e.stopPropagation()
                mediaState.delete(id)
                renderPopup()
            })
            el.appendChild(row)
        })
    }

    function togglePopup() {
        if (popupOpen) {
            closePopup()
            return
        }
        renderPopup()
        positionPopup()
        popupOpen = true
        ensurePopup().classList.add('show')
    }

    // BUGFIX (2026-09-09, "Пусть иконка медиа показывается всегда, просто
    // если ничего не играет — она говорит, что сейчас ничего не включено" —
    // live user request, replacing the earlier "hide when nothing plays"
    // design from the same day): mediaPlayerBtn.style.visibility no longer
    // toggles at all — the button is a permanent fixture under notesBtn now,
    // same as assistantBtn/todosBtn. renderPopup() shows an empty-state
    // message (see above) when nothing is playing instead of the button
    // disappearing.
    function render() {
        if (popupOpen) renderPopup()
    }

    if (mediaPlayerBtn) {
        mediaPlayerBtn.addEventListener('click', (e) => {
            e.stopPropagation()
            togglePopup()
        })
    }

    // Вызывается из webview-tabs-bind.js на каждый 'media-state' —
    // main-процессный опрос конкретной вкладки (см. большой комментарий
    // вверху файла).
    function onMediaState(messengerId, payload) {
        if (!messengerId || !payload) return

        // BUGFIX (2026-09-10, see REDESIGN comment above createMediaPlayerUiApi):
        // a source used to be dropped from mediaState entirely the moment it
        // paused. Now it's kept — `playing` reflects the live state, `addedAt`
        // is only ever set once (first time this id is seen) so the row's
        // position in the list never jumps around on pause/resume/title change.
        const existing = mediaState.get(messengerId)
        mediaState.set(messengerId, {
            title: typeof payload.title === 'string' ? payload.title : '',
            hasNext: !!payload.hasNext,
            hasPrev: !!payload.hasPrev,
            playing: !!payload.playing,
            addedAt: existing ? existing.addedAt : Date.now()
        })

        render()
    }

    // Вкладка закрыта совсем — не ждём отдельного сигнала "не играет".
    function onMessengerRemoved(messengerId) {
        if (mediaState.delete(messengerId)) render()
    }

    // Экспортируется наружу для AI-ассистента (renderer/assistant-tools.js) —
    // тот же список источников/команды, что и попап, просто без UI. sendCommand
    // уже валидирует messengerId/cmd через getMessenger()/MEDIA_ACTION_SCRIPTS,
    // так что произвольная строка от модели просто ничего не сделает.
    function getPlayingSources() {
        return playingIds().map((id) => {
            const messenger = getMessenger(id)
            const info = mediaState.get(id) || {}
            return {
                id,
                name: messenger?.name || id,
                title: info.title || '',
                hasNext: !!info.hasNext,
                hasPrev: !!info.hasPrev
            }
        })
    }

    return {
        onMediaState,
        onMessengerRemoved,
        getPlayingSources,
        sendCommand
    }
}

module.exports = {
    createMediaPlayerUiApi
}
