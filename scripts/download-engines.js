// Скачивает VPN-движки (Xray-core + sing-box) для ТЕКУЩЕЙ платформы в
// vendor-bin/ ПЕРЕД упаковкой — electron-builder потом вшивает их прямо в
// установщик через "extraResources" (см. package.json). Раньше движок
// докачивался с GitHub при первом подключении VPN уже на машине клиента —
// именно та сеть, где GitHub Releases чаще всего рвёт/тормозит соединение
// (см. живой отчёт "с 10 раза скачалось и заработало"). Теперь скачивание
// с GitHub происходит один раз на CI/машине разработчика, а клиент получает
// уже готовый бинарник внутри установщика — без сетевых сюрпризов вообще.
//
// Версии и контрольные суммы держим синхронно с vpn-manager.js (единственное
// дублирование в проекте — vpn-manager.js использует require('electron').app
// и не может использоваться из чистого Node-скрипта сборки).
'use strict'

const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const crypto = require('crypto')
const { execFile } = require('child_process')
const AdmZip = require('adm-zip')

const SING_BOX_VERSION = '1.11.4'
const XRAY_VERSION = '26.3.27'

const SING_BOX_CHECKSUMS = {
  'sing-box-1.11.4-windows-amd64.zip': '8a681dbd6fa84f03d41e9e8637a8ff4df3d1d209556585ebf004b48325f9d70e',
  'sing-box-1.11.4-darwin-amd64.tar.gz': 'ba5ee4d4630b6cb36c24f0f33d7f9b790b185eceebc74818ca6ff1283bd5e94b',
  'sing-box-1.11.4-darwin-arm64.tar.gz': 'f4349633befd75c972a5a958cbfb6236a1e20b585425ae7c3ec73e5fa29217c5',
  'sing-box-1.11.4-linux-amd64.tar.gz': '0bb762ef286b36c2016d9107fc1f089be7a75f6d579b33f067d31e696c05927e'
}

const XRAY_CHECKSUMS = {
  'Xray-windows-64.zip': 'd004c39288ce9ada487c6f398c7c545f7d749e44bdfdd59dbc9f865afba4e1ad',
  'Xray-macos-64.zip': 'f5b0471d3459eff1b82e48af0aeac186abcc3298210070afbbbd8437a4e8b203',
  'Xray-macos-arm64-v8a.zip': '2e93a67e8aa1936ecefb307e120830fcbd4c643ab9b1c46a2d0838d5f8409eaf',
  'Xray-linux-64.zip': '23cd9af937744d97776ee35ecad4972cf4b2109d1e0fe6be9930467608f7c8ae'
}

const VENDOR_DIR = path.join(__dirname, '..', 'vendor-bin')

function platformInfo () {
  const plat = process.platform
  // electron-builder (package.json "build" config) currently targets x64
  // ONLY on all three platforms — never trust process.arch here: GitHub's
  // macos-latest runner itself is Apple Silicon (arm64) since 2024, but the
  // .dmg it produces via electron-builder is still x64 (Rosetta-run), so an
  // arch check based on the *host* running this script would silently bundle
  // an arm64 xray/sing-box binary inside an x64 app — wrong architecture,
  // fails to spawn at runtime on Intel Macs. Hardcode x64 to match the
  // actual build target; revisit if/when an arm64 mac target is added.
  if (plat === 'win32') {
    return {
      singboxFile: `sing-box-${SING_BOX_VERSION}-windows-amd64.zip`,
      xrayFile: 'Xray-windows-64.zip',
      singboxBin: 'sing-box.exe',
      xrayBin: 'xray.exe'
    }
  }
  if (plat === 'darwin') {
    return {
      singboxFile: `sing-box-${SING_BOX_VERSION}-darwin-amd64.tar.gz`,
      xrayFile: 'Xray-macos-64.zip',
      singboxBin: 'sing-box',
      xrayBin: 'xray'
    }
  }
  return {
    singboxFile: `sing-box-${SING_BOX_VERSION}-linux-amd64.tar.gz`,
    xrayFile: 'Xray-linux-64.zip',
    singboxBin: 'sing-box',
    xrayBin: 'xray'
  }
}

function verifyChecksum (filePath, filename, checksums) {
  const expected = checksums[filename]
  if (!expected) throw new Error(`Нет доверенной контрольной суммы для ${filename}`)
  const data = fs.readFileSync(filePath)
  const actual = crypto.createHash('sha256').update(data).digest('hex')
  if (actual !== expected) {
    throw new Error(`Контрольная сумма ${filename} не совпадает (ожидалось ${expected}, получено ${actual})`)
  }
}

function download (url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    function doGet (urlStr) {
      const mod = urlStr.startsWith('https') ? https : http
      mod.get(urlStr, { headers: { 'User-Agent': 'centrio-build' } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          doGet(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(() => resolve()))
      }).on('error', reject)
    }
    doGet(url)
  })
}

function findFile (dir, name) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    } else if (entry.name === name) {
      return full
    }
  }
  return null
}

function extract (archivePath, destBin, binName, tmpOut) {
  fs.mkdirSync(tmpOut, { recursive: true })
  if (archivePath.endsWith('.zip')) {
    const zip = new AdmZip(archivePath)
    zip.extractAllTo(tmpOut, true)
    const found = findFile(tmpOut, binName)
    if (!found) throw new Error(`${binName} not found in ${archivePath}`)
    fs.copyFileSync(found, destBin)
  } else {
    // .tar.gz — macOS/Linux sing-box only
    const { execFileSync } = require('child_process')
    execFileSync('tar', ['-xzf', archivePath, '-C', tmpOut])
    const found = findFile(tmpOut, binName)
    if (!found) throw new Error(`${binName} not found in ${archivePath}`)
    fs.copyFileSync(found, destBin)
  }
  fs.rmSync(tmpOut, { recursive: true, force: true })
}

async function ensureEngine ({ label, version, archiveFile, checksums, binName, subdir }) {
  const destDir = path.join(VENDOR_DIR, subdir)
  const destBin = path.join(destDir, binName)
  if (fs.existsSync(destBin)) {
    console.log(`[download-engines] ${label} уже есть в vendor-bin, пропускаю`)
    return
  }
  fs.mkdirSync(destDir, { recursive: true })

  const tmpFile = path.join(require('os').tmpdir(), archiveFile)
  const repo = label === 'Xray-core' ? 'XTLS/Xray-core' : 'SagerNet/sing-box'
  const url = `https://github.com/${repo}/releases/download/v${version}/${archiveFile}`

  console.log(`[download-engines] Скачиваю ${label} ${version} (${archiveFile})...`)
  await download(url, tmpFile)
  verifyChecksum(tmpFile, archiveFile, checksums)
  console.log(`[download-engines] Контрольная сумма ${label} совпала`)

  extract(tmpFile, destBin, binName, path.join(destDir, '_tmp_extract'))
  if (process.platform !== 'win32') fs.chmodSync(destBin, '755')
  fs.unlinkSync(tmpFile)
  console.log(`[download-engines] ${label} готов: ${destBin}`)
}

async function main () {
  const info = platformInfo()
  await ensureEngine({
    label: 'Xray-core',
    version: XRAY_VERSION,
    archiveFile: info.xrayFile,
    checksums: XRAY_CHECKSUMS,
    binName: info.xrayBin,
    subdir: 'xray'
  })
  await ensureEngine({
    label: 'sing-box',
    version: SING_BOX_VERSION,
    archiveFile: info.singboxFile,
    checksums: SING_BOX_CHECKSUMS,
    binName: info.singboxBin,
    subdir: 'singbox'
  })
}

main().catch((err) => {
  console.error('[download-engines] FAILED:', err.message)
  process.exit(1)
})
