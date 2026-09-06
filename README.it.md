<div align="center">
  <img src="assets/logo.png" width="96" height="96" alt="Centrio" />

  <h1>Centrio</h1>

  <p><strong>Tutti i tuoi messenger. Una sola finestra.</strong></p>

  <p>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases/latest">
      <img src="https://img.shields.io/github/v/release/ArtemkaFreedom/centrio-app?label=versione&color=6d28d9&style=flat-square" alt="Ultima versione" />
    </a>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases">
      <img src="https://img.shields.io/github/downloads/ArtemkaFreedom/centrio-app/total?color=3b82f6&style=flat-square&label=download" alt="Download" />
    </a>
    <img src="https://img.shields.io/badge/piattaforme-Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=flat-square" alt="Piattaforme" />
    <img src="https://img.shields.io/badge/licenza-MIT-22c55e?style=flat-square" alt="Licenza" />
  </p>

  <p>
    <a href="https://centrio.me">🌐 Sito web</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/download">📥 Scarica</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/faq">❓ FAQ</a>
    &nbsp;·&nbsp;
    <a href="mailto:support@centrio.me">💬 Supporto</a>
  </p>

  <p>
    <a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="README.zh.md">中文</a> · <a href="README.fr.md">Français</a> · <b>Italiano</b>
  </p>


</div>

---

## Perché Centrio?

Telegram in una finestra, WhatsApp in un'altra, Discord in una terza. Gmail in una scheda del browser. Notion da qualche parte. Slack che notifica in background.

**Centrio mette tutto in un unico posto** — un'app desktop dove ogni servizio vive nella propria scheda, le notifiche sono unificate e si possono finalmente chiudere quelle 14 schede del browser.

---

## Funzionalità

### 100+ servizi, una barra laterale

Telegram · WhatsApp · Discord · VK · Slack · Notion · Gmail · Signal · Zoom · WeChat · LINE · Figma · Jira · e qualsiasi sito aggiunto manualmente.

### VPN integrata

Nessuna app di terze parti. Importa un link di configurazione e connettiti con un clic.

| Protocollo | Formato di importazione |
|------------|------------------------|
| VLESS | `vless://...` |
| VMess | `vmess://...` |
| Trojan | `trojan://...` |
| Shadowsocks | `ss://...` |
| Hysteria2 | `hy2://...` |
| Abbonamento | URL con lista di configurazioni |

Indicatore di ping (verde / giallo / rosso), bandiera del paese, timer di connessione, routing del traffico per tutte le sessioni.

### Estensioni Chrome

Installa AdBlock, Grammarly, Traduttore e altre estensioni direttamente in Centrio — senza browser separato. *(Pro)*

### Gratuito e Pro

| Funzionalità | Gratuito | Pro |
|--------------|:--------:|:---:|
| Servizi di messaggistica | ✅ illimitati | ✅ illimitati |
| VPN integrata | ✅ | ✅ |
| AdBlock | ✅ | ✅ |
| Estensioni Chrome | — | ✅ |
| Cartelle e raggruppamento | — | ✅ |
| Sincronizzazione cloud | — | ✅ |
| Supporto prioritario | — | ✅ |

### Tutto il resto

- 🔔 **Notifiche intelligenti** — silenzia per servizio, modalità Non disturbare, suoni personalizzati
- 📌 **Blocco PIN** — blocco automatico con timeout configurabile
- 🎨 **Temi** — scuro, chiaro, segui il sistema
- 🌍 **5 lingue** — Italiano, English, Русский, 中文, Français
- ⌨️ **Scorciatoie da tastiera** — `Ctrl+,` impostazioni, `Ctrl+K` ricerca rapida
- 🔄 **Aggiornamento automatico** — aggiornamenti silenziosi in background

---

## Scarica

| Piattaforma | File | Requisiti |
|-------------|------|-----------|
| **Windows** | Programma di installazione `.exe` NSIS | Windows 10/11 · x64 |
| **macOS** | Immagine disco `.dmg` | macOS 12 Monterey+ · x64 |
| **Linux** | `.AppImage` / `.deb` | Ubuntu 20.04+ / Debian / Arch |

**👉 [centrio.me/download](https://centrio.me/download)**

Oppure scarica l'ultima build da [GitHub Releases](https://github.com/ArtemkaFreedom/centrio-app/releases/latest).

---

## Novità — v1.6.76

**Traduzione, screenshot e catalogo rinnovato** *(Maggio 2026)*

- **Traduzione del testo selezionato** — seleziona il testo → tasto destro → Traduci. Overlay istantaneo, senza browser.
- **Strumento screenshot** — cattura la finestra del servizio corrente dalla barra dei menu.
- **Catalogo servizi rinnovato** — categorie, ricerca e aggiunta in un clic.

<details>
<summary>Versioni precedenti</summary>

### v1.6.75
- **AdBlock integrato** — blocca le pubblicità in tutti i servizi senza estensioni
- **Modalità scura forzata** — inietta un tema scuro su qualsiasi sito
- **Comandi slash** (`/add`, `/search`, `/settings`) tramite la palette Ctrl+K
- Ricerca per URL con fallback su DuckDuckGo / Google

### v1.6.74
- **Supporto estensioni Chrome** — installazione dal catalogo (AdBlock, Grammarly, Google Traduttore)
- **Selettore rapido** `Ctrl+K` — passaggio istantaneo a qualsiasi servizio
- DevTools per servizio, gestione personalizzata dei tipi MIME

### v1.6.73
- Bypass CORS/CSP stile Rambox — correzione dei servizi non funzionanti (Notion, Figma, ecc.)
- Flag `allowServiceWorkers` per sessione

</details>

---

## Compilare dai sorgenti

```bash
git clone https://github.com/ArtemkaFreedom/centrio-app.git
cd centrio-app
npm install
cp .env.example .env   # inserisci le credenziali OAuth
```

```bash
npm start              # modalità sviluppo
npm run build:win      # → dist/Centrio Setup x.x.x.exe
npm run build:mac      # → dist/Centrio-x.x.x.dmg
npm run build:linux    # → dist/Centrio-x.x.x.AppImage + .deb
```

**Requisiti:** Node.js 22+, npm 10+

---

## Licenza

MIT © 2026 [Centrio](https://centrio.me)
