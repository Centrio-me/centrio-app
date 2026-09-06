require('dotenv').config()
const SftpClient = require('ssh2-sftp-client')
const path = require('path')
const fs   = require('fs')
const os   = require('os')
const stream = require('stream')

const defaultKeyPath = path.join(os.homedir(), '.ssh', 'centrio_deploy_tmp', 'centrio_deploy')
const keyPath = fs.existsSync(defaultKeyPath) ? defaultKeyPath : null

const config = {
    host: process.env.UPLOAD_HOST || '31.128.44.165',
    port: Number(process.env.UPLOAD_PORT || 22),
    username: process.env.UPLOAD_USER || 'root',
    readyTimeout: 30000,
    ...(keyPath ? { privateKey: fs.readFileSync(keyPath) } : { password: process.env.UPLOAD_PASS || process.env.UPLOAD_PASSWORD })
}

const sftp = new SftpClient()

function exec(cmd) {
    return new Promise((resolve, reject) => {
        let code = 0
        sftp.client.exec(cmd, (err, st) => {
            if (err) return reject(err)
            st.on('data', d => process.stdout.write(d.toString()))
            st.stderr.on('data', d => process.stderr.write(d.toString()))
            st.on('close', c => { code = c; resolve(c) })
        })
    })
}

async function upload(localFile, remotePath) {
    const buf = fs.readFileSync(localFile)
    const r = new stream.Readable()
    r.push(buf); r.push(null)
    await sftp.put(r, remotePath)
    console.log(`  ✓ ${remotePath}`)
}

sftp.connect(config).then(async () => {
    console.log('Connected.\n')

    console.log('1. Backing up + uploading tokens.js (device-limit gating)...')
    await exec('cp /var/www/centrio-api/src/utils/tokens.js /var/www/centrio-api/src/utils/tokens.js.bak-prolimit')
    await upload(path.join(__dirname, '../server-src/utils/tokens.js'), '/var/www/centrio-api/src/utils/tokens.js')

    console.log('\n2. Restarting centrio-api...')
    const code = await exec("su - webapps -c 'pm2 restart centrio-api --update-env' && echo '=== OK ==='")

    await sftp.end()
    process.exit(code)
}).catch(async err => {
    console.error('Error:', err.message)
    try { await sftp.end() } catch(_) {}
    process.exit(1)
})
