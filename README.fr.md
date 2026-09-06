<div align="center">
  <img src="assets/logo.png" width="96" height="96" alt="Centrio" />

  <h1>Centrio</h1>

  <p><strong>Tous vos messagers. Une seule fenêtre.</strong></p>

  <p>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases/latest">
      <img src="https://img.shields.io/github/v/release/ArtemkaFreedom/centrio-app?label=version&color=6d28d9&style=flat-square" alt="Dernière version" />
    </a>
    <a href="https://github.com/ArtemkaFreedom/centrio-app/releases">
      <img src="https://img.shields.io/github/downloads/ArtemkaFreedom/centrio-app/total?color=3b82f6&style=flat-square&label=téléchargements" alt="Téléchargements" />
    </a>
    <img src="https://img.shields.io/badge/plateformes-Windows%20%7C%20macOS%20%7C%20Linux-8b5cf6?style=flat-square" alt="Plateformes" />
    <img src="https://img.shields.io/badge/licence-MIT-22c55e?style=flat-square" alt="Licence" />
  </p>

  <p>
    <a href="https://centrio.me">🌐 Site web</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/download">📥 Télécharger</a>
    &nbsp;·&nbsp;
    <a href="https://centrio.me/faq">❓ FAQ</a>
    &nbsp;·&nbsp;
    <a href="mailto:support@centrio.me">💬 Support</a>
  </p>

  <p>
    <a href="README.md">English</a> · <a href="README.ru.md">Русский</a> · <a href="README.zh.md">中文</a> · <b>Français</b> · <a href="README.it.md">Italiano</a>
  </p>


</div>

---

## Pourquoi Centrio ?

Telegram dans une fenêtre, WhatsApp dans une autre, Discord dans une troisième. Gmail dans un onglet de navigateur. Notion quelque part. Slack qui sonne en arrière-plan.

**Centrio regroupe tout en un seul endroit** — une application de bureau où chaque service a son propre onglet, les notifications sont centralisées, et on peut enfin fermer ces 14 onglets de navigateur.

---

## Fonctionnalités

### 100+ services, une barre latérale

Telegram · WhatsApp · Discord · VK · Slack · Notion · Gmail · Signal · Zoom · WeChat · LINE · Figma · Jira · et n'importe quel site ajouté manuellement.

### VPN intégré

Aucune application tierce nécessaire. Importez un lien de configuration et connectez-vous en un clic.

| Protocole | Format d'import |
|-----------|----------------|
| VLESS | `vless://...` |
| VMess | `vmess://...` |
| Trojan | `trojan://...` |
| Shadowsocks | `ss://...` |
| Hysteria2 | `hy2://...` |
| Abonnement | URL avec liste de configs |

Indicateur de ping (vert / jaune / rouge), drapeau du pays, minuteur de connexion, routage du trafic pour toutes les sessions.

### Extensions Chrome

Installez AdBlock, Grammarly, Traducteur et d'autres extensions directement dans Centrio — sans navigateur séparé. *(Pro)*

### Gratuit et Pro

| Fonctionnalité | Gratuit | Pro |
|----------------|:-------:|:---:|
| Services de messagerie | ✅ illimité | ✅ illimité |
| VPN intégré | ✅ | ✅ |
| AdBlock | ✅ | ✅ |
| Extensions Chrome | — | ✅ |
| Dossiers et groupes | — | ✅ |
| Synchronisation cloud | — | ✅ |
| Support prioritaire | — | ✅ |

### Tout le reste

- 🔔 **Notifications intelligentes** — muet par service, mode Ne pas déranger, sons personnalisés
- 📌 **Verrouillage PIN** — verrouillage automatique avec délai configurable
- 🎨 **Thèmes** — sombre, clair, suivre le système
- 🌍 **5 langues** — Français, English, Русский, 中文, Italiano
- ⌨️ **Raccourcis clavier** — `Ctrl+,` paramètres, `Ctrl+K` recherche rapide
- 🔄 **Mise à jour automatique** — mises à jour silencieuses en arrière-plan

---

## Télécharger

| Plateforme | Fichier | Configuration requise |
|------------|---------|----------------------|
| **Windows** | Installateur `.exe` NSIS | Windows 10/11 · x64 |
| **macOS** | Image disque `.dmg` | macOS 12 Monterey+ · x64 |
| **Linux** | `.AppImage` / `.deb` | Ubuntu 20.04+ / Debian / Arch |

**👉 [centrio.me/download](https://centrio.me/download)**

Ou téléchargez la dernière version depuis [GitHub Releases](https://github.com/ArtemkaFreedom/centrio-app/releases/latest).

---

## Nouveautés — v1.6.76

**Traduction, capture d'écran et catalogue refondu** *(Mai 2026)*

- **Traduction du texte sélectionné** — sélectionnez du texte → clic droit → Traduire. Superposition instantanée, sans navigateur.
- **Outil de capture d'écran** — capturez la fenêtre du service actuel depuis la barre de menu.
- **Catalogue de services refondu** — catégories, recherche et ajout en un clic.

<details>
<summary>Versions précédentes</summary>

### v1.6.75
- **AdBlock intégré** — bloque les publicités dans tous les services sans extensions
- **Mode sombre forcé** — injecter un thème sombre sur n'importe quel site
- **Commandes slash** (`/add`, `/search`, `/settings`) via la palette Ctrl+K
- Recherche par URL avec repli sur DuckDuckGo / Google

### v1.6.74
- **Support des extensions Chrome** — installation depuis un catalogue (AdBlock, Grammarly, Traducteur)
- **Sélecteur rapide** `Ctrl+K` — passage instantané à n'importe quel service
- DevTools par service, gestion personnalisée des types MIME

### v1.6.73
- Contournement CORS/CSP à la Rambox — correction des services défaillants (Notion, Figma, etc.)
- Indicateur `allowServiceWorkers` par session

</details>

---

## Compiler depuis les sources

```bash
git clone https://github.com/ArtemkaFreedom/centrio-app.git
cd centrio-app
npm install
cp .env.example .env   # remplissez vos identifiants OAuth
```

```bash
npm start              # mode développement
npm run build:win      # → dist/Centrio Setup x.x.x.exe
npm run build:mac      # → dist/Centrio-x.x.x.dmg
npm run build:linux    # → dist/Centrio-x.x.x.AppImage + .deb
```

**Prérequis :** Node.js 22+, npm 10+

---

## Licence

MIT © 2026 [Centrio](https://centrio.me)
