const test = require('node:test')
const assert = require('node:assert/strict')
const { wantsHuman } = require('../src/lib/support-handoff')

test('a customer asking for an operator or a person is heard in any language', () => {
    for (const text of [
        'Оператор', 'оператора позовите', 'Поддержка', 'позовите поддержку пожалуйста', 'Соедините с человеком',
        'хочу поговорить с живым человеком', 'дайте специалиста', 'нужен сотрудник поддержки', 'человек!',
        'operator', 'Support please', 'I want to talk to a human', 'real person please', 'live agent',
        'Can I speak to someone from support?', '人工客服', '转人工', '我要找客服', '真人',
        'Operador, por favor', 'Mitarbeiter bitte', 'un opérateur svp', 'оператор потрібен'
    ]) assert.equal(wantsHuman(text), true, text)
})

test('ordinary questions that only mention these words are left to the bot', () => {
    for (const text of [
        'Telegram не открывается', 'Как добавить второй WhatsApp?', 'Спасибо поддержке, всё заработало!',
        'Yes, I turned on the Hong Kong VPN, but Telegram won\'t open.', 'V3.7.3 win11',
        'Сотрудник не видит назначенный мессенджер в TEAM', 'Does Centrio support Linux?',
        'человек в команде не может войти', '', null
    ]) assert.equal(wantsHuman(text), false, String(text))
})
