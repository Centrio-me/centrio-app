// VPN Manager — main process
// Управляет ДВУМЯ прокси-движками (2026-09-16, "давай ставить реально
// другой движок. Чтобы HAPP работал 1 в 1 как Centrio" — live user
// request, после того как выяснилось что XHTTP-серверы у пользователя
// вообще не подключались через sing-box):
//   - Xray-core — основной движок для vmess/vless/trojan/shadowsocks
//     (включая XHTTP/Reality/gRPC/WS/HTTPUpgrade транспорты) — тот же
//     движок, что использует Happ (подтверждено независимо несколькими
//     источниками, включая декомпилированный APK Happ на Android), гарантия
//     "1 в 1" совместимости с тем, что уже работает у пользователя там.
//   - sing-box — оставлен ТОЛЬКО для hysteria2:// ссылок, потому что
//     Xray-core в принципе не реализует протокол Hysteria2 (проверено
//     напрямую: `xray run -test` на конфиге с "protocol": "hysteria2" даёт
//     "unknown config id: hysteria2"), а терять уже рабочую поддержку
//     Hysteria2-ссылок при переходе на Xray-core не хотим.
// Выбор движка на ссылку — ENGINE_FOR_OUTBOUND_TYPE ниже; оба слушают один
// и тот же локальный SOCKS5-порт PROXY_PORT, но никогда не запущены
// одновременно (startProxy() сначала останавливает то, что уже работает).
const { app, shell } = require('electron')
const path  = require('path')
const fs    = require('fs')
const https = require('https')
const http  = require('http')
const net   = require('net')
const crypto = require('crypto')
const { spawn, execFile } = require('child_process')
const AdmZip = require('adm-zip')
const store = require('./main/services/store')
const { encryptValue, decryptValue } = require('./main/services/secureStore')
const PROXY_PORT = 7890   // local SOCKS5 port — общий для обоих движков
const SING_BOX_VERSION = '1.11.4'
const XRAY_VERSION = '26.3.27'

// sing-box не публикует checksums.txt/подписи для релиза, поэтому хэши
// пинуются вручную (посчитаны из официальных ассетов GitHub-релиза v1.11.4).
// Защищает от подмены бинарника при компрометации CDN/mirror или MITM.
const SING_BOX_CHECKSUMS = {
  'sing-box-1.11.4-windows-amd64.zip':  '8a681dbd6fa84f03d41e9e8637a8ff4df3d1d209556585ebf004b48325f9d70e',
  'sing-box-1.11.4-darwin-amd64.tar.gz': 'ba5ee4d4630b6cb36c24f0f33d7f9b790b185eceebc74818ca6ff1283bd5e94b',
  'sing-box-1.11.4-darwin-arm64.tar.gz': 'f4349633befd75c972a5a958cbfb6236a1e20b585425ae7c3ec73e5fa29217c5',
  'sing-box-1.11.4-linux-amd64.tar.gz':  '0bb762ef286b36c2016d9107fc1f089be7a75f6d579b33f067d31e696c05927e'
}

// Xray-core, в отличие от sing-box, публикует официальные SHA2-256 .dgst
// файлы на каждый ассет релиза — хэши ниже переписаны из них напрямую
// (https://github.com/XTLS/Xray-core/releases/download/v26.3.27/<file>.dgst),
// не пересчитаны вручную, но подход тот же — пин от подмены бинарника.
const XRAY_CHECKSUMS = {
  'Xray-windows-64.zip':    'd004c39288ce9ada487c6f398c7c545f7d749e44bdfdd59dbc9f865afba4e1ad',
  'Xray-macos-64.zip':      'f5b0471d3459eff1b82e48af0aeac186abcc3298210070afbbbd8437a4e8b203',
  'Xray-macos-arm64-v8a.zip': '2e93a67e8aa1936ecefb307e120830fcbd4c643ab9b1c46a2d0838d5f8409eaf',
  'Xray-linux-64.zip':      '23cd9af937744d97776ee35ecad4972cf4b2109d1e0fe6be9930467608f7c8ae'
}

function verifyChecksum (filePath, filename, checksums) {
  const expected = checksums[filename]
  if (!expected) throw new Error(`Нет доверенной контрольной суммы для ${filename} — отменяю установку`)
  const data = fs.readFileSync(filePath)
  const actual = crypto.createHash('sha256').update(data).digest('hex')
  if (actual !== expected) {
    throw new Error(`Контрольная сумма не совпадает (ожидалось ${expected}, получено ${actual}) — файл мог быть подменён`)
  }
}

let engineProcess = null
let currentConfig  = null  // { name, link, outbound }
let proxyActive    = false

// BUGFIX (2026-09-09, live user reports — "VPN постоянно отваливается...
// через себя не проводит никакой трафик", "вкладки не открываются"): the
// 'close' handler below always reset proxyActive/currentConfig, but NEVER
// told main/ipc/vpn.js to also reset the actual session proxy on
// defaultSession + every messenger partition. Those sessions are configured
// with session.setProxy({ proxyRules: 'socks5://127.0.0.1:7890' }) while VPN
// is on (see main/services/proxy.js) — that setting lives entirely in
// Chromium's network stack and has NOTHING to do with whether our own
// sing-box child process is still alive. So the moment sing-box exits
// unexpectedly (crash, killed by AV, laptop sleep/wake, network change —
// anything other than the user pressing "Disconnect", which already calls
// applyAllSessionsProxy(vpnProxyOff()) itself in vpn-disconnect), every
// webview session was left permanently pointed at a now-dead SOCKS5 port:
// every request in every messenger tab hangs/fails, while the VPN button
// still *looked* off/idle with no obvious error — exactly the reported
// "не пропускает трафик" / "вкладки не открываются", persisting until the
// user thought to manually reconnect. Fixed via a registrable callback
// (setUnexpectedExitHandler) that main/ipc/vpn.js wires to the same
// vpnProxyOff() reset used for an explicit disconnect, invoked only when
// the process died WITHOUT stopProxy() already having done that reset
// (tracked by expectingExit below, set right before we deliberately kill
// the process).
let expectingExit = false
let onUnexpectedExit = null
function setUnexpectedExitHandler (fn) { onUnexpectedExit = fn }

// ── Путь к бинарнику ──────────────────────────────────────────────
// BUGFIX (2026-09-16, "нельзя его один раз скачать и поместить сразу в
// приложение?" — прямой запрос после отчёта "с 10 раза скачалось и
// заработало"): scripts/download-engines.js скачивает оба движка ОДИН РАЗ
// на этапе сборки (CI/машина разработчика) и вшивает их в установщик через
// "extraResources" (package.json) — установщик кладёт их в
// process.resourcesPath/engines/<xray|singbox>/. Если такой готовый
// бинарник уже есть — просто копируем его в userData один раз при первом
// обращении, и сетевое скачивание на машине клиента вообще не понадобится.
// downloadXray()/downloadSingbox() остаются как fallback — для dev-режима
// (app.isPackaged === false, ресурсов нет) и на случай, если по какой-то
// причине extraResources не попал в конкретную сборку.
function ensureBundledEngine (binPath, subdir, binName) {
  if (fs.existsSync(binPath)) return binPath
  if (!app.isPackaged) return binPath
  const bundled = path.join(process.resourcesPath, 'engines', subdir, binName)
  if (fs.existsSync(bundled)) {
    try {
      fs.copyFileSync(bundled, binPath)
      if (process.platform !== 'win32') fs.chmodSync(binPath, '755')
    } catch (e) {
      console.error(`[VPN] failed to copy bundled ${subdir} binary:`, e.message)
    }
  }
  return binPath
}

function getSingboxPath () {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'singbox')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const bin = process.platform === 'win32' ? 'sing-box.exe' : 'sing-box'
  return ensureBundledEngine(path.join(dir, bin), 'singbox', bin)
}

function getXrayPath () {
  const userData = app.getPath('userData')
  const dir = path.join(userData, 'xray')
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const bin = process.platform === 'win32' ? 'xray.exe' : 'xray'
  return ensureBundledEngine(path.join(dir, bin), 'xray', bin)
}

// ── Скачивание движка (sing-box ИЛИ Xray-core) ──────────────────────
// Общая логика вынесена в один генерик (2026-09-16, при добавлении
// Xray-core вторым движком) — было бы 90 строк дублирования иначе, один
// таймаут/прогресс/проверка-целостности/распаковка на оба движка.
//
// BUGFIX (2026-09-16, живой отчёт: "с 10 раза скачалось и заработало"):
// GitHub Releases (и его CDN objects.githubusercontent.com, куда ведёт
// редирект) нередко рвёт/тормозит соединение именно в тех сетях, где сам
// VPN и нужен — до этой правки КАЖДЫЙ обрыв сразу улетал наверх как ошибка
// в UI (see main/ipc/vpn.js), и пользователю приходилось вручную жать
// «Подключить» заново и заново. Теперь до 3 попыток скачивания делаются
// автоматически внутри одного вызова, с растущей паузой между ними —
// наружу уходит ошибка только если не получилось совсем.
const DOWNLOAD_MAX_ATTEMPTS = 3
const DOWNLOAD_RETRY_DELAYS_MS = [1000, 3000]

function downloadEngineBinary ({ binPath, filename, url, checksums, engineLabel, onProgress }) {
  if (fs.existsSync(binPath)) return Promise.resolve(binPath)

  async function attempt (n) {
    try {
      return await downloadEngineBinaryOnce({ binPath, filename, url, checksums, engineLabel, onProgress })
    } catch (err) {
      if (n >= DOWNLOAD_MAX_ATTEMPTS) throw err
      const delay = DOWNLOAD_RETRY_DELAYS_MS[n - 1] || 3000
      onProgress && onProgress({ stage: 'download', percent: 0, msg: `Повтор попытки скачивания ${engineLabel} (${n + 1}/${DOWNLOAD_MAX_ATTEMPTS})...` })
      await new Promise(r => setTimeout(r, delay))
      return attempt(n + 1)
    }
  }

  return attempt(1)
}

function downloadEngineBinaryOnce ({ binPath, filename, url, checksums, engineLabel, onProgress }) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(binPath)) { resolve(binPath); return }

    const tmpFile = path.join(app.getPath('temp'), filename)
    onProgress && onProgress({ stage: 'download', percent: 0, msg: `Скачивание ${engineLabel}...` })

    const dlFile = fs.createWriteStream(tmpFile)

    // Закрываем файловый поток и подчищаем недокачанный файл перед reject —
    // иначе повторная попытка (см. downloadEngineBinary выше) может упереться
    // в файл, ещё занятый предыдущим (оборванным) потоком на Windows.
    function failWith (err) {
      dlFile.destroy()
      fs.unlink(tmpFile, () => {})
      reject(err)
    }

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
              verifyChecksum(tmpFile, filename, checksums)
            } catch (err) {
              failWith(err)
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
            }).catch(failWith)
          })
        })
        res.on('error', failWith)
      })
      req.on('error', failWith)
      req.setTimeout(DOWNLOAD_IDLE_TIMEOUT_MS, () => {
        req.destroy(new Error(`Таймаут скачивания ${engineLabel} — сервер не отвечает`))
      })
    }

    doGet(url)
  })
}

function downloadSingbox (onProgress) {
  const ver = SING_BOX_VERSION
  let filename
  if (process.platform === 'win32') filename = `sing-box-${ver}-windows-amd64.zip`
  else if (process.platform === 'darwin') filename = `sing-box-${ver}-darwin-${process.arch === 'arm64' ? 'arm64' : 'amd64'}.tar.gz`
  else filename = `sing-box-${ver}-linux-amd64.tar.gz`

  return downloadEngineBinary({
    binPath: getSingboxPath(),
    filename,
    url: `https://github.com/SagerNet/sing-box/releases/download/v${ver}/${filename}`,
    checksums: SING_BOX_CHECKSUMS,
    engineLabel: 'sing-box',
    onProgress
  })
}

// Xray-core — единственный из двух архивов ВСЕГДА .zip на любой платформе
// (sing-box использует .zip только на Windows, .tar.gz на macOS/Linux —
// см. extractBinary()/extractZip() ниже, которая поэтому поддерживает оба).
function downloadXray (onProgress) {
  const ver = XRAY_VERSION
  let filename
  if (process.platform === 'win32') filename = 'Xray-windows-64.zip'
  else if (process.platform === 'darwin') filename = process.arch === 'arm64' ? 'Xray-macos-arm64-v8a.zip' : 'Xray-macos-64.zip'
  else filename = 'Xray-linux-64.zip'

  return downloadEngineBinary({
    binPath: getXrayPath(),
    filename,
    url: `https://github.com/XTLS/Xray-core/releases/download/v${ver}/${filename}`,
    checksums: XRAY_CHECKSUMS,
    engineLabel: 'Xray-core',
    onProgress
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
      // BUGFIX (2026-09-16, добавление Xray-core вторым движком): раньше
      // .zip распаковывался только через PowerShell Expand-Archive — верно
      // для sing-box (единственный движок, где .zip встречается ТОЛЬКО на
      // Windows), но Xray-core публикует .zip на ВСЕХ платформах (macOS и
      // Linux тоже), а PowerShell там просто нет. adm-zip (уже зависимость
      // проекта, см. main/services/extensions.js) — чистый JS, работает
      // одинаково везде, заодно убирает shell-вызов PowerShell с
      // экранированием путей как класс риска.
      const tmpOut = sanitizePath(path.join(destDir, '_tmp_extract'))
      if (!fs.existsSync(tmpOut)) fs.mkdirSync(tmpOut, { recursive: true })
      try {
        const zip = new AdmZip(safeArchive)
        zip.extractAllTo(tmpOut, true)
        const found = findFile(tmpOut, binName)
        if (!found) { reject(new Error(`${binName} not found in archive`)); return }
        fs.copyFileSync(found, destBin)
        fs.rmSync(tmpOut, { recursive: true, force: true })
        resolve()
      } catch (err) {
        reject(err)
      }
    } else {
      // macOS / Linux — tar.gz (только sing-box; Xray-core сюда никогда не
      // попадает, у него везде .zip, см. ветку выше).
      // BUGFIX (2026-09-16): findFile() ниже искала жёстко зашитое имя
      // 'sing-box', игнорируя переданный параметр destBin/binName — раньше
      // сходило с рук, потому что единственным вызывающим кодом был сам
      // sing-box, для которого 'sing-box' и есть правильное имя. Теперь,
      // когда extractBinary() — общая функция на оба движка, эта ветка
      // должна искать РЕАЛЬНОЕ целевое имя файла, а не константу.
      const tmpOut = path.join(destDir, '_tmp_extract')
      if (!fs.existsSync(tmpOut)) fs.mkdirSync(tmpOut, { recursive: true })
      execFile('tar', ['-xzf', archivePath, '-C', tmpOut], (err) => {
        if (err) { reject(err); return }
        const found = findFile(tmpOut, binName)
        if (!found) { reject(new Error(`${binName} not found in archive`)); return }
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

  // FEATURE (2026-09-16, "давай ставить реально другой движок. Чтобы HAPP
  // работал 1 в 1 как Centrio" — live user request): this briefly threw
  // VPN_UNSUPPORTED_TRANSPORT here (2.8.2) after confirming sing-box has
  // never supported XHTTP (upstream PR SagerNet/sing-box#4326 was closed
  // without merging). Now that startProxy() routes vmess/vless/trojan/
  // shadowsocks links through Xray-core instead (see ENGINE_FOR_PROTOCOL /
  // buildXrayOutboundFromSingbox below) — the same engine Happ itself uses,
  // where XHTTP originated and is natively supported — this transport
  // object is real output again, just consumed by a different engine than
  // it used to be. sing-box is now only ever reached for hysteria2://
  // links (Xray-core doesn't implement that protocol at all), which never
  // use this function.
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
    // BUGFIX (2026-09-09, live user report — "это очень актуально для
    // России"): no `dns` block existed at all before this, so sing-box fell
    // back to whatever DNS the OS/network hands it to resolve the VPN
    // server's own hostname (when a config uses a domain rather than a bare
    // IP) — in networks with DNS-level interception/poisoning (common
    // exactly where a VPN is most needed), that resolution can silently
    // return a wrong/blocked address before the tunnel is even up, with no
    // error surfaced anywhere in this app — it would just look like "не
    // подключается" for every server. Routes DNS queries through an
    // encrypted DoH resolver over the DIRECT path (not the not-yet-
    // established proxy — this only resolves the proxy server itself),
    // sidestepping a tampered local resolver.
    //
    // BUGFIX (2026-09-09, live report "VPN не подключается вообще, таймаут
    // на любом сервере" — CRITICAL regression from the DNS fix above): this
    // block originally used sing-box's NEW (1.12+) DNS server schema
    // ({ type, server, detour }). SING_BOX_VERSION above is pinned to
    // 1.11.4, which only understands the legacy schema
    // ({ tag, address, detour }) — every single connect attempt failed
    // instantly with "decode config: dns.servers[0].type: unknown field
    // 'type'", sing-box exited immediately, and NOTHING in this app ever
    // surfaced that (see the checkLine() fix a few lines below) — it just
    // looked like a generic 20s timeout on every server. Confirmed by
    // running the shipped sing-box.exe directly against the actual
    // generated config.json.
    dns: {
      servers: [
        { tag: 'remote', address: 'https://1.1.1.1/dns-query', detour: 'direct' }
      ],
      final: 'remote',
      strategy: 'prefer_ipv4'
    },
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

// ── Генерация конфига Xray-core ─────────────────────────────────────
// FEATURE (2026-09-16, замена движка — см. комментарий над XRAY_VERSION
// вверху файла): а не переписывать parseVmess/parseVless/parseTrojan/
// parseShadowsocks с нуля под схему Xray-core (риск сломать уже
// проверенный, живой код разбора самих ссылок) — этот адаптер берёт УЖЕ
// собранный sing-box-style `outbound` (те функции не трогали вообще) и
// переводит его в эквивалентный объект схемы Xray-core. hysteria2 сюда
// никогда не попадает — для него отдельная ветка в startProxy() ниже,
// которая продолжает идти через buildSingboxConfig() как раньше.
function buildXrayOutboundFromSingbox (outbound) {
  const protocol = outbound.type // 'vless' | 'vmess' | 'trojan' | 'shadowsocks'
  let settings

  if (protocol === 'vless' || protocol === 'vmess') {
    const user = protocol === 'vless'
      ? { id: outbound.uuid, encryption: 'none', ...(outbound.flow ? { flow: outbound.flow } : {}) }
      : { id: outbound.uuid, alterId: outbound.alter_id || 0, security: outbound.security || 'auto' }
    settings = { vnext: [{ address: outbound.server, port: outbound.server_port, users: [user] }] }
  } else if (protocol === 'trojan') {
    settings = { servers: [{ address: outbound.server, port: outbound.server_port, password: outbound.password }] }
  } else if (protocol === 'shadowsocks') {
    settings = { servers: [{ address: outbound.server, port: outbound.server_port, method: outbound.method, password: outbound.password }] }
  } else {
    throw new Error(`buildXrayOutboundFromSingbox: unsupported protocol "${protocol}"`)
  }

  const streamSettings = { network: 'tcp' }
  const t = outbound.transport
  if (t) {
    if (t.type === 'ws') {
      streamSettings.network = 'ws'
      streamSettings.wsSettings = { path: t.path, ...(t.headers ? { headers: t.headers } : {}) }
    } else if (t.type === 'grpc') {
      streamSettings.network = 'grpc'
      streamSettings.grpcSettings = { serviceName: t.service_name }
    } else if (t.type === 'http') {
      // sing-box's buildTransport()/buildTransportFromParams() use 'http'
      // for both h2 (vmess ?net=h2) and vless ?type=http — Xray-core's own
      // schema splits these differently ('http' network IS h2-based in
      // Xray too, same underlying protocol), so a straight pass-through is
      // correct here, not a bug to reconcile.
      streamSettings.network = 'http'
      streamSettings.httpSettings = { path: t.path, ...(t.host?.length ? { host: t.host } : {}) }
    } else if (t.type === 'xhttp') {
      streamSettings.network = 'xhttp'
      streamSettings.xhttpSettings = {
        path: t.path,
        ...(t.method ? { mode: t.method } : {}),
        ...(t.extra ? { extra: t.extra } : {})
      }
    } else if (t.type === 'httpupgrade') {
      streamSettings.network = 'httpupgrade'
      streamSettings.httpupgradeSettings = { path: t.path, ...(t.host ? { host: t.host } : {}) }
    }
  }

  if (outbound.tls?.enabled) {
    if (outbound.tls.reality?.enabled) {
      streamSettings.security = 'reality'
      streamSettings.realitySettings = {
        serverName: outbound.tls.server_name,
        fingerprint: outbound.tls.utls?.fingerprint || 'chrome',
        publicKey: outbound.tls.reality.public_key,
        shortId: outbound.tls.reality.short_id ?? ''
      }
    } else {
      streamSettings.security = 'tls'
      streamSettings.tlsSettings = {
        serverName: outbound.tls.server_name,
        allowInsecure: !!outbound.tls.insecure
      }
    }
  }

  return { tag: 'proxy', protocol, settings, streamSettings }
}

function buildXrayConfig (outbound) {
  return {
    log: { loglevel: 'warning' },
    inbounds: [{
      tag: 'socks-in',
      listen: '127.0.0.1',
      port: PROXY_PORT,
      protocol: 'socks',
      settings: { auth: 'noauth', udp: true }
    }],
    outbounds: [
      buildXrayOutboundFromSingbox(outbound),
      { tag: 'direct', protocol: 'freedom' }
    ]
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

// BUGFIX (2026-09-09, live user reports — "даже когда я вручную переключаю
// — они всё равно не подключаются... после перезапуска программы начинает
// работать"): `engineProcess` (the in-memory child-process handle) is our
// ONLY source of truth for "is something already on port 7890" — the
// 'if (engineProcess) await stopProxy()' guard below does nothing if that
// variable is already null, which is exactly what happens after the crash
// this file's other 2026-09-09 fix targets, OR if `proc.kill()` in
// stopProxy() didn't actually terminate the OS process (e.g. it was already
// wedged/hung — a hung process is unkillable by a plain SIGTERM/kill() on
// some hangs, taskkill /f /t is the reliable fallback and is ALREADY used
// there, but only for a process stopProxy() knows about). A previous
// sing-box that our own tracking lost (crash race, or literally any prior
// run this process didn't clean up) can be left listening-but-broken on
// 7890 — checkPortListening() below then reports "started" for the NEW
// connect attempt because *something* accepts the TCP connection, even
// though it's the old dead tunnel, not the new one. Only a full app restart
// (which tears down every child process Windows attached to this process)
// cleared it — reconnecting inside the running app never did. Fix:
// unconditionally check the port BEFORE trusting our own bookkeeping, and
// force-kill whatever OS process actually owns it if it's not the process
// we're about to spawn.
async function killStrayProcessOnPort (port) {
  const listening = await checkPortListening(port)
  if (!listening) return
  try {
    if (process.platform === 'win32') {
      const { execSync } = require('child_process')
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' }).toString()
      const pids = new Set()
      for (const line of out.split(/\r?\n/)) {
        const m = line.trim().match(/LISTENING\s+(\d+)\s*$/)
        if (m) pids.add(m[1])
      }
      for (const pid of pids) {
        try { execFile('taskkill', ['/pid', pid, '/f', '/t'], () => {}) } catch (_) {}
      }
    } else {
      const { execSync } = require('child_process')
      const out = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' }).toString()
      for (const pid of out.split(/\s+/).filter(Boolean)) {
        try { process.kill(Number(pid), 'SIGKILL') } catch (_) {}
      }
    }
  } catch (_) {
    // No matching process found (findstr/lsof exit non-zero on no match) — fine, nothing to clean up.
  }
  // Give the OS a moment to actually release the socket before we try to bind it ourselves.
  await new Promise((r) => setTimeout(r, 400))
}

// ── Запуск / остановка прокси ─────────────────────────────────────
// FEATURE (2026-09-16, второй движок): единственное место, где решается,
// КАКОЙ движок обслуживает ссылку. hysteria2 — единственный протокол, для
// которого Xray-core в принципе не реализует outbound (проверено
// напрямую), всё остальное (vless/vmess/trojan/shadowsocks, включая
// XHTTP/Reality/gRPC/WS/HTTPUpgrade транспорты) идёт через Xray-core —
// тот же движок, что и Happ.
function engineForOutbound (outbound) {
  return outbound.type === 'hysteria2' ? 'singbox' : 'xray'
}

async function startProxy (parsed, onLog) {
  if (engineProcess) await stopProxy()
  await killStrayProcessOnPort(PROXY_PORT)

  const engine  = engineForOutbound(parsed.outbound)
  const binPath = engine === 'xray' ? getXrayPath() : getSingboxPath()
  if (!fs.existsSync(binPath)) {
    const err = new Error(engine === 'xray' ? 'Xray-core не установлен' : 'sing-box не установлен')
    err.code = 'VPN_NOT_INSTALLED'
    err.engine = engine
    throw err
  }

  const config  = engine === 'xray' ? buildXrayConfig(parsed.outbound) : buildSingboxConfig(parsed.outbound)
  const cfgDir  = path.join(app.getPath('userData'), engine === 'xray' ? 'xray' : 'singbox')
  const cfgPath = path.join(cfgDir, engine === 'xray' ? 'xray-config.json' : 'config.json')
  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8')

  return new Promise((resolve, reject) => {
    engineProcess = spawn(binPath, ['run', '-c', cfgPath], {
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
        const err = new Error((engine === 'xray' ? 'Xray-core' : 'sing-box') + ' не запустился за 20 секунд')
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
      // BUGFIX (2026-09-09, same live report as the DNS schema fix above):
      // sing-box's own FATAL config-decode errors print as "FATAL[...]"
      // (uppercase, ANSI-colored) — this check only ever matched lowercase
      // 'fatal', so a real, immediate config error (like the DNS schema
      // mismatch just fixed) never got caught here and fell through to the
      // generic 20-second VPN_START_TIMEOUT instead of surfacing the actual
      // reason. Case-insensitive now so any future config regression fails
      // fast with a real error message instead of a silent timeout.
      //
      // Xray-core doesn't print "fatal"/"panic" on a config error — it prints
      // "Failed to start: ..." (confirmed via direct binary testing), so that
      // phrase is checked too. sing-box never emits it, so this is safe for
      // both engines.
      const lower = line.toLowerCase()
      if (!started && (lower.includes('panic') || lower.includes('fatal') || lower.includes('failed to start'))) {
        clearTimeout(timeout)
        clearInterval(portPoller)
        const err = new Error((engine === 'xray' ? 'Xray-core' : 'sing-box') + ': ' + line.trim())
        err.code = 'VPN_START_CRASHED'
        reject(err)
      }
    }

    engineProcess.stdout.on('data', d => d.toString().split('\n').forEach(checkLine))
    engineProcess.stderr.on('data', d => d.toString().split('\n').forEach(checkLine))

    engineProcess.on('error', (err) => {
      clearTimeout(timeout)
      clearInterval(portPoller)
      if (!started) reject(err)
    })

    engineProcess.on('close', (code) => {
      clearInterval(portPoller)
      const wasActive     = proxyActive
      const wasExpected   = expectingExit
      engineProcess = null
      proxyActive    = false
      currentConfig  = null
      expectingExit  = false
      onLog && onLog(`[VPN] ${engine === 'xray' ? 'Xray-core' : 'sing-box'} exited with code ${code}`)
      // See BUGFIX above setUnexpectedExitHandler — only fires for a real
      // crash/kill, not for our own stopProxy()-initiated shutdown.
      if (wasActive && !wasExpected && onUnexpectedExit) {
        try { onUnexpectedExit(code) } catch (_) {}
      }
    })
  })
}

async function stopProxy () {
  if (engineProcess) {
    const proc = engineProcess
    expectingExit  = true  // this kill is deliberate — don't treat the resulting 'close' as a crash
    engineProcess = null  // обнуляем сразу, чтобы close-обработчик не конфликтовал

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
  if (engineProcess) engineProcess.kill('SIGTERM')
})

module.exports = {
  getSingboxPath,
  downloadSingbox,
  getXrayPath,
  downloadXray,
  engineForOutbound,
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
  PROXY_PORT,
  // BUGFIX (2026-09-09, live report "No handler registered for
  // 'vpn-connect'" — CRITICAL regression from this session's own VPN fix):
  // setUnexpectedExitHandler was defined above but never added here, so
  // main/ipc/vpn.js's `getVpn().setUnexpectedExitHandler(...)` — called at
  // the very top of registerVpnIpc(), before any ipcMain.handle(...) — threw
  // "is not a function" on every app start. That exception aborted
  // registerVpnIpc() entirely (no vpn-* channel ever got registered) and,
  // since main/bootstrap/registerIpc.js calls registration functions
  // sequentially and unconditionally, silently broke everything registered
  // after it too (screenshot, settingsPortability, extensions,
  // lockBackground, assistant). Always smoke-test require()+registration
  // after touching this file's exports — this shipped in 2.6.2 unverified.
  setUnexpectedExitHandler
}
