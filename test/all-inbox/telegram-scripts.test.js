const test = require('node:test')
const assert = require('node:assert/strict')
const vm = require('node:vm')
const { chatAdapterFor } = require('../../renderer/all-inbox/chat-adapters')

const tg = chatAdapterFor('telegram')
const parses = (code) => { new vm.Script(code); return true }

test('the page scripts for topics and the words of a voice message are valid JavaScript', () => {
    assert.equal(parses(tg.TOPICS), true)
    assert.equal(parses(tg.OPEN_TOPIC('4294967299')), true)
    assert.equal(parses(tg.OPEN_TOPIC('')), true)
    assert.equal(parses(tg.TRANSCRIBE('21553')), true)
})

test('a topic is opened by a number only, whatever is given', () => {
    assert.ok(tg.OPEN_TOPIC('4294967299').includes('Number("4294967299")'))
    // anything that is not a number reaches the page as a string that turns into no topic, never as code
    const hostile = tg.OPEN_TOPIC('1);alert(1);//')
    assert.equal(parses(hostile), true)
    assert.ok(hostile.includes('Number("1);alert(1);//")'))
})

test('the message asked for transcription is named by its digits only', () => {
    const code = tg.TRANSCRIBE('21553+2')
    assert.ok(code.includes('"215532"'))
    const hostile = tg.TRANSCRIBE('1"];alert(1);//')
    assert.equal(parses(hostile), true)
    assert.ok(hostile.includes('"11"'))
    assert.ok(!hostile.includes('alert(1);//"'))
})

test('the chat read says whether it is a group with topics, and which topic is open', () => {
    assert.ok(tg.CHAT.includes('forum: !!(tgChat'))
    assert.ok(tg.CHAT.includes('topic: inTopic'))
})

test('the words of a voice message are not read twice as the message text', () => {
    assert.ok(tg.CHAT.includes('.audio-transcribed-text'))
})
