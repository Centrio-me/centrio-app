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
const { FIND_MEDIA_SOURCE, PICK_RESUME_SOURCE, SET_VOLUME_SOURCE, clampVolume } = require('../shared/media-elements')

// 3.7.3: a level set from the popup wins over the page's report for this long (the page may answer late)
const VOLUME_HOLD_MS = 2500
const VOLUME_SEND_MS = 80

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
            ${FIND_MEDIA_SOURCE}
            __centrioFindMedia(document).forEach(function (el) {
                if (!el.paused) { try { el.pause() } catch (e) {} }
            });
        })()`,
        // 3.7.2: shadow roots included (VK Video), and the element to resume is the one already watched, not an ad slot
        // A page's own "play" handler may do nothing when called from outside (VK Video): if nothing plays a moment
        // later, the element itself is started.
        play: `(function(){
            ${FIND_MEDIA_SOURCE}
            var pickResumeTarget = ${PICK_RESUME_SOURCE};
            function startElement() {
                var all = __centrioFindMedia(document);
                for (var i = 0; i < all.length; i++) { if (!all[i].paused) return; }
                var el = pickResumeTarget(all);
                if (el && typeof el.play === 'function') { el.play().catch(function () {}) }
            }
            var handled = false;
            try {
                var a = window.__centrioMediaActions;
                if (a && typeof a.play === 'function') { a.play({ action: 'play' }); handled = true; }
            } catch (e) {}
            if (handled) setTimeout(startElement, 500); else startElement();
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

    // ── 3.7.3: the popup redesigned (variant B, approved by the owner) ──────────────────────────────────────────
    // One card per source: icon, "VK Видео · играет", the title, prev/play/next in a pill, and the source's own
    // volume. Cards are created once and then only updated (the page reports every 2 s): a rebuilt card would
    // drop the slider from under the mouse. Everything that comes from a page (titles) goes in as text only.
    const SVG_NS = 'http://www.w3.org/2000/svg'
    const ICONS = {
        prev: 'M6 5h2v14H6zM20 5v14L9 12z',
        next: 'M16 5h2v14h-2zM4 5l11 7-11 7z',
        play: 'M7 4.5l13 7.5-13 7.5z',
        pause: 'M6 5h4v14H6zM14 5h4v14h-4z',
        close: 'M18 6 6 18M6 6l12 12'
    }
    const t = (key, fallback) => (tGet ? tGet(key) : '') || fallback

    function svgIcon(path, size, stroke) {
        const svg = document.createElementNS(SVG_NS, 'svg')
        svg.setAttribute('width', String(size))
        svg.setAttribute('height', String(size))
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('aria-hidden', 'true')
        const p = document.createElementNS(SVG_NS, 'path')
        p.setAttribute('d', path)
        if (stroke) {
            svg.setAttribute('fill', 'none')
            p.setAttribute('stroke', 'currentColor')
            p.setAttribute('stroke-width', '2.4')
            p.setAttribute('stroke-linecap', 'round')
        } else {
            svg.setAttribute('fill', 'currentColor')
        }
        svg.appendChild(p)
        return svg
    }

    // Speaker with 0, 1 or 2 waves, or crossed out when muted
    function speakerIcon(level, muted) {
        const svg = document.createElementNS(SVG_NS, 'svg')
        svg.setAttribute('width', '16')
        svg.setAttribute('height', '16')
        svg.setAttribute('viewBox', '0 0 24 24')
        svg.setAttribute('fill', 'none')
        svg.setAttribute('stroke', 'currentColor')
        svg.setAttribute('stroke-width', '2')
        svg.setAttribute('stroke-linecap', 'round')
        svg.setAttribute('stroke-linejoin', 'round')
        svg.setAttribute('aria-hidden', 'true')
        const paths = ['M11 5 6 9H3v6h3l5 4z']
        if (muted || level === 0) paths.push('M22 9l-6 6M16 9l6 6')
        else {
            paths.push('M15.5 8.5a5 5 0 0 1 0 7')
            if (level > 0.5) paths.push('M18.5 5.5a9 9 0 0 1 0 13')
        }
        paths.forEach((d) => { const p = document.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); svg.appendChild(p) })
        return svg
    }

    function el(tag, className, text) {
        const node = document.createElement(tag)
        if (className) node.className = className
        if (text != null) node.textContent = text
        return node
    }

    function iconButton(className, path, label) {
        const b = el('button', `mp-btn ${className}`)
        b.type = 'button'
        b.title = label
        b.setAttribute('aria-label', label)
        b.appendChild(svgIcon(path, 14))
        return b
    }

    function webviewOf(id) {
        return document.getElementById(`webview-${id}`)
    }

    function isMuted(id) {
        const wv = webviewOf(id)
        try { return !!(wv && typeof wv.isAudioMuted === 'function' && wv.isAudioMuted()) } catch { return false }
    }

    // Sound on/off for the whole tab (works for every site, also ones that play through Web Audio, like Yandex Music).
    function toggleMute(id) {
        const wv = webviewOf(id)
        if (!wv || typeof wv.setAudioMuted !== 'function') return
        try { wv.setAudioMuted(!isMuted(id)) } catch {}
        renderPopup()
    }

    let volumeTimer = null
    let volumePending = null
    // The page gets the new level at most every 80 ms while the slider moves, and once more when it stops.
    function sendVolume(id, value) {
        volumePending = { id, value }
        if (volumeTimer) return
        volumeTimer = setTimeout(() => {
            volumeTimer = null
            const job = volumePending
            volumePending = null
            if (!job) return
            const wv = webviewOf(job.id)
            if (!wv || typeof wv.executeJavaScript !== 'function') return
            const script = `(function(){ ${FIND_MEDIA_SOURCE} ${SET_VOLUME_SOURCE} return __centrioSetVolume(document, ${JSON.stringify(job.value)}) })()`
            try { wv.executeJavaScript(script, true).catch(() => {}) } catch {}
        }, VOLUME_SEND_MS)
    }

    function setVolume(id, value) {
        const level = clampVolume(value)
        if (level == null) return
        const info = mediaState.get(id)
        if (info) mediaState.set(id, { ...info, volume: level, volumeSetAt: Date.now() })
        // turning the volume up while the tab is muted brings the sound back
        if (level > 0 && isMuted(id)) {
            try { webviewOf(id).setAudioMuted(false) } catch {}
        }
        sendVolume(id, level)
    }

    function createCard(id) {
        const card = el('div', 'mp-card')
        card.dataset.id = id

        const top = el('div', 'mp-top')
        top.title = t('mediaPlayer.openTab', 'Открыть вкладку')
        const icon = el('img', 'mp-icon')
        icon.alt = ''
        icon.width = 34
        icon.height = 34
        icon.addEventListener('error', () => { icon.src = 'assets/logo.png' }, { once: true })
        const text = el('div', 'mp-text')
        const meta = el('div', 'mp-meta')
        const title = el('div', 'mp-title')
        text.append(meta, title)
        const close = el('button', 'mp-close')
        close.type = 'button'
        close.title = t('mediaPlayer.remove', 'Убрать')
        close.setAttribute('aria-label', close.title)
        close.appendChild(svgIcon(ICONS.close, 12, true))
        top.append(icon, text, close)

        const bottom = el('div', 'mp-bottom')
        const pill = el('div', 'mp-pill')
        const prev = iconButton('mp-prev', ICONS.prev, t('mediaPlayer.previous', 'Предыдущий трек'))
        const toggle = iconButton('mp-toggle', ICONS.play, t('mediaPlayer.play', 'Play'))
        const next = iconButton('mp-next', ICONS.next, t('mediaPlayer.next', 'Следующий трек'))
        pill.append(prev, toggle, next)

        const vol = el('div', 'mp-vol')
        const mute = el('button', 'mp-mute')
        mute.type = 'button'
        const range = el('input', 'mp-range')
        range.type = 'range'
        range.min = '0'
        range.max = '100'
        range.step = '1'
        range.setAttribute('aria-label', t('v373.mp.volume', 'Громкость'))
        const pct = el('span', 'mp-pct')
        vol.append(mute, range, pct)
        bottom.append(pill, vol)
        card.append(top, bottom)

        top.addEventListener('click', (e) => {
            if (e.target.closest('.mp-close')) return
            switchTab(id)
            closePopup()
        })
        close.addEventListener('click', (e) => {
            e.stopPropagation()
            mediaState.delete(id)
            renderPopup()
        })
        prev.addEventListener('click', (e) => { e.stopPropagation(); sendCommand(id, 'previous') })
        next.addEventListener('click', (e) => { e.stopPropagation(); sendCommand(id, 'next') })
        toggle.addEventListener('click', (e) => {
            e.stopPropagation()
            sendCommand(id, mediaState.get(id)?.playing ? 'pause' : 'play')
        })
        mute.addEventListener('click', (e) => { e.stopPropagation(); toggleMute(id) })
        range.addEventListener('pointerdown', () => { card.dataset.dragging = '1' })
        range.addEventListener('pointerup', () => { delete card.dataset.dragging })
        // released outside the slider or interrupted: the poll may move it again
        range.addEventListener('pointercancel', () => { delete card.dataset.dragging })
        range.addEventListener('lostpointercapture', () => { delete card.dataset.dragging })
        range.addEventListener('input', () => {
            const level = Number(range.value) / 100
            setVolume(id, level)
            paintLevel(card, level, false)
        })
        range.addEventListener('change', () => { delete card.dataset.dragging })
        // the wheel over the volume nudges it by 5 %
        vol.addEventListener('wheel', (e) => {
            if (range.disabled) return
            e.preventDefault()
            const level = clampVolume(Number(range.value) / 100 + (e.deltaY < 0 ? 0.05 : -0.05))
            range.value = String(Math.round(level * 100))
            setVolume(id, level)
            paintLevel(card, level, false)
        }, { passive: false })
        return card
    }

    function paintLevel(card, level, muted) {
        const range = card.querySelector('.mp-range')
        const pct = Math.round(level * 100)
        if (card.dataset.dragging !== '1') range.value = String(pct)
        range.style.setProperty('--fill', `${muted ? 0 : pct}%`)
        card.querySelector('.mp-pct').textContent = muted ? '0%' : `${pct}%`
        const mute = card.querySelector('.mp-mute')
        mute.textContent = ''
        mute.appendChild(speakerIcon(level, muted))
        const label = muted ? t('v373.mp.unmute', 'Включить звук') : t('v373.mp.mute', 'Выключить звук')
        mute.title = label
        mute.setAttribute('aria-label', label)
        mute.classList.toggle('is-muted', muted)
    }

    function updateCard(card, id, messenger, info) {
        card.classList.toggle('is-playing', !!info.playing)
        const icon = card.querySelector('.mp-icon')
        const src = messenger.icon || 'assets/logo.png'
        if (icon.getAttribute('src') !== src) icon.setAttribute('src', src)
        const state = info.playing ? t('v373.mp.playing', 'играет') : t('v373.mp.paused', 'пауза')
        card.querySelector('.mp-meta').textContent = `${messenger.name} · ${state}`
        const title = info.title && info.title !== messenger.name ? info.title : ''
        const titleEl = card.querySelector('.mp-title')
        titleEl.textContent = title || messenger.name
        titleEl.title = title
        const toggle = card.querySelector('.mp-toggle')
        const label = info.playing ? t('mediaPlayer.pause', 'Пауза') : t('mediaPlayer.play', 'Play')
        toggle.title = label
        toggle.setAttribute('aria-label', label)
        toggle.querySelector('path').setAttribute('d', info.playing ? ICONS.pause : ICONS.play)
        // A site without a <video>/<audio> (Web Audio, e.g. Yandex Music): only on/off works
        const range = card.querySelector('.mp-range')
        range.disabled = info.hasElement === false
        card.querySelector('.mp-vol').title = range.disabled ? t('v373.mp.onlyMute', 'Здесь звук только включается и выключается') : ''
        paintLevel(card, typeof info.volume === 'number' ? info.volume : 1, isMuted(id))
    }

    function renderPopup() {
        const el0 = ensurePopup()
        el0.classList.add('mp-v2')

        let head = el0.querySelector('.mp-head')
        if (!head) {
            el0.textContent = '' // the old layout, if any
            head = el('div', 'mp-head')
            head.append(el('b', '', t('rightbar.mediaPlayer', 'Медиаплеер')), el('span', 'mp-count'))
            el0.appendChild(head)
            el0.appendChild(el('div', 'mp-list'))
        }
        const list = el0.querySelector('.mp-list')
        const ids = trackedIds()
        const count = head.querySelector('.mp-count')
        count.textContent = ids.length ? String(ids.length) : ''
        count.hidden = !ids.length

        let empty = list.querySelector('.mp-empty')
        if (!ids.length && !empty) {
            empty = el('div', 'mp-empty')
            empty.append(el('div', 'mp-empty-title', t('mediaPlayer.nothingPlaying', 'Сейчас ничего не воспроизводится')),
                el('div', 'mp-empty-text', t('v373.mp.emptyHint', 'Включите видео или музыку во вкладке — она появится здесь.')))
            list.appendChild(empty)
        } else if (ids.length && empty) {
            empty.remove()
        }

        const existing = new Map([...list.querySelectorAll('.mp-card')].map((c) => [c.dataset.id, c]))
        ids.forEach((id) => {
            const messenger = getMessenger(id)
            if (!messenger) return
            let card = existing.get(id)
            if (!card) {
                card = createCard(id)
                list.appendChild(card)
            }
            existing.delete(id)
            updateCard(card, id, messenger, mediaState.get(id) || {})
        })
        existing.forEach((card) => card.remove())
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
        //
        // BUGFIX 2 (2026-09-10, "не нужно по-умолчанию все вкладки в медиа
        // показывать. Просто если один раз запустили, то оставлять её там" —
        // live user report): the fix above unconditionally created an entry
        // for the FIRST payload from any tab, including a false one — every
        // webview with a <video>/<audio> element on the page gets an initial
        // "playing:false" poll from startMediaStatePolling on dom-ready even
        // if the user never pressed play, which meant every such tab showed
        // up in the popup regardless of ever actually playing anything. Only
        // start tracking a source once it's genuinely observed playing at
        // least once; a false payload for a source we've never tracked is
        // simply ignored instead of creating a "never played" row.
        const existing = mediaState.get(messengerId)
        if (!existing && !payload.playing) return

        // 3.7.3: each source carries its own volume. While the person moves a slider the page's report would
        // snap it back, so a value set here a moment ago wins over the poll for a short while.
        const reported = clampVolume(payload.volume)
        const recentlySet = existing && existing.volumeSetAt && Date.now() - existing.volumeSetAt < VOLUME_HOLD_MS
        mediaState.set(messengerId, {
            title: typeof payload.title === 'string' ? payload.title : '',
            hasNext: !!payload.hasNext,
            hasPrev: !!payload.hasPrev,
            playing: !!payload.playing,
            hasElement: payload.hasElement !== false,
            volume: recentlySet ? existing.volume : (reported == null ? (existing ? existing.volume : 1) : reported),
            volumeSetAt: recentlySet ? existing.volumeSetAt : 0,
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
