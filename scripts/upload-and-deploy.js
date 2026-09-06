require('dotenv').config()
const SftpClient = require('ssh2-sftp-client')
const path = require('path')

const config = {
    host: process.env.UPLOAD_HOST || '31.128.44.165',
    port: Number(process.env.UPLOAD_PORT || 22),
    username: process.env.UPLOAD_USER || 'root',
    password: process.env.UPLOAD_PASSWORD,
    readyTimeout: 30000
}

const uploads = [
    {
        local: path.join(__dirname, '../landing/utils.ts'),
        remote: '/var/www/centrio-web/src/lib/utils.ts'
    },
    {
        local: path.join(__dirname, '../landing/multi-type-ripple-buttons.tsx'),
        remote: '/var/www/centrio-web/src/components/ui/multi-type-ripple-buttons.tsx'
    },
    {
        local: path.join(__dirname, '../landing/animated-glassy-pricing.tsx'),
        remote: '/var/www/centrio-web/src/components/ui/animated-glassy-pricing.tsx'
    },
    {
        local: path.join(__dirname, '../landing/hover-footer.tsx'),
        remote: '/var/www/centrio-web/src/components/ui/hover-footer.tsx'
    },
    {
        local: path.join(__dirname, '../landing/layout.tsx'),
        remote: '/var/www/centrio-web/src/app/layout.tsx'
    },
    {
        local: path.join(__dirname, '../landing/page.tsx'),
        remote: '/var/www/centrio-web/src/app/page.tsx'
    },
    {
        local: path.join(__dirname, '../landing/site-shell.tsx'),
        remote: '/var/www/centrio-web/src/components/ui/site-shell.tsx'
    },
    {
        local: path.join(__dirname, '../landing/download.tsx'),
        remote: '/var/www/centrio-web/src/app/download/page.tsx'
    },
    {
        // Colocated import for download.tsx's `./changelog-data` — same
        // local file uploaded to both this path and the pricing/ one below,
        // since Next.js relative imports resolve per-directory on the server.
        local: path.join(__dirname, '../landing/changelog-data.ts'),
        remote: '/var/www/centrio-web/src/app/download/changelog-data.ts'
    },
    {
        local: path.join(__dirname, '../landing/faq.tsx'),
        remote: '/var/www/centrio-web/src/app/faq/page.tsx'
    },
    {
        local: path.join(__dirname, '../landing/pricing.tsx'),
        remote: '/var/www/centrio-web/src/app/pricing/page.tsx'
    },
    {
        // Colocated import for pricing.tsx's `./changelog-data` — see note above.
        local: path.join(__dirname, '../landing/changelog-data.ts'),
        remote: '/var/www/centrio-web/src/app/pricing/changelog-data.ts'
    },
    {
        local: path.join(__dirname, '../landing/privacy.tsx'),
        remote: '/var/www/centrio-web/src/app/privacy/page.tsx'
    },
    {
        local: path.join(__dirname, '../landing/terms.tsx'),
        remote: '/var/www/centrio-web/src/app/terms/page.tsx'
    }
]

console.log(`Connecting to ${config.host}:${config.port}...`)

const sftp = new SftpClient()

sftp.connect(config).then(async () => {
    console.log('SFTP connected.')

    for (const { local, remote } of uploads) {
        console.log(`Uploading ${local} → ${remote}`)
        await sftp.put(local, remote)
        console.log(`  ✓ Uploaded`)
    }

    console.log('\nRunning build...')
    const cmd = 'cd /var/www/centrio-web && npm run build 2>&1 | tail -20 && pm2 restart centrio-web && echo "=== DEPLOY OK ==="'

    return new Promise((resolve, reject) => {
        sftp.client.exec(cmd, (err, stream) => {
            if (err) return reject(err)
            stream.on('data', d => process.stdout.write(d.toString()))
            stream.stderr.on('data', d => process.stderr.write(d.toString()))
            stream.on('close', code => resolve(code))
        })
    })
}).then(async (code) => {
    console.log(`\nDone. Exit code: ${code}`)
    await sftp.end()
    process.exit(code || 0)
}).catch(async (err) => {
    console.error('Error:', err.message)
    try { await sftp.end() } catch (_) {}
    process.exit(1)
})
