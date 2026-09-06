// VPN Panel — полный рефактор UI
// UX: список конфигов с выбором → одна кнопка Connect/Disconnect сверху
// Пинг: TCP-замер запускается фоном при открытии панели
// Флаги: локальные SVG из assets/flags (без внешнего CDN)
// Таймер: отображает сколько подключены

// ── Понятные сообщения об ошибках (общие для bindVpnUi и bindVpnSettings) ──
// main-процесс присылает стабильный errorCode (см. errResult в main/ipc/vpn.js)
// вместо технического e.message ("sing-box не запустился за 20 секунд" и т.п.),
// чтобы пользователь видел понятный текст, а не внутреннее имя процесса/детали реализации.
const VPN_ERROR_KEYS = {
  VPN_START_TIMEOUT:          'network.vpnErrTimeout',
  VPN_START_CRASHED:          'network.vpnErrCrashed',
  VPN_NOT_INSTALLED:          'network.vpnErrNotInstalled',
  VPN_INVALID_LINK:           'network.vpnErrInvalidLink',
  VPN_SUBSCRIPTION_HTTP_ONLY: 'network.vpnErrSubHttpOnly',
  VPN_SUBSCRIPTION_EMPTY:     'network.vpnErrSubEmpty'
}
function friendlyVpnError (tGet, result, fallbackKey) {
  const mappedKey = result?.errorCode && VPN_ERROR_KEYS[result.errorCode]
  if (mappedKey) return tGet(mappedKey)
  return result?.error || tGet(fallbackKey || 'network.vpnError')
}

function bindVpnUi ({ invokeIpc, tGet, ipcRenderer, onVpnStatusChange }) {
  const btn   = document.getElementById('vpnBtn')
  const panel = document.getElementById('vpnPanel')
  if (!btn || !panel) return

  // ── Состояние ─────────────────────────────────────────────────────
  let status       = { active: false, port: 7890, name: null, configs: [] }
  let selectedId   = null   // выбранный конфиг в списке
  let pings        = {}     // { [id]: ms | null | 'pending' }
  let connectedAt  = null   // Date.now() при подключении
  let timerIv      = null   // setInterval для таймера
  let subUrl       = null   // сохранённый URL подписки (для обновления списка серверов)

  // ── Экранирование ─────────────────────────────────────────────────
  function esc (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }


  // ── Парсинг флага из имени ────────────────────────────────────────
  // Emoji-флаги = два Regional Indicator Symbol (0x1F1E6–0x1F1FF).
  // Возвращает { emoji, label } — emoji может быть '', если флага нет.
  function splitFlag (raw) {
    const chars = [...(raw || '')]
    if (chars.length >= 2) {
      const c1 = chars[0].codePointAt(0)
      const c2 = chars[1].codePointAt(0)
      if (c1 >= 0x1F1E6 && c1 <= 0x1F1FF && c2 >= 0x1F1E6 && c2 <= 0x1F1FF) {
        return {
          emoji: chars[0] + chars[1],
          label: raw.slice(chars[0].length + chars[1].length).trim() || raw
        }
      }
    }
    return { emoji: '', label: raw }
  }

  // ── Локальный путь к SVG-флагу ────────────────────────────────────
  // Regional Indicator Symbol (0x1F1E6 = 'A') → ISO 3166-1 alpha-2 код,
  // картинки лежат в assets/flags/{code}.svg (пакет flag-icons, офлайн).
  function flagImgUrl (emoji) {
    const chars = [...emoji]
    const code = chars.map(c => String.fromCharCode(c.codePointAt(0) - 0x1F1E6 + 65).toLowerCase()).join('')
    return `assets/flags/${code}.svg`
  }

  // ── HTML имени конфига (флаг-картинка + текст) ───────────────────
  function nameHtml (name) {
    const { emoji, label } = splitFlag(name)
    if (emoji) {
      const url = flagImgUrl(emoji)
      return `<img class="vpn-flag-img" src="${url}" alt="${esc(emoji)}" onerror="this.style.display='none'"><span class="vpn-config-name">${esc(label)}</span>`
    }
    return `<span class="vpn-config-name">${esc(label)}</span>`
  }

  // ── Таймер подключения ────────────────────────────────────────────
  function formatDuration (ms) {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  }

  function startTimer () {
    if (!connectedAt) connectedAt = Date.now()
    if (timerIv) clearInterval(timerIv)
    timerIv = setInterval(() => {
      const el = document.getElementById('vpnTimer')
      if (el && connectedAt) el.textContent = formatDuration(Date.now() - connectedAt)
    }, 1000)
  }

  function stopTimer () {
    if (timerIv) { clearInterval(timerIv); timerIv = null }
    connectedAt = null
  }

  // ── Пинг-бейдж ───────────────────────────────────────────────────
  function pingBadge (id) {
    const p = pings[id]
    if (p === 'pending') return `<span class="vpn-ping vpn-ping-pending">${esc(tGet('network.vpnPinging'))}</span>`
    if (p === null)      return `<span class="vpn-ping vpn-ping-fail">${esc(tGet('network.vpnPingFail'))}</span>`
    if (typeof p === 'number') {
      const cls = p < 100 ? 'good' : p < 250 ? 'ok' : 'bad'
      return `<span class="vpn-ping vpn-ping-${cls}">${esc(tGet('network.vpnPingMs', { ms: p }))}</span>`
    }
    return ''
  }

  // ── Пересортировка строк по пингу ────────────────────────────────
  // Серверы с быстрым пингом — вверх, без отклика (null) — вниз,
  // ещё пингуются/неизвестно — посередине. Сортировка стабильна.
  function pingSortKey (id) {
    const p = pings[id]
    if (typeof p === 'number') return p          // числовой пинг — по возрастанию
    if (p === null)            return 1e9        // нет отклика → в самый низ
    return 5e8                                   // pending / неизвестно → середина
  }

  function reorderConfigRows () {
    const list = panel.querySelector('.vpn-configs-list')
    if (!list) return
    const rows = Array.from(list.querySelectorAll('.vpn-config-item'))
    if (rows.length < 2) return
    rows.sort((a, b) => pingSortKey(a.dataset.id) - pingSortKey(b.dataset.id))
    rows.forEach(r => list.appendChild(r))
  }

  // ── Обновить CSS-класс кнопки VPN в сайдбаре ─────────────────────
  function updateBtn () {
    btn.classList.toggle('vpn-active', !!status.active)
    btn.title = status.active ? `VPN: ${status.name || 'ON'}` : 'VPN'
    // Уведомляем renderer.js о фактическом статусе подключения, чтобы щиты
    // мессенджеров в сайдбаре гасли/загорались синхронно с реальным состоянием VPN,
    // а не только с пользовательским предпочтением "использовать VPN".
    if (typeof onVpnStatusChange === 'function') onVpnStatusChange(!!status.active)
  }

  // ── Найти конфиг по id ────────────────────────────────────────────
  function findConfig (id) {
    return (status.configs || []).find(c => c.id === id) || null
  }

  // ── Автопереключение (отключить → подключить новый) ──────────────
  async function autoSwitch (conf) {
    setStatus(tGet('network.vpnConnecting'), false)
    try {
      await invokeIpc('vpn-disconnect')
      stopTimer()
      const result = await invokeIpc('vpn-connect-saved', conf.link)
      if (result.success) {
        status = result.status
        startTimer()
        setStatus(tGet('network.vpnConnected', { name: status.name || '' }), false)
        updateBtn()
        render()
      } else if (result.needsDownload) {
        showProgress(0, tGet('network.vpnPreparing'))
        await downloadAndConnect(conf.link)
      } else {
        status.active = false
        updateBtn()
        setStatus(friendlyVpnError(tGet, result, 'network.vpnError'), true)
        render()
      }
    } catch (e) {
      setStatus(e.message || tGet('network.vpnError'), true)
    }
  }

  // ── Репинг одного конфига ─────────────────────────────────────────
  function repingOne (id) {
    const conf = (status.configs || []).find(c => c.id === id)
    if (!conf) return
    pings[id] = 'pending'
    // Обновить бейдж сразу (показать "pinging")
    const row = panel.querySelector(`.vpn-config-item[data-id="${id}"]`)
    if (row) {
      const existing = row.querySelector('[class^="vpn-ping"]')
      if (existing) existing.outerHTML = pingBadge(id)
      else {
        const right = row.querySelector('.vpn-config-right')
        if (right) right.insertAdjacentHTML('afterbegin', pingBadge(id))
      }
    }
    invokeIpc('vpn-ping', conf.link).then(res => {
      pings[id] = (res && res.ms !== undefined) ? res.ms : null
      const r2 = panel.querySelector(`.vpn-config-item[data-id="${id}"]`)
      if (r2) {
        const b = r2.querySelector('[class^="vpn-ping"]')
        if (b) b.outerHTML = pingBadge(id)
      }
      reorderConfigRows()
    }).catch(() => { pings[id] = null; reorderConfigRows() })
  }

  // ── Рендер панели ─────────────────────────────────────────────────
  function render () {
    const body = panel.querySelector('.vpn-panel-body')
    if (!body) return

    const configs = status.configs || []

    // Выбранный по умолчанию — активный конфиг (если подключены) или первый
    if (!selectedId || !findConfig(selectedId)) {
      const activeConf = configs.find(c => status.active && c.name === status.name)
      selectedId = activeConf?.id || configs[0]?.id || null
    }

    const selConf  = findConfig(selectedId)
    const isActive = status.active

    // ─── Статусная строка + главная кнопка ───────────────────────
    let topHtml
    if (isActive) {
      const timerStr = connectedAt ? formatDuration(Date.now() - connectedAt) : '00:00'
      topHtml = `
        <div class="vpn-status-block connected">
          <span class="vpn-dot-green"></span>
          <div class="vpn-status-info">
            <span class="vpn-status-label">${nameHtml(status.name || 'VPN')}</span>
            <span class="vpn-status-port">SOCKS5 :${status.port} · <span id="vpnTimer" class="vpn-timer">${timerStr}</span></span>
          </div>
        </div>
        <button class="vpn-main-btn vpn-main-disconnect" id="vpnMainBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <rect x="3" y="3" width="18" height="18" rx="3"/>
          </svg>
          ${esc(tGet('network.vpnDisconnect'))}
        </button>`
    } else if (selConf) {
      topHtml = `
        <div class="vpn-status-block disconnected">
          <span class="vpn-dot-grey"></span>
          <div class="vpn-status-info">
            <span class="vpn-status-label">${nameHtml(selConf.name)}</span>
            <span class="vpn-status-port">${esc(tGet('network.vpnSelectHint'))}</span>
          </div>
        </div>
        <button class="vpn-main-btn vpn-main-connect" id="vpnMainBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <polygon points="5,3 19,12 5,21"/>
          </svg>
          ${esc(tGet('network.vpnConnect'))}
        </button>`
    } else {
      topHtml = `
        <div class="vpn-status-block disconnected">
          <span class="vpn-dot-grey"></span>
          <div class="vpn-status-info">
            <span class="vpn-status-label" style="color:var(--text-muted)">${esc(tGet('network.vpnNoConfigs'))}</span>
          </div>
        </div>`
    }

    // ─── Список конфигов ─────────────────────────────────────────
    let listHtml = ''
    if (configs.length > 0) {
      listHtml = `
        <div class="vpn-section-label">${esc(tGet('network.vpnSaved'))}</div>
        <div class="vpn-configs-list">
          ${configs.map(c => {
            const isSel    = c.id === selectedId
            const isConn   = isActive && c.name === status.name
            return `
              <div class="vpn-config-item ${isSel ? 'selected' : ''} ${isConn ? 'active' : ''}"
                   data-id="${esc(c.id)}" data-link="${esc(c.link)}">
                <div class="vpn-config-label">
                  ${nameHtml(c.name)}
                </div>
                <div class="vpn-config-right">
                  ${pingBadge(c.id)}
                  <button class="vpn-cfg-repingbtn" data-id="${esc(c.id)}" title="${tGet('network.vpnTest') || 'Test'}" style="background:none;border:none;color:rgba(255,255,255,0.25);cursor:pointer;padding:2px 5px;font-size:13px;line-height:1;border-radius:4px;transition:color .15s" onmouseover="this.style.color='rgba(255,255,255,0.65)'" onmouseout="this.style.color='rgba(255,255,255,0.25)'">↻</button>
                  <button class="vpn-cfg-delete" data-id="${esc(c.id)}" title="${esc(tGet('network.vpnDeleteBtn'))}">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>`
          }).join('')}
        </div>`
    }

    // ─── Подписка: показываем источник + кнопка «Обновить список» ──
    let subHtml = ''
    if (subUrl) {
      subHtml = `
        <div class="vpn-sub-row">
          <div class="vpn-sub-info" title="${esc(subUrl)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            <span class="vpn-sub-url">${esc(prettySubUrl(subUrl))}</span>
          </div>
          <button class="vpn-sub-refresh" id="vpnSubRefreshBtn" title="${esc(tGet('network.vpnRefresh'))}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <span>${esc(tGet('network.vpnRefresh'))}</span>
          </button>
        </div>`
    }

    // ─── Кнопка «Добавить» → открывает настройки на вкладке Сеть ──
    const addBtnHtml = `
      <div class="vpn-add-hint">
        <button class="vpn-add-settings-btn" id="vpnAddSettingsBtn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          ${esc(tGet('network.vpnAddLink'))}
        </button>
      </div>`

    body.innerHTML = `
      <div class="vpn-top-section">
        ${topHtml}
      </div>
      ${listHtml}
      ${subHtml}
      ${addBtnHtml}
      <div class="vpn-status-bar" id="vpnStatusBar" style="display:none"></div>
      <div class="vpn-download-area" id="vpnDownloadArea" style="display:none">
        <div class="vpn-download-label">${esc(tGet('network.vpnDownloading'))}</div>
        <div class="vpn-progress-track"><div class="vpn-progress-fill" id="vpnProgressFill"></div></div>
        <div class="vpn-progress-msg" id="vpnProgressMsg"></div>
      </div>`

    // Вешаем обработчики
    document.getElementById('vpnMainBtn')?.addEventListener('click', () => {
      if (isActive) disconnect()
      else if (selConf) connectSaved(selConf.link)
    })

    body.querySelectorAll('.vpn-config-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.vpn-cfg-delete') || e.target.closest('.vpn-cfg-repingbtn')) return
        e.stopPropagation()   // панель не должна закрываться при выборе конфига
        const newId = el.dataset.id
        // Если VPN активен и выбираем другой конфиг — автопереключение
        if (isActive && newId !== selectedId) {
          const newConf = findConfig(newId)
          if (newConf) {
            selectedId = newId
            autoSwitch(newConf)
            return
          }
        }
        selectedId = newId
        render()
      })
    })

    body.querySelectorAll('.vpn-cfg-repingbtn').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        repingOne(b.dataset.id)
      })
    })

    body.querySelectorAll('.vpn-cfg-delete').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation()
        deleteCfg(b.dataset.id)
      })
    })

    // Кнопка «Обновить список» из подписки
    document.getElementById('vpnSubRefreshBtn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      refreshSubscription()
    })

    // Восстановить порядок по пингу после полного ре-рендера
    reorderConfigRows()

    // Кнопка «Добавить» → открывает настройки > Сеть > VPN
    document.getElementById('vpnAddSettingsBtn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      closePanel()
      // Открываем настройки на вкладке Сеть
      const settingsBtn = document.getElementById('settingsBtn')
      settingsBtn?.click()
      setTimeout(() => {
        const networkTab = document.querySelector('.settings-nav-item[data-section="network"]')
        networkTab?.click()
        document.getElementById('settingsVpnInput')?.focus()
      }, 80)
    })
  }

  // ── Подписка: красивое имя из URL + обновление списка серверов ──
  function prettySubUrl (u) {
    try { return new URL(u).host || u } catch { return String(u || '') }
  }

  async function refreshSubscription () {
    const b = document.getElementById('vpnSubRefreshBtn')
    if (b) { b.disabled = true; b.classList.add('vpn-sub-refreshing') }
    setStatus(tGet('network.vpnRefreshing'), false)
    try {
      const result = await invokeIpc('vpn-refresh-subscription')
      if (result.success) {
        status = result.status
        // Сбросить пинги для исчезнувших конфигов; существующие сохраняют id → пинг
        const ids = new Set((status.configs || []).map(c => c.id))
        for (const id in pings) { if (!ids.has(id)) delete pings[id] }
        setStatus(tGet('network.vpnRefreshed', { n: result.imported }), false)
        updateBtn()
        render()
        startPings(status.configs)
      } else {
        setStatus(friendlyVpnError(tGet, result, 'network.vpnError'), true)
        if (b) { b.disabled = false; b.classList.remove('vpn-sub-refreshing') }
      }
    } catch (e) {
      setStatus(e.message || tGet('network.vpnError'), true)
      if (b) { b.disabled = false; b.classList.remove('vpn-sub-refreshing') }
    }
  }

  // ── Статусная строка ──────────────────────────────────────────────
  function setStatus (msg, isError) {
    const bar = document.getElementById('vpnStatusBar')
    if (!bar) return
    bar.textContent   = msg
    bar.style.color   = isError ? '#ef4444' : '#22c55e'
    bar.style.display = msg ? 'block' : 'none'
  }

  function showProgress (percent, msg) {
    const area = document.getElementById('vpnDownloadArea')
    const fill = document.getElementById('vpnProgressFill')
    const pmsg = document.getElementById('vpnProgressMsg')
    if (area) area.style.display = percent >= 0 ? 'block' : 'none'
    if (fill) fill.style.width   = percent + '%'
    if (pmsg) pmsg.textContent   = msg || ''
  }

  // ── Пинг всех конфигов фоном ──────────────────────────────────────
  function startPings (configs) {
    if (!configs || !configs.length) return
    for (const c of configs) {
      if (pings[c.id] !== undefined) continue   // уже pinging/пинговали
      pings[c.id] = 'pending'
      invokeIpc('vpn-ping', c.link).then(res => {
        pings[c.id] = (res && res.ms !== undefined) ? res.ms : null
        // Обновляем только строку конфига (не весь рендер)
        const row = panel.querySelector(`.vpn-config-item[data-id="${c.id}"]`)
        if (row) {
          const badge = row.querySelector('.vpn-ping, [class*="vpn-ping"]')
          if (badge) badge.outerHTML = pingBadge(c.id)
          else {
            const right = row.querySelector('.vpn-config-right')
            if (right) right.insertAdjacentHTML('afterbegin', pingBadge(c.id))
          }
        }
        reorderConfigRows()
      }).catch(() => { pings[c.id] = null; reorderConfigRows() })
    }
  }

  // ── Импорт ────────────────────────────────────────────────────────
  async function importAndConnect () {
    const input = document.getElementById('vpnLinkInput')
    const link  = input?.value?.trim()
    if (!link) return

    const btn = document.getElementById('vpnImportBtn')
    if (btn) btn.disabled = true
    setStatus(tGet('network.vpnConnecting'), false)

    try {
      const result = await invokeIpc('vpn-connect', link)
      if (result.success) {
        status = result.status
        if (/^https?:\/\//.test(link)) subUrl = link
        startTimer()
        if (input) input.value = ''
        // Сбросить пинги для новых конфигов
        const newIds = new Set((result.status.configs || []).map(c => c.id))
        for (const id in pings) { if (!newIds.has(id)) delete pings[id] }

        const msg = result.imported > 1
          ? tGet('network.vpnImported', { n: result.imported, name: status.name || '' })
          : tGet('network.vpnConnected', { name: status.name || '' })
        setStatus(msg, false)
        if (btn) btn.disabled = false
        updateBtn()
        render()
        startPings(status.configs)
      } else if (result.needsDownload) {
        setStatus('', false)
        showProgress(0, tGet('network.vpnPreparing'))
        await downloadAndConnect(link)
      } else {
        setStatus(friendlyVpnError(tGet, result, 'network.vpnError'), true)
        if (btn) btn.disabled = false
      }
    } catch (e) {
      setStatus(e.message || tGet('network.vpnError'), true)
      if (btn) btn.disabled = false
    }
  }

  async function downloadAndConnect (link) {
    const onProgress = (p) => showProgress(p.percent, p.msg)
    window.electronAPI?.onVpnProgress?.(onProgress)
    try {
      const result = await invokeIpc('vpn-download-and-connect', link)
      showProgress(-1, '')
      window.electronAPI?.offVpnProgress?.()
      if (result.success) {
        status = result.status
        startTimer()
        setStatus(tGet('network.vpnConnected', { name: status.name || '' }), false)
        const btn = document.getElementById('vpnImportBtn')
        if (btn) btn.disabled = false
        updateBtn()
        render()
        startPings(status.configs)
      } else {
        setStatus(friendlyVpnError(tGet, result, 'network.vpnDownloadError'), true)
        const btn = document.getElementById('vpnImportBtn')
        if (btn) btn.disabled = false
      }
    } catch (e) {
      showProgress(-1, '')
      window.electronAPI?.offVpnProgress?.()
      setStatus(e.message || tGet('network.vpnError'), true)
      const btn = document.getElementById('vpnImportBtn')
      if (btn) btn.disabled = false
    }
  }

  // ── Подключить конфиг ─────────────────────────────────────────────
  async function connectSaved (link) {
    if (!link) return
    setStatus(tGet('network.vpnConnecting'), false)
    try {
      const result = await invokeIpc('vpn-connect-saved', link)
      if (result.success) {
        status = result.status
        startTimer()
        setStatus(tGet('network.vpnConnected', { name: status.name || '' }), false)
        updateBtn()
        render()
      } else if (result.needsDownload) {
        showProgress(0, tGet('network.vpnPreparing'))
        await downloadAndConnect(link)
      } else {
        setStatus(friendlyVpnError(tGet, result, 'network.vpnError'), true)
      }
    } catch (e) {
      setStatus(e.message || tGet('network.vpnError'), true)
    }
  }

  // ── Отключить ─────────────────────────────────────────────────────
  async function disconnect () {
    setStatus(tGet('network.vpnDisconnecting'), false)
    try {
      const result = await invokeIpc('vpn-disconnect')
      if (result.success) {
        status = result.status
        stopTimer()
        setStatus('', false)
        updateBtn()
        render()
      }
    } catch (e) {
      setStatus(e.message || tGet('network.vpnError'), true)
    }
  }

  // ── Удалить конфиг ────────────────────────────────────────────────
  async function deleteCfg (id) {
    try {
      const result = await invokeIpc('vpn-delete-config', id)
      if (result.success) {
        status.configs = result.configs
        delete pings[id]
        if (selectedId === id) selectedId = result.configs[0]?.id || null
        render()
      }
    } catch {}
  }

  // ── Открыть/закрыть панель ────────────────────────────────────────
  async function openPanel () {
    document.dispatchEvent(new CustomEvent('close-all-popups'))

    try {
      // vpn-status тихо восстанавливает соединение если было активно
      const s = await invokeIpc('vpn-status')
      status = s
      updateBtn()
      // Если VPN уже активен — запустить таймер (если ещё не тикает)
      if (status.active && !timerIv) startTimer()
      // Подтягиваем сохранённый URL подписки (для кнопки «Обновить»)
      try { const sub = await invokeIpc('vpn-get-subscription'); subUrl = sub?.url || null } catch {}
    } catch {}

    render()

    const rect = btn.getBoundingClientRect()
    panel.style.display = 'flex'
    panel.style.left    = `${rect.right + 14}px`
    panel.style.top     = '0px'

    requestAnimationFrame(() => {
      const pRect = panel.getBoundingClientRect()
      let top = rect.bottom - pRect.height
      if (top < 12) top = 12
      if (top + pRect.height > window.innerHeight - 12) top = window.innerHeight - pRect.height - 12
      panel.style.top = `${Math.max(12, top)}px`
    })

    document.dispatchEvent(new CustomEvent('popup-opened'))

    // Запускаем пинг фоном (только новые конфиги)
    startPings(status.configs)
  }

  function closePanel () {
    panel.style.display = 'none'
  }

  document.addEventListener('close-all-popups', closePanel)

  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (panel.style.display === 'none' || !panel.style.display) openPanel()
    else closePanel()
  })

  document.addEventListener('click', (e) => {
    if (panel.style.display === 'none') return
    // composedPath() захватывает путь в момент диспатча — безопасен даже если render()
    // удалил e.target из DOM (panel.contains() вернул бы false для удалённых элементов).
    const path = e.composedPath ? e.composedPath() : [e.target]
    if (!path.includes(panel) && !path.includes(btn)) closePanel()
  })

  // Инициализация статуса при запуске (тихое восстановление)
  invokeIpc('vpn-status').then(s => { status = s; updateBtn() }).catch(() => {})

  // BUGFIX ("VPN-щиты/кнопка не обновляются после авто-восстановления"):
  // main/window.js подключает VPN асинхронно, спустя ~3 сек после загрузки
  // окна (_tryRestoreVpn), и шлёт 'vpn-restored' по завершении — но здесь
  // этот канал никогда не слушался. Единственный статус, который видел
  // рендерер, — это самый первый vpn-status выше, снятый ДО того, как
  // авто-восстановление вообще началось (VPN тогда ещё не активен), так что
  // кнопка/щиты в сайдбаре навсегда застревали в состоянии "выключено", пока
  // пользователь вручную не открывал панель VPN.
  ipcRenderer?.on('vpn-restored', (s) => { status = s || status; updateBtn() })
}

// ── Инициализация VPN-секции в настройках ────────────────────────────────
// Рендерит список конфигов, обрабатывает textarea импорта
function bindVpnSettings ({ invokeIpc, tGet, applyI18n, getActiveMessengers, onAppVpnModeChange }) {
  const listEl   = document.getElementById('settingsVpnList')
  const input    = document.getElementById('settingsVpnInput')
  const importBtn= document.getElementById('settingsVpnImportBtn')
  const statusEl = document.getElementById('settingsVpnStatus')
  if (!listEl || !importBtn) return

  function esc (s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function setStatus (msg, isError) {
    if (!statusEl) return
    statusEl.textContent   = msg
    statusEl.style.color   = isError ? '#ef4444' : '#22c55e'
    statusEl.style.display = msg ? 'block' : 'none'
  }

  // Разбор флага из имени (дублируем логику для этого контекста)
  function splitFlag (raw) {
    const chars = [...(raw || '')]
    if (chars.length >= 2) {
      const c1 = chars[0].codePointAt(0), c2 = chars[1].codePointAt(0)
      if (c1 >= 0x1F1E6 && c1 <= 0x1F1FF && c2 >= 0x1F1E6 && c2 <= 0x1F1FF) {
        return { emoji: chars[0]+chars[1], label: raw.slice(chars[0].length+chars[1].length).trim() || raw }
      }
    }
    return { emoji: '', label: raw }
  }

  function flagImgUrl (emoji) {
    const c = [...emoji]
    const code = c.map(ch => String.fromCharCode(ch.codePointAt(0) - 0x1F1E6 + 65).toLowerCase()).join('')
    return `assets/flags/${code}.svg`
  }

  function renderList (configs) {
    if (!configs || !configs.length) {
      listEl.innerHTML = `<div class="settings-vpn-empty">${esc(tGet('network.vpnNoConfigs'))}</div>`
      return
    }
    listEl.innerHTML = configs.map(c => {
      const { emoji, label } = splitFlag(c.name)
      const flagHtml = emoji
        ? `<img class="vpn-flag-img" src="${flagImgUrl(emoji)}" alt="${esc(emoji)}" onerror="this.style.display='none'">`
        : ''
      return `
        <div class="settings-vpn-item">
          <span class="settings-vpn-name">${flagHtml}${esc(label)}</span>
          <button class="settings-vpn-delete" data-id="${esc(c.id)}" title="${esc(tGet('network.vpnDeleteBtn'))}">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>`
    }).join('')

    listEl.querySelectorAll('.settings-vpn-delete').forEach(b => {
      b.addEventListener('click', async () => {
        const result = await invokeIpc('vpn-delete-config', b.dataset.id).catch(() => null)
        if (result?.success) renderList(result.configs)
      })
    })
  }

  // ── Список приложений с VPN-галочками ────────────────────────────
  async function refreshAppsList () {
    const appsListEl = document.getElementById('settingsVpnAppsList')
    if (!appsListEl) return

    const messengers = getActiveMessengers ? getActiveMessengers() : []
    const modesResult = await invokeIpc('vpn-get-app-modes').catch(() => ({ modes: {} }))
    const modes = modesResult?.modes || {}

    if (!messengers.length) {
      appsListEl.innerHTML = `<div class="settings-vpn-empty" style="padding:8px 0;">${esc(tGet('network.vpnAppsEmpty'))}</div>`
      return
    }

    appsListEl.innerHTML = messengers.map(m => {
      const enabled = modes[m.id] !== false
      return `
        <div class="settings-vpn-app-row">
          <span class="settings-vpn-app-name">${esc(m.name)}</span>
          <label class="toggle" title="${esc(tGet(enabled ? 'network.vpnCtx' : 'network.vpnCtxDisable'))}">
            <input type="checkbox" class="vpn-app-toggle" data-id="${esc(m.id)}" ${enabled ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </div>`
    }).join('')

    appsListEl.querySelectorAll('.vpn-app-toggle').forEach(cb => {
      cb.addEventListener('change', async () => {
        const result = await invokeIpc('vpn-set-app-vpn', cb.dataset.id, cb.checked).catch(() => null)
        // Синхронизируем щит в сайдбаре сразу, не дожидаясь следующего открытия настроек/панели VPN.
        if (result?.success !== false && typeof onAppVpnModeChange === 'function') {
          onAppVpnModeChange(cb.dataset.id, cb.checked)
        }
      })
    })
  }

  // Загрузить статус при открытии настроек
  async function refresh () {
    const st = await invokeIpc('vpn-status').catch(() => ({ configs: [] }))
    renderList(st.configs || [])
    refreshAppsList()
    applyI18n(listEl.parentElement)
  }

  async function doImport () {
    const link = input?.value?.trim()
    if (!link) return
    importBtn.disabled = true
    setStatus(tGet('network.vpnConnecting'), false)

    try {
      let result = await invokeIpc('vpn-connect', link)

      if (result.needsDownload) {
        setStatus(tGet('network.vpnDownloading'), false)
        result = await invokeIpc('vpn-download-and-connect', link)
      }

      if (result.success) {
        if (input) input.value = ''
        const msg = result.imported > 1
          ? tGet('network.vpnImported', { n: result.imported, name: result.status?.name || '' })
          : tGet('network.vpnConnected', { name: result.status?.name || '' })
        setStatus(msg, false)
        renderList(result.status?.configs || [])
        // Обновить кнопку VPN в сайдбаре
        const vpnBtn = document.getElementById('vpnBtn')
        if (vpnBtn && result.status?.active) vpnBtn.classList.add('vpn-active')
      } else {
        setStatus(friendlyVpnError(tGet, result, 'network.vpnError'), true)
      }
    } catch (e) {
      setStatus(e.message || tGet('network.vpnError'), true)
    } finally {
      importBtn.disabled = false
    }
  }

  importBtn.addEventListener('click', doImport)
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) doImport()
  })

  // Обновляем список при открытии настроек
  document.getElementById('settingsBtn')?.addEventListener('click', refresh)
  // Также при клике на вкладку Сеть
  document.querySelector('.settings-nav-item[data-section="network"]')?.addEventListener('click', refresh)

  // Инициальная загрузка
  refresh()
}

module.exports = { bindVpnUi, bindVpnSettings }
