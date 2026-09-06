// REDESIGN (2026-08-24, "Полностью переработай окно выбора нового мессенджера
// с плюсика ... Новый дизайн, больше значков, другая анимация, другая
// прокрутка" — live user request, explicit dislike of the old design).
//
// Что было: сетка 4×2 (8 плиток), листалась ЦЕЛЫМИ СТРАНИЦАМИ по колесу
// мыши (e.preventDefault() перехватывал wheel целиком) + точки-пагинатор
// сбоку — нестандартная и заметно "дёрганная" прокрутка, из 43 сервисов
// одновременно видно было только 8.
//
// Что стало: один непрерывный нативный скролл (никакого preventDefault на
// wheel — колесо мыши работает как везде), все сервисы сгруппированы под
// заголовками секций (см. CATEGORY_ORDER, значения приходят из
// messenger.category в renderer/constants.js), плитки при открытии модалки
// появляются с лёгкой ступенчатой (staggered) анимацией, при наведении
// подсвечиваются РЕАЛЬНЫМ фирменным цветом сервиса (messenger.color) —
// а не одним общим акцентом на всё подряд. Тонкая шкала прогресса прокрутки
// над сеткой — сигнатурный элемент, показывает, сколько ещё сервисов ниже.
// UPDATE (2026-08-28, "Добавить категорию Медиа" — live user request):
// новая категория 'media' (YouTube/Spotify/Яндекс Музыка/кинотеатры и т.д.,
// см. renderer/constants.js) добавлена в конец порядка — после 'ai', перед
// секциями без явного порядка (см. orderedKeys fallback в fillMessengerGrid).
// UPDATE (2026-09-01, "добавь категорию Видеозвонки" — live user request):
// новая категория 'calls' (Яндекс Телемост/Zoom/Google Meet/Teams и т.д.) —
// после 'media', та же логика, что и у медиа-апдейта выше.
const CATEGORY_ORDER = ['top', 'messengers', 'mail', 'productivity', 'ai', 'media', 'calls']
const CATEGORY_LABEL_KEYS = {
    // 'top' переиспользует уже существующий (ранее нигде не подключённый)
    // ключ modal.popular — не заводим дублирующий по смыслу текст.
    top: 'modal.popular',
    messengers: 'modal.categories.messengers',
    mail: 'modal.categories.mail',
    productivity: 'modal.categories.productivity',
    ai: 'modal.categories.ai',
    media: 'modal.categories.media',
    calls: 'modal.categories.calls'
}
// Максимальная задержка ступенчатой анимации — дальше плитки просто не ждут
// своей очереди (иначе при 43 элементах последняя плитка появлялась бы почти
// секунду спустя после открытия модалки, что выглядело бы как лаг, а не как
// анимация).
const STAGGER_STEP_MS = 14
const STAGGER_MAX_MS = 240

function createAddModalUiApi({
    state,
    popularMessengers,
    syntaxAiPromo,
    addModal,
    messengerGrid,
    addMessenger,
    tGet
}) {
    const prefersReducedMotion = typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    function buildTile(messenger, globalIndex) {
        const item = document.createElement('div')
        item.className = 'messenger-grid-item'
        if (!prefersReducedMotion) {
            item.style.animationDelay = `${Math.min(globalIndex * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`
        } else {
            item.classList.add('no-stagger')
        }
        if (messenger.color) {
            item.style.setProperty('--tile-glow', messenger.color)
        }

        const hostname = (() => {
            try { return new URL(messenger.url).hostname } catch { return '' }
        })()

        item.innerHTML = `
            <img src="${messenger.icon}"
                 onerror="this.src='https://www.google.com/s2/favicons?domain=${hostname}&sz=64'"
                 alt="${messenger.name}" loading="lazy">
            <span>${messenger.name}</span>
        `

        item.addEventListener('click', () => {
            addMessenger(messenger)
            closeModal()
        })

        return item
    }

    // FEATURE (2026-08-28, "Добавь ссылку на Синтакс в нейросети (в самый
    // перёд)... Нужно 2 квадратика объеденить в одну ссылку" — live user
    // request): реферальная промо-плитка SyntaxAI. Занимает место двух
    // обычных квадратов сетки (grid-column: span 2 в CSS,
    // .messenger-grid-item--promo) и показывает свой собственный промо-текст
    // поверх иконки — этим отличается от обычной плитки buildTile() и
    // поэтому рисуется отдельной функцией.
    // UPDATE (2026-08-28, тот же день, live user correction — "это
    // мессенджер. Он должен создавать вкладку с иконкой... Чтобы люди сразу
    // регались там"): по клику ЭТО обычное добавление мессенджера — та же
    // addMessenger(), что использует buildTile() ниже — а не открытие
    // реферальной ссылки во внешнем браузере (так было в первой версии, но
    // пользователь явно поправил: регистрация должна проходить прямо в
    // Centrio, в собственном webview этой вкладки).
    function buildSyntaxAiBanner(globalIndex) {
        const item = document.createElement('div')
        item.className = 'messenger-grid-item messenger-grid-item--promo'
        if (!prefersReducedMotion) {
            item.style.animationDelay = `${Math.min(globalIndex * STAGGER_STEP_MS, STAGGER_MAX_MS)}ms`
        } else {
            item.classList.add('no-stagger')
        }
        if (syntaxAiPromo.color) {
            item.style.setProperty('--tile-glow', syntaxAiPromo.color)
        }

        const title = tGet ? tGet('modal.syntaxPromo.title') : 'SyntaxAI'
        const subtitle = tGet ? tGet('modal.syntaxPromo.subtitle') : ''

        item.innerHTML = `
            <img class="messenger-grid-item-promo-icon" src="${syntaxAiPromo.icon}" alt="${syntaxAiPromo.name}" loading="lazy">
            <div class="messenger-grid-item-promo-text">
                <strong>${title}</strong>
                <span>${subtitle}</span>
            </div>
        `

        item.addEventListener('click', () => {
            addMessenger(syntaxAiPromo)
            closeModal()
        })

        return item
    }

    function buildEmptyState() {
        const empty = document.createElement('div')
        empty.className = 'modal-grid-empty'
        empty.innerHTML = `
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span>${tGet ? tGet('search.empty') : ''}</span>
        `
        return empty
    }

    function fillMessengerGrid() {
        messengerGrid.innerHTML = ''

        const list = state.modalFiltered
        if (!list.length) {
            messengerGrid.appendChild(buildEmptyState())
            updateScrollProgress()
            return
        }

        // UPDATE (2026-08-28, "Популярные месседжеры должны отображаться также
        // в своих тематических категориях" — live user request): раньше 'top'
        // было самостоятельной category — эти 8 пунктов показывались ТОЛЬКО в
        // разделе "Популярные" и пропадали из своей реальной темы. Теперь
        // constants.js проставляет каждому пункту его реальную category и
        // ОТДЕЛЬНО помечает те же 8 пунктов булевым полем popular: true.
        // Секция "Популярные" теперь — отдельная выборка по этому флагу,
        // рендерится первой (под тем же ключом 'top', чтобы не трогать
        // CATEGORY_LABEL_KEYS/CATEGORY_ORDER), а помеченные пункты
        // одновременно попадают и в свою обычную тематическую секцию ниже —
        // осознанное дублирование, а не баг.
        const popularItems = list.filter((m) => m.popular)

        const byCategory = new Map()
        list.forEach((m) => {
            const key = m.category || 'messengers'
            if (!byCategory.has(key)) byCategory.set(key, [])
            byCategory.get(key).push(m)
        })

        // Категории, не встречающиеся в CATEGORY_ORDER (на будущее, если кто-то
        // забудет проставить category в constants.js), дорисовываем в конце —
        // чтобы новый сервис молча не пропал из пикера.
        const orderedKeys = [
            ...(popularItems.length ? ['top'] : []),
            ...CATEGORY_ORDER.filter((k) => k !== 'top' && byCategory.has(k)),
            ...[...byCategory.keys()].filter((k) => k !== 'top' && !CATEGORY_ORDER.includes(k))
        ]

        let globalIndex = 0
        orderedKeys.forEach((key) => {
            // FIX (2026-08-28, live user request — "Большой Syntx оставляем тут,
            // маленький тут убираем. В популярных маленький остается."): в
            // категории 'ai' обычный тайл SYNTAX дублировал уже показанный
            // выше widescreen-баннер syntaxAiPromo (тот же реферальный url) —
            // визуально два SYNTAX подряд. Убираем обычный тайл ТОЛЬКО из
            // секции 'ai' (баннер и так его представляет), но оставляем в
            // "Популярные" (popularItems ниже строится из полного списка вне
            // зависимости от этого фильтра) — как и просили.
            const items =
                key === 'top'
                    ? popularItems
                    : key === 'ai' && syntaxAiPromo
                      ? byCategory.get(key).filter((m) => m.url !== syntaxAiPromo.url)
                      : byCategory.get(key)
            const section = document.createElement('div')
            section.className = 'modal-category'

            const header = document.createElement('div')
            header.className = 'modal-category-header'
            const labelKey = CATEGORY_LABEL_KEYS[key]
            header.innerHTML = `
                <span class="modal-category-label">${labelKey && tGet ? tGet(labelKey) : key}</span>
                <span class="modal-category-count">${items.length}</span>
            `
            section.appendChild(header)

            const grid = document.createElement('div')
            grid.className = 'messenger-grid'

            // Промо-плитка SyntaxAI — только в категории "Нейросети", самой
            // первой (см. buildSyntaxAiBanner() выше), и только если
            // syntaxAiPromo реально передан (defensive — не должно ронять
            // модалку, если конфигурация когда-нибудь поменяется).
            if (key === 'ai' && syntaxAiPromo) {
                grid.appendChild(buildSyntaxAiBanner(globalIndex))
                globalIndex++
            }

            items.forEach((messenger) => {
                grid.appendChild(buildTile(messenger, globalIndex))
                globalIndex++
            })
            section.appendChild(grid)

            messengerGrid.appendChild(section)
        })

        updateScrollProgress()
    }

    // Тонкая шкала прогресса прокрутки под поиском — сигнатурный элемент
    // редизайна: замена точек-пагинатора наглядным индикатором "сколько ещё
    // сервисов ниже", без прерывания нативного скролла.
    function updateScrollProgress() {
        const wrap = document.getElementById('modalGridWrap')
        const bar = document.getElementById('modalScrollProgressBar')
        if (!wrap || !bar) return
        const scrollable = wrap.scrollHeight - wrap.clientHeight
        const ratio = scrollable > 0 ? Math.min(1, wrap.scrollTop / scrollable) : 1
        bar.style.width = `${Math.max(6, ratio * 100)}%`
    }

    function openModal() {
        state.modalFiltered = [...popularMessengers]
        addModal.classList.add('show')
        fillMessengerGrid()
        document.getElementById('modalSearchInput').value = ''
        document.getElementById('customSection').classList.remove('open')
        const wrap = document.getElementById('modalGridWrap')
        if (wrap) wrap.scrollTop = 0
        setTimeout(() => document.getElementById('modalSearchInput').focus(), 100)
    }

    function closeModal() {
        addModal.classList.remove('show')
    }

    return {
        fillMessengerGrid,
        updateScrollProgress,
        openModal,
        closeModal
    }
}

module.exports = {
    createAddModalUiApi
}
