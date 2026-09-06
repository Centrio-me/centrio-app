'use strict'

// Flat config (ESLint 9+). This is a baseline lint setup for an existing,
// previously-unlinted codebase — the goal is a usable starting point, not a
// rewrite. Style-only findings are relaxed to warnings (or disabled) so a
// first run doesn't drown in noise; eslint-config-prettier is applied last
// to turn off any formatting-related rules that would otherwise conflict
// with Prettier.

const js = require('@eslint/js')
const globals = require('globals')
const eslintConfigPrettier = require('eslint-config-prettier')

module.exports = [
    {
        // This repository's root is shared with several unrelated,
        // non-Electron projects/scripts (landing site, deploy scripts for
        // other apps, build output, etc). Keep lint scope to build tooling
        // and generated/vendor output out of the way.
        ignores: [
            'node_modules/**',
            'dist/**',
            'dist-*/**',
            'dist-build/**',
            'build/**',
            'out/**',
            '.claude/**',
            '.git/**',
            '.github/**',
            '.kp_gen/**',
            '__pycache__/**',
            'landing/**',
            'telegram-claude/**',
            'server-temp/**',
            'dev/**',
            'climate-theme/**',
            'matkov-theme/**',
            'bundle.js',
            'bundle.js.map',
            'renderer.js.map'
        ]
    },

    js.configs.recommended,

    {
        // Default environment: Electron main process / Node-based tooling
        // scripts. Uses require()/module.exports (CommonJS), no bundler.
        files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: {
                ...globals.node
            }
        },
        rules: {
            // Downgraded to warnings so an existing, never-linted codebase
            // doesn't fail outright on first run. Revisit severity once the
            // backlog of findings has been triaged.
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-undef': 'warn',
            'no-empty': ['warn', { allowEmptyCatch: true }],
            'no-constant-condition': ['warn', { checkLoops: false }]
        }
    },

    {
        // Renderer process + Electron preload scripts: run in a Chromium
        // (webview) context and use browser globals (document, window,
        // navigator, ...) alongside require()/module.exports, so they need
        // both browser and node globals.
        files: ['renderer/**/*.js', 'renderer.js', 'preload.js', 'webview-preload.js'],
        languageOptions: {
            globals: {
                ...globals.browser
            }
        }
    },

    eslintConfigPrettier
]
