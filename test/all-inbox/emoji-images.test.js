// Emoji of the messenger itself in our window (owner, 2026-11-12: «мы ведь не свои юзаем эмодзи, а ТГ и других»):
// the picture comes from the messenger's own server, named by the code points
const test = require('node:test')
const assert = require('node:assert')
const { emojiUrl, emojiParts } = require('../../renderer/all-inbox/emoji-images.js')

test('Telegram names its pictures by lowercase code points without the variation selector', () => {
    assert.strictEqual(emojiUrl('😃', 'telegram'), 'https://web.telegram.org/k/assets/img/emoji/1f603.png')
    assert.strictEqual(emojiUrl('❤️', 'telegram'), 'https://web.telegram.org/k/assets/img/emoji/2764.png')
    assert.strictEqual(emojiUrl('👍🏻', 'telegram'), 'https://web.telegram.org/k/assets/img/emoji/1f44d-1f3fb.png')
    assert.strictEqual(emojiUrl('👨‍👩‍👧', 'telegram'), 'https://web.telegram.org/k/assets/img/emoji/1f468-200d-1f469-200d-1f467.png')
})

test('MAX names them in capitals with the size', () => {
    assert.strictEqual(emojiUrl('😃', 'max'), 'https://st.max.ru/emojis/1F603_64.webp')
    assert.strictEqual(emojiUrl('❤️', 'max'), 'https://st.max.ru/emojis/2764_64.webp')
})

test('other messengers keep our own font', () => {
    assert.strictEqual(emojiUrl('😃', 'whatsapp'), '')
    assert.strictEqual(emojiUrl('😃', ''), '')
})

test('text is split into plain pieces and emoji, whole sequences kept together', () => {
    assert.deepStrictEqual(emojiParts('Привет 👋🏽 как дела ❤️!'), [
        { text: 'Привет ' }, { emoji: '👋🏽' }, { text: ' как дела ' }, { emoji: '❤️' }, { text: '!' }
    ])
    assert.deepStrictEqual(emojiParts('просто текст'), [{ text: 'просто текст' }])
    assert.deepStrictEqual(emojiParts(''), [])
})
