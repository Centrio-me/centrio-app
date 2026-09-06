// VPN Manager — main process
// Управляет sing-box как прокси-процессом.
// Поддерживает vmess://, vless://, trojan://, ss://, hysteria2://, https:// (подписка)

const { app, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const https = require('https')
const http  = require('http')
const net   = require('net')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')
const store = require('./main/services/store')
const { encryptValue, decryptValue } = require('./main/services/secureStore')
const PROXY_PORT = 7890   // local SOCKS5 port sing-box будет слушать
const SING_BOX_VERSION = '1.11.4'

// sing-box не публикует checksums.txt/подписи для релиза, поэтому хэши
// пинуются вручную (посчитаны из официальных ассетов GitHub-релиза v1.11.4).
// Защищает от подмены бинарника при компрометации CDN/mirror или MITM.
const SING_BOX_CHECKSUMS = {
  'sing-box-1.11.4-windows-amd64.zip':  '8a681dbd6fa84f03d41e9e8637a8ff4df3d1d209556585ebf004b48325f9d70e',
  'sing-box-1.11.4-darwin-amd64.tar.gz': 'ba5ee4d4630b6cb36c24f0f33d7f9b790b185eceebc74818ca6ff1283bd5e94b',
  'sing-box-1.11.4-darwin-arm64.tar.gz': 'f4349633befd75c972a5a958cbfb6236a1e20b585425ae7c3ec73e5fa29217c5',
  'sing-box-1.11.4-linux-amd64.tar.gz':  '0bb762ef286b36c2016d9107fc1f089be7a75f6d579b33f067d31e696c05927e'
}

function verifyChecksum (filePath, filename) {
  const expected = SING_BOX_CHECKSUMS[filename]
  if (!expected) throw new Error(`Нет доверенной контрольной суммы для ${filename} — отменяю установку`)
  const data = fs.readFileSync(filePath)
  const actual = crypto.createHash('sha256').update(data).digest('hex')
  if (actual !== expected) {
    throw new Error(`Контрольная сумма sing-box не совпадает (ожидалось ${expected}, получено ${actual}) — файл мог быть подменён`)
  }
}

let singboxProcess = null
let currentConfig  = null  // { name, link, outbound }
let proxyActive    = false

// ── Путь к бинарнику ──────────────────────────────────────────────
function getSingboxPath () {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'singbox')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const bin = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box'
  return path.join(dir, bin)
}

// ── Скачивание sing-box ───────────────────────────────────────────
function downloadSingbox (onProgress) {
  return new Promise((resolve, reject) => {
    const binPath = getSingboxPath()
    if (fs.existsSync(binPath)) { resolve(binPath); return }

    const ver = SING_BOX_VERSION
    let filename, extractDir

    if (process.platform === 'win32') {
      filename   = `sing-box-${ver}-windows-amd64.zip`
      extractDir = 'win32'
    } else if (process.platform === 'darwin') {
      const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
      filename   = `sing-box-${ver}-darwin-${arch}.tar.gz`
      extractDir = 'darwin'
    } else {
      filename   = `sing-box-${ver}-linux-amd64.tar.gz`
      extractDir = 'linux'
    }

    const url = `https://github.com/SagerNet/sing-box/releases/download/v${ver}/${filename}`
    const tmpFile = path.join(app.getPath('temp'), filename)

    onProgress && onProgress({ stage: 'download', percent: 0, msg: 'Скачивание sing-box...' })

    const dlFile = fs.createWriteStream(tmpFile)

    // Без таймаута зависший/недоступный GitHub (частый случай именно в тех
    // сетях, где VPN и нужен) вешал скачивание навсегда — ни ошибки, ни
    // прогресса, пользователь видел просто "VPN не включился" без объяснений.
    // setTimeout здесь — таймаут простоя сокета (сбрасывается любой активностью),
    // а не общий лимit на всё скачивание, поэтому медленный, но живой канал не обрывается.
    const DOWNLOAD_IDLE_TIMEOUT_MS = 20000

    function doGet (urlStr) {
      const mod = urlStr.startsWith('https') ? https : http
      const req = mod.get(urlStr, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location)
          return
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        res.on('data', chunk => {
          received += chunk.length
          dlFile.write(chunk)
          if (total && onProgress) {
            onProgress({ stage: 'download', percent: Math.round(received / total * 80), msg: 'Скачивание...' })
          }
        })
        res.on('end', () => {
          dlFile.end(() => {
            try {
              onProgress && onProgress({ stage: 'verify', percent: 82, msg: 'Проверка целостности...' })
              verifyChecksum(tmpFile, filename)
            } catch (err) {
              fs.unlink(tmpFile, () => {})
              reject(err)
              return
            }
            onProgress && onProgress({ stage: 'extract', percent: 85, msg: 'Распаковка...' })
            extractBinary(tmpFile, binPath, filename).then(() => {
              fs.unlink(tmpFile, () => {})
              if (process.platform !== 'win32') {
                fs.chmodSync(binPath, '755')
              }
              onProgress && onProgress({ stage: 'done', percent: 100, msg: 'Готово' })
              resolve(binPath)
            }).catch(reject)
          })
        })
        res.on('error', reject)
      })
      req.on('error', reject)
      req.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
        req.destroy(new Error('Таймаут скачивания sing-box — сервер не отвечает'))
      })
    }

    doGet(url)
  })
}

function sanitizePath (p) {
  // Resolve and normalise; reject traversal attempts
  const resolved = path.resolve(p)
  if (resolved.includes('..')) throw new Error(`Path traversal rejected: ${p}`)
  return resolved
}

function extractBinary (archivePath, destBin, filename) {
  return new Promise((resolve, reject) => {
    // Validate paths before use to prevent injection
    let safeArchive, safeDestBin
    try {
      safeArchive  = sanitizePath(archivePath)
      safeDestBin  = sanitizePath(destBin)
    } catch (e) {
      return reject(e)
    }

    const destDir = path.dirname(safeDestBin)
    const binName = path.basename(safeDestBin)

    if (filename.endsWith('.zip')) {
      // Windows — используем PowerShell для разархивации
      const tmpOut = sanitizePath(path.join(destDir, '_tmp_extract'))
      if (!fs.existsSync(tmpOut)) fs.mkdirSync(tmpOut, { recursive: true })
      // Pass paths as separate array args (NOT via shell interpolation) to avoid injection
      execFile('powershell', [
        '-NoProfile', '-NonInteractive', '-Command',
        `Expand-Archive -LiteralPath '${safeArchive.replace(/'/g, "''")}' -DestinationPath '${tmpOut.replace(/'/g, "''")}' -Force`
      ], (err) => {
        if (err) { reject(err); return }
        // Ищем sing-box.exe в подпапках
        const found = findFile(tmpOut, binName)
        if (!found) { reject(new Error('sing-box.exe not found in archive')); return }
        fs.copyFileSync(found, destBin)
        fs.rmSync(tmpOut, { recursive: true, force: true })
        resolve()
      })
    } else {
      // macOS / Linux — tar.gz
      const tmpOut = path.join(destDir, '_tmp_extract')
      if (!fs.existsSync(tmpOut)) fs.mkdirSync(tmpOut, { recursive: true })
      execFile('tar', ['-xzf', archivePath, '-C', tmpOut], (err) => {
        if (err) { reject(err); return }
        const found = findFile(tmpOut, 'sing-box')
        if (!found) { reject(new Error('sing-box not found in archive')); return }
        fs.copyFileSync(found, destBin)
        fs.rmSync(tmpOut, { recursive: true, force: true })
        resolve()
      })
    }
  })
}

function findFile (dir, name) {
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    } else if (entry === name) {
      return full
    }
  }
  return null
}

// ── Парсинг VPN ссылок ───────────────────────────────────────────
function parseVpnLink (link) {
  link = link.trim()

  if (link.startsWith('vmess://')) return parseVmess(link)
  if (link.startsWith('vless://')) return parseVless(link)
  if (link.startsWith('trojan://')) return parseTrojan(link)
  if (link.startsWith('ss://'))    return parseShadowsocks(link)
  if (link.startsWith('hysteria2://') || link.startsWith('hy2://')) return parseHysteria2(link)

  const err = new Error('Неизвестный формат ссылки. Поддерживаются: vmess, vless, trojan, ss, hysteria2')
  err.code = 'VPN_INVALID_LINK'
  throw err
}

// TLS-проверка сертификата включена по умолчанию (защита от MITM на туннеле).
// Отключить можно только если сама ссылка это явно просит через query-параметр.
function isInsecureAllowed (params) {
  return params.get('allowInsecure') === '1' || params.get('insecure') === '1'
}

function parseVmess (link) {
  const b64 = link.slice('vmess://'.length)
  const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))
  const name = json.ps || json.add || 'VMess'

  const outbound = {
    type:       'vmess',
    tag:        'proxy',
    server:     json.add,
    server_port: parseInt(json.port, 10),
    uuid:       json.id,
    security:   json.scy || json.type || 'auto',
    alter_id:   parseInt(json.aid || '0', 10),
    transport:  buildTransport(json)
  }
  if (json.tls === 'tls') {
    // Проверка TLS-сертификата включена по умолчанию (защита от MITM на туннеле).
    // Отключить можно только если сама ссылка это явно просит.
    const insecure = json.allowInsecure === true || json.allowInsecure === '1' || json['skip-cert-verify'] === true
    outbound.tls = { enabled: true, server_name: json.sni || json.host || json.add, insecure }
  }
  return { name, outbound }
}

function parseVless (link) {
  const url    = new URL(link)
  const name   = decodeURIComponent(url.hash.slice(1)) || url.hostname
  const params = url.searchParams

  const flow = params.get('flow') || ''
  const outbound = {
    type:        'vless',
    tag:         'proxy',
    server:      url.hostname,
    server_port: parseInt(url.port || '443', 10),
    uuid:        url.username
  }
  if (flow) outbound.flow = flow

  const security  = params.get('security') || ''
  const transport = buildTransportFromParams(params)
  if (transport) outbound.transport = transport

  if (security === 'tls') {
    outbound.tls = {
      enabled:     true,
      server_name: params.get('sni') || url.hostname,
      insecure:    isInsecureAllowed(params)
    }
  } else if (security === 'reality') {
    outbound.tls = {
      enabled:     true,
      server_name: params.get('sni') || url.hostname,
      insecure:    false,
      utls:        { enabled: true, fingerprint: params.get('fp') || 'chrome' },
      reality:     {
        enabled:    true,
        public_key: params.get('pbk') || '',
        short_id:   params.get('sid') ?? ''   // пустая строка допустима — не удалять!
      }
    }
  }

  return { name, outbound }
}

function parseTrojan (link) {
  const url   = new URL(link)
  const name  = decodeURIComponent(url.hash.slice(1)) || url.hostname
  const params = url.searchParams

  const outbound = {
    type:        'trojan',
    tag:         'proxy',
    server:      url.hostname,
    server_port: parseInt(url.port || '443', 10),
    password:    decodeURIComponent(url.username),
    tls:         { enabled: true, server_name: params.get('sni') || url.hostname, insecure: isInsecureAllowed(params) }
  }
  const transport = buildTransportFromParams(params)
  if (transport) outbound.transport = transport

  return { name, outbound }
}

function parseShadowsocks (link) {
  let name = ''
  let rest = link.slice('ss://'.length)

  // Разбиваем имя (после #)
  const hashIdx = rest.lastIndexOf('#')
  if (hashIdx >= 0) { name = decodeURIComponent(rest.slice(hashIdx + 1)); rest = rest.slice(0, hashIdx) }

  let method, password, host, port

  try {
    // Новый формат: ss://method:password@host:port
    if (rest.includes('@')) {
      const atIdx = rest.lastIndexOf('@')
      const userInfo = Buffer.from(rest.slice(0, atIdx), 'base64').toString('utf8')
      const hostInfo = rest.slice(atIdx + 1)
      ;[method, password] = userInfo.split(':')
      const lastColon = hostInfo.lastIndexOf(':')
      host = hostInfo.slice(0, lastColon)
      port = hostInfo.slice(lastColon + 1)
    } else {
      // Старый формат: ss://base64(method:password@host:port)
      const decoded = Buffer.from(rest, 'base64').toString('utf8')
      const match = decoded.match(/^(.+?):(.+)@(.+):(\d+)$/)
      if (!match) throw new Error('bad ss format')
      ;[, method, password, host, port] = match
    }
  } catch (e) {
    const err = new Error('Не удалось разобрать Shadowsocks ссылку')
    err.code = 'VPN_INVALID_LINK'
    throw err
  }

  const outbound = {
    type:        'shadowsocks',
    tag:         'proxy',
    server:      host,
    server_port: parseInt(port, 10),
    method:      method,
    password:    password
  }

  return { name: name || host, outbound }
}

function parseHysteria2 (link) {
  const url   = new URL(link.replace('hy2://', 'hysteria2://'))
  const name  = decodeURIComponent(url.hash.slice(1)) || url.hostname
  const params = url.searchParams

  const outbound = {
    type:        'hysteria2',
    tag:         'proxy',
    server:      url.hostname,
    server_port: parseInt(url.port || '443', 10),
    password:    url.username,
    tls:         { enabled: true, server_name: params.get('sni') || url.hostname, insecure: isInsecureAllowed(params) }
  }
  return { name, outbound }
}

function buildTransport (vmessJson) {
  const net = vmessJson.net || 'tcp'
  if (net === 'ws') {
    return {
      type: 'ws',
      path: vmessJson.path || '/',
      headers: vmessJson.host ? { Host: vmessJson.host } : undefined
    }
  }
  if (net === 'grpc') return { type: 'grpc', service_name: vmessJson.path || '' }
  if (net === 'h2')   return { type: 'http', host: vmessJson.host ? [vmessJson.host] : [], path: vmessJson.path || '/' }
  return undefined
}

function buildTransportFromParams (params) {
  const type = params.get('type') || 'tcp'

  if (type === 'tcp') {
    // TCP — transport не нужен
    return null
  }

  if (type === 'ws') {
    const t = { type: 'ws', path: params.get('path') || '/' }
    const host = params.get('host')
    if (host) t.headers = { Host: host }
    return t
  }

  if (type === 'grpc') {
    return { type: 'grpc', service_name: params.get('serviceName') || params.get('path') || '' }
  }

  if (type === 'h2' || type === 'http') {
    const host = params.get('host')
    return { type: 'http', host: host ? [host] : [], path: params.get('path') || '/' }
  }

  if (type === 'xhttp' || type === 'splithttp') {
    const t = { type: 'xhttp', path: params.get('path') || '/' }
    const mode = params.get('mode')
    if (mode && mode !== 'auto') t.method = mode
    try {
      const extra = params.get('extra')
      if (extra) t.extra = JSON.parse(extra)
    } catch (e) { /* ignore malformed extra */ }
    return t
  }

  if (type === 'httpupgrade') {
    const t = { type: 'httpupgrade', path: params.get('path') || '/' }
    const host = params.get('host')
    if (host) t.host = host
    return t
  }

  return null
}

// ── Подписки (subscription URLs) ─────────────────────────────────
// Принимает http(s):// URL, возвращает [{ parsed, link }]
function fetchSubscription (url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http
    const opts = { headers: { 'User-Agent': 'v2rayN/6.0' } }

    function doGet (urlStr) {
      const m = urlStr.startsWith('https') ? https : http
      m.get(urlStr, opts, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location); return
        }
        let raw = ''
        res.on('data', chunk => { raw += chunk })
        res.on('end', () => {
          let text = raw.trim()
          // Пробуем base64-декодирование
          try {
            const decoded = Buffer.from(text, 'base64').toString('utf8')
            if (decoded.includes('://')) text = decoded
          } catch (e) {}

          const lines = text.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.includes('://'))
          const results = []
          for (const line of lines) {
            // Пропускаем http(s):// — не рекурсируем
            if (line.startsWith('http://') || line.startsWith('https://')) continue
            try {
              const parsed = parseVpnLink(line)
              results.push({ parsed, link: line })
            } catch (e) {
              // Пропускаем нераспознанные строки
            }
          }
          resolve(results)
        })
        res.on('error', reject)
      }).on('error', reject)
    }

    doGet(url)
  })
}

// ── Генерация конфига sing-box ────────────────────────────────────
function buildSingboxConfig (outbound) {
  const outboundClean = JSON.parse(JSON.stringify(outbound))
  // Убираем только null/undefined. Пустые строки НЕ трогаем —
  // short_id: "" в Reality является допустимым значением!
  function clean (obj) {
    if (typeof obj !== 'object' || !obj) return obj
    for (const k of Object.keys(obj)) {
      if (obj[k] === null || obj[k] === undefined) delete obj[k]
      else if (typeof obj[k] === 'object') clean(obj[k])
    }
    return obj
  }
  clean(outboundClean)

  return {
    log: { level: 'info', timestamp: false },
    inbounds: [{
      type: 'mixed',
      tag:  'mixed-in',
      listen: '127.0.0.1',
      listen_port: PROXY_PORT,
      sniff: true
    }],
    outbounds: [
      outboundClean,
      { type: 'direct', tag: 'direct' }
    ],
    route: {
      rules: [],
      final: 'proxy'
    }
  }
}

// ── Проверка: слушает ли порт ─────────────────────────────────────
function checkPortListening (port) {
  return new Promise(resolve => {
    const sock = new net.Socket()
    sock.setTimeout(300)
    sock.on('connect', () => { sock.destroy(); resolve(true) })
    sock.on('error',   () => resolve(false))
    sock.on('timeout', () => { sock.destroy(); resolve(false) })
    sock.connect(port, '127.0.0.1')
  })
}

// ── Запуск / остановка прокси ─────────────────────────────────────
async function startProxy (parsed, onLog) {
  if (singboxProcess) await stopProxy()

  const binPath = getSingboxPath()
  if (!fs.existsSync(binPath)) {
    const err = new Error('sing-box не установлен')
    err.code = 'VPN_NOT_INSTALLED'
    throw err
  }

  const config = buildSingboxConfig(parsed.outbound)
  const cfgPath = path.join(app.getPath('userData'), 'singbox', 'config.json')
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8')

  return new Promise((resolve, reject) => {
    singboxProcess = spawn(binPath, ['run', '-c', cfgPath], {
      detached: false,
      stdio:    ['ignore', 'pipe', 'pipe']
    })

    let started = false

    // Ключевое исправление: таймаут теперь 20с, и есть поллинг порта каждые 300мс.
    // Проблема была в log.level:'warn' — INFO-сообщение "started" не выводилось.
    // Сейчас оба метода работают параллельно: поллинг порта + парсинг логов.
    const timeout = setTimeout(() => {
      if (!started) {
        clearInterval(portPoller)
        const err = new Error('sing-box не запустился за 20 секунд')
        err.code = 'VPN_START_TIMEOUT'
        reject(err)
      }
    }, 20000)

    // Поллинг: как только 7890 начинает принимать соединения — proxying ready
    const portPoller = setInterval(async () => {
      if (started) { clearInterval(portPoller); return }
      const listening = await checkPortListening(PROXY_PORT)
      if (listening && !started) {
        started = true
        clearTimeout(timeout)
        clearInterval(portPoller)
        proxyActive   = true
        currentConfig = parsed
        resolve(PROXY_PORT)
      }
    }, 300)

    function checkLine (line) {
      onLog && onLog(line)
      // Парсим логи как запасной вариант (работает при log.level:'info')
      if (!started && (line.includes('started') || line.includes('inbound') || line.includes('listening'))) {
        started = true
        clearTimeout(timeout)
        clearInterval(portPoller)
        proxyActive   = true
        currentConfig = parsed
        resolve(PROXY_PORT)
      }
      if (!started && (line.includes('panic') || line.includes('fatal'))) {
        clearTimeout(timeout)
        clearInterval(portPoller)
        const err = new Error('sing-box: ' + line.trim())
        err.code = 'VPN_START_CRASHED'
        reject(err)
      }
    }

    singboxProcess.stdout.on('data', d => d.toString().split('\n').forEach(checkLine))
    singboxProcess.stderr.on('data', d => d.toString().split('\n').forEach(checkLine))

    singboxProcess.on('error', (err) => {
      clearTimeout(timeout)
      clearInterval(portPoller)
      if (!started) reject(err)
    })

    singboxProcess.on('close', (code) => {
      clearInterval(portPoller)
      singboxProcess = null
      proxyActive    = false
      currentConfig  = null
      onLog && onLog(`[VPN] sing-box exited with code ${code}`)
    })
  })
}

async function stopProxy () {
  if (singboxProcess) {
    const proc = singboxProcess
    singboxProcess = null  // обнуляем сразу, чтобы close-обработчик не конфликтовал

    // Дожидаемся реального завершения процесса (а не просто отправки сигнала),
    // иначе быстрый reconnect может ударить в ещё занятый порт 7890 и молча
    // не забиндиться — единственный симптом тогда: общий 20-секундный таймаут
    // при следующем connect. Таймаут-страховка на случай, если 'exit' не придёт.
    await new Promise((resolve) => {
      let settled = false
      const finish = () => { if (!settled) { settled = true; resolve() } }
      proc.once('exit', finish)
      setTimeout(finish, 3000)

      try { proc.kill() } catch (_) {}
      // На Windows kill() иногда не убивает дочерние процессы — taskkill /f /t надёжнее
      if (process.platform === 'win32' && proc.pid) {
        const { execFile } = require('child_process')
        execFile('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { stdio: 'ignore' }, () => {})
      }
    })
  }
  proxyActive   = false
  currentConfig = null
}

function getStatus () {
  return {
    active:  proxyActive,
    port:    PROXY_PORT,
    name:    currentConfig?.name || null,
    configs: getSavedConfigs()
  }
}

// ── Сохранённые конфиги ───────────────────────────────────────────
// VPN-ссылки содержат креды (UUID/пароль) в самом URI, поэтому поле
// `link` шифруется через safeStorage (main/services/secureStore.js)
// перед записью в electron-store, а не хранится как есть.
function getSavedConfigs () {
  const raw = store.get('vpnConfigs', [])
  return raw.map(c => ({ ...c, link: decryptValue(c.link) }))
}

function saveConfig (name, link) {
  const raw = store.get('vpnConfigs', [])
  const existing = raw.findIndex(c => decryptValue(c.link) === link)
  if (existing >= 0) {
    raw[existing].name = name
  } else {
    raw.push({ id: Date.now().toString(), name, link: encryptValue(link) })
  }
  store.set('vpnConfigs', raw)
  return getSavedConfigs()
}

function deleteConfig (id) {
  const raw = store.get('vpnConfigs', []).filter(c => c.id !== id)
  store.set('vpnConfigs', raw)
  return getSavedConfigs()
}

// ── Пинг — TCP-соединение до хоста VPN-сервера ───────────────────
// Возвращает задержку в мс или null если недоступен
function pingServer (host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const start  = Date.now()
    const socket = new net.Socket()
    let done = false

    function finish (ms) {
      if (done) return
      done = true
      socket.destroy()
      resolve(ms)
    }

    socket.setTimeout(timeoutMs)
    socket.on('connect', () => finish(Date.now() - start))
    socket.on('error',   () => finish(null))
    socket.on('timeout', () => finish(null))
    socket.connect(port, host)
  })
}

// Пингует сохранённый конфиг по его ссылке — парсит хост:порт и делает TCP-замер
function pingConfig (link) {
  try {
    const parsed = parseVpnLink(link)
    const ob = parsed.outbound
    if (!ob || !ob.server || !ob.server_port) return Promise.resolve(null)
    return pingServer(ob.server, ob.server_port)
  } catch (e) {
    return Promise.resolve(null)
  }
}

// ── Cleanup on quit ───────────────────────────────────────────────
app.on('before-quit', () => {
  if (singboxProcess) singboxProcess.kill('SIGTERM')
})

module.exports = {
  getSingboxPath,
  downloadSingbox,
  parseVpnLink,
  fetchSubscription,
  startProxy,
  stopProxy,
  getStatus,
  getSavedConfigs,
  saveConfig,
  deleteConfig,
  pingServer,
  pingConfig,
  PROXY_PORT
}
