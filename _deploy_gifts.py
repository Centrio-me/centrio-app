"""
Deploy gifts.ru integration files to server via pscp / plink (PuTTY).
Usage: python _deploy_gifts.py
Requires PuTTY installed at C:\Program Files\PuTTY\
"""
import subprocess, sys, os
sys.stdout.reconfigure(encoding='utf-8')

# ── Config ──────────────────────────────────────────────────────────────────────
HOST     = 'teamchfilm_claude@teamchfilm.beget.tech'
PW       = 'gY%65hP0y9wN'
HOSTKEY  = 'SHA256:eR3frrNnkcc1n/HT3zeWPE7CI1lJPx5PgOR4wWGLGZE'
PLUGIN   = '/home/t/teamchfilm/new.print-empire.ru/public_html/wp-content/plugins/pe-price-sync'
THEME    = '/home/t/teamchfilm/new.print-empire.ru/public_html/wp-content/themes/seonika-printempire'
PSCP     = r'C:\Program Files\PuTTY\pscp.exe'
PLINK    = r'C:\Program Files\PuTTY\plink.exe'
BASE     = os.path.dirname(os.path.abspath(__file__))
# ────────────────────────────────────────────────────────────────────────────────

def _run(args, capture=True):
    r = subprocess.run(args, capture_output=capture, text=True, encoding='utf-8', errors='replace')
    return r.returncode, (r.stdout or '') + (r.stderr or '')

def put(local_rel, remote):
    local = os.path.join(BASE, local_rel)
    print(f'Uploading {local_rel} → {remote}')
    rc, out = _run([PSCP, '-pw', PW, '-batch', '-hostkey', HOSTKEY, local, f'{HOST}:{remote}'])
    if rc != 0:
        print(f'  FAIL: {out.strip()[:200]}')
        sys.exit(1)

def run(cmd):
    rc, out = _run([PLINK, '-pw', PW, '-batch', '-hostkey', HOSTKEY, HOST, cmd])
    return out.strip()

def syntax(path):
    out = run(f'/usr/local/bin/php7.4 -l {path} 2>&1')
    ok  = 'No syntax errors' in out
    print(f'  Syntax: {"OK" if ok else "FAIL: " + out[:200]}')
    return ok

# ── Plugin files ────────────────────────────────────────────────────────────────
put('pe-price-sync/pe-price-sync.php',          PLUGIN + '/pe-price-sync.php')
put('pe-price-sync/includes/gifts-tab.php',     PLUGIN + '/includes/gifts-tab.php')
put('pe-price-sync/assets/admin-gifts.js',      PLUGIN + '/assets/admin-gifts.js')

syntax(PLUGIN + '/pe-price-sync.php')
syntax(PLUGIN + '/includes/gifts-tab.php')

# ── Theme files ─────────────────────────────────────────────────────────────────
put('inc/gifts/gifts-functions.php',              THEME + '/inc/gifts/gifts-functions.php')
put('single-gift.php',                            THEME + '/single-gift.php')
put('taxonomy-gift_cat.php',                      THEME + '/taxonomy-gift_cat.php')
put('page-templates/souvenir.php',                THEME + '/page-templates/souvenir.php')

syntax(THEME + '/inc/gifts/gifts-functions.php')
syntax(THEME + '/single-gift.php')
syntax(THEME + '/taxonomy-gift_cat.php')
syntax(THEME + '/page-templates/souvenir.php')

print('\nDone.')
