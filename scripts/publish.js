require('dotenv').config()
const os = require('os')
const path = require('path')
const fs = require('fs')
const Client = require('ssh2-sftp-client')
const pkg = require('../package.json')

const sftp = new Client()

// Предпочитаем ключ (сегодня заведён centrio_deploy) вместо пароля —
// пароль в .env оказался отозван/устарел (сервер отвечал USERAUTH_FAILURE).
const defaultKeyPath = path.join(os.homedir(), '.ssh', 'centrio_deploy_tmp', 'centrio_deploy')
const keyPath = process.env.UPLOAD_PRIVATE_KEY_PATH || (fs.existsSync(defaultKeyPath) ? defaultKeyPath : null)

const config = {
    host: process.env.UPLOAD_HOST,
    port: Number(process.env.UPLOAD_PORT || 22),
    username: process.env.UPLOAD_USER,
    ...(keyPath ? { privateKey: fs.readFileSync(keyPath) } : { password: process.env.UPLOAD_PASSWORD })
}

const distDir = path.resolve(__dirname, '..', pkg.build?.directories?.output || 'dist-v1510')
const remoteDir = process.env.UPLOAD_PATH
const version = pkg.version
const productName = pkg.productName || pkg.name

const filesToUpload = [
    'latest.yml',
    `${productName} Setup ${version}.exe`,
    `${productName} Setup ${version}.exe.blockmap`
]

function ensureFileExists(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Файл не найден: ${filePath}`)
    }
}

async function main() {
    if (!config.host || !config.username || !remoteDir || !(config.privateKey || config.password)) {
        throw new Error('Не заданы UPLOAD_HOST, UPLOAD_USER, UPLOAD_PATH и один из UPLOAD_PRIVATE_KEY_PATH/UPLOAD_PASSWORD')
    }
    console.log(config.privateKey ? `Аутентификация по ключу: ${keyPath}` : 'Аутентификация по паролю (fallback)')

    for (const fileName of filesToUpload) {
        ensureFileExists(path.join(distDir, fileName))
    }

    console.log('Подключение к серверу...')
    await sftp.connect(config)

    try {
        await sftp.mkdir(remoteDir, true).catch(() => {})

        for (const fileName of filesToUpload) {
            const localPath = path.join(distDir, fileName)
            const remotePath = `${remoteDir}/${fileName}`

            console.log(`Загрузка: ${fileName}`)
            await sftp.put(localPath, remotePath)
        }

        console.log('Готово: публикация завершена')
    } finally {
        await sftp.end()
    }
}

main().catch((err) => {
    console.error('Ошибка публикации:', err)
    process.exit(1)
})