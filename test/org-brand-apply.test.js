const test = require('node:test')
const assert = require('node:assert/strict')
const { applyBrandName } = require('../renderer/org-branding')

// a very small stand-in for the page: elements with the few things applyBrandName touches
function fakePage(defaultTitle = 'Centrio') {
    const mk = (cls, html) => {
        const attrs = new Map()
        const classes = new Set(cls.split(' '))
        return {
            innerHTML: html,
            textContent: 'Centrio',
            classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
            hasAttribute: (k) => attrs.has(k),
            getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
            setAttribute: (k, v) => attrs.set(k, v),
            removeAttribute: (k) => attrs.delete(k),
            classes
        }
    }
    const els = [mk('app-name', 'Centrio<span class="brand-period"></span>'), mk('about-name', 'Centrio<span class="brand-period"></span>'), mk('sp-word', 'Centrio<span class="brand-period"></span>')]
    return { els, title: defaultTitle, querySelectorAll: () => els }
}

test('the team name replaces Centrio in every place the program writes its name, and the title of the window', () => {
    const doc = fakePage()
    applyBrandName('  ООО   Ромашка ', doc)
    for (const el of doc.els) {
        assert.equal(el.textContent, 'ООО Ромашка')
        assert.ok(el.classes.has('is-team-name'))
        assert.equal(el.getAttribute('title'), 'ООО Ромашка')
    }
    assert.equal(doc.title, 'ООО Ромашка')
})

test('an empty name or one with nothing to show brings back «Centrio» with its dot', () => {
    const doc = fakePage()
    applyBrandName('Моя команда', doc)
    applyBrandName('   ', doc)
    for (const el of doc.els) {
        assert.equal(el.innerHTML, 'Centrio<span class="brand-period"></span>')
        assert.ok(!el.classes.has('is-team-name'))
        assert.equal(el.getAttribute('title'), null)
    }
    assert.equal(doc.title, 'Centrio')
})

test('a very long or odd name is cut and cleaned before it reaches the page', () => {
    const doc = fakePage()
    applyBrandName('Ю'.repeat(80) + '<script>', doc)
    assert.equal(Array.from(doc.els[0].textContent).length, 24)
    assert.ok(!doc.els[0].textContent.includes('<'))
})

test('the name given twice or changed is applied each time, the first look of the page is what comes back', () => {
    const doc = fakePage()
    applyBrandName('Первое', doc)
    applyBrandName('Второе', doc)
    assert.equal(doc.els[0].textContent, 'Второе')
    applyBrandName('', doc)
    assert.equal(doc.els[0].innerHTML, 'Centrio<span class="brand-period"></span>')
})
