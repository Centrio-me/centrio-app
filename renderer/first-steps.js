// "Первые шаги": a small card in the corner with real tasks. Ticks appear by themselves when the person does the thing.
// It can be collapsed or closed at any moment. Only new installs see it (firstStepsActive is set when onboarding ends).
const { CHANGE_EVENT } = require('./milestones')
const { createIcon } = require('./achievement-icons')

const ACTIVE_KEY = 'firstStepsActive'
const COLLAPSED_KEY = 'firstStepsCollapsed'
const PULSE_MS = 6000
// An account this old has seen Centrio already, even on a brand-new computer.
const OLD_ACCOUNT_DAYS = 14

function createFirstSteps({ store, tGet, milestones, cloudStore, cloudApi, openCloudLogin, getServiceCount, requirePro, openAddMessenger }) {
    const STEPS = [
        { id: 'service', done: () => getServiceCount() >= 1, target: '#addMessengerBtn', run: () => openAddMessenger() },
        { id: 'notification', done: () => milestones.has('notification') },
        { id: 'second', done: () => getServiceCount() >= 2, target: '#addMessengerBtn', run: () => openAddMessenger() },
        { id: 'split', done: () => milestones.has('split'), target: '#splitBtn' },
        { id: 'folder', done: () => milestones.has('folder'), target: '#messengerList' },
        { id: 'account', done: () => cloudStore.isLoggedIn(), target: '#cloudBtn', run: () => openCloudLogin() },
    ]

    let card = null
    let claiming = false
    let rewardDone = false

    const isActive = () => !!store.get(ACTIVE_KEY, false)
    const isCollapsed = () => !!store.get(COLLAPSED_KEY, false)
    const doneCount = () => STEPS.filter((step) => step.done()).length

    function close() {
        store.set(ACTIVE_KEY, false)
        card?.remove()
        card = null
    }

    function closeForOldAccount(accountDays) {
        if (isActive() && accountDays >= OLD_ACCOUNT_DAYS) close()
    }

    function pulse(selector) {
        const target = selector && document.querySelector(selector)
        if (!target) return
        target.classList.add('fs-pulse')
        setTimeout(() => target.classList.remove('fs-pulse'), PULSE_MS)
    }

    function button(className, text, onClick) {
        const el = document.createElement('button')
        el.type = 'button'
        el.className = className
        el.textContent = text
        el.addEventListener('click', onClick)
        return el
    }

    async function claim() {
        if (claiming) return
        if (!cloudStore.isLoggedIn()) { openCloudLogin(); return }
        claiming = true
        milestones.reach('first_steps')
        await milestones.sync()
        const result = await cloudApi.claimAchievementReward().catch(() => null)
        claiming = false
        if (result?.success) {
            rewardDone = true
            await cloudApi.refreshUser?.().catch(() => null)
        }
        render(result?.success ? '' : (result?.error || tGet('firstSteps.claimFailed')))
    }

    function renderFinish(body, note) {
        const text = document.createElement('p')
        text.className = 'fs-finish'
        text.textContent = rewardDone ? tGet('firstSteps.rewardDone') : tGet('firstSteps.allDone')
        body.append(text)
        if (note) {
            const error = document.createElement('p')
            error.className = 'fs-error'
            error.textContent = note
            body.append(error)
        }
        body.append(rewardDone
            ? button('lk-btn lk-btn--small', tGet('firstSteps.close'), close)
            : button('lk-btn lk-btn--small', tGet('firstSteps.claim'), claim))
    }

    function renderStep(step) {
        const done = step.done()
        const row = document.createElement('button')
        row.type = 'button'
        row.className = `fs-step${done ? ' is-done' : ''}`
        const mark = document.createElement('span')
        mark.className = 'fs-mark'
        if (done) mark.append(createIcon('check'))
        const copy = document.createElement('span')
        copy.className = 'fs-copy'
        const title = document.createElement('b')
        title.textContent = tGet(`firstSteps.${step.id}Title`)
        const hint = document.createElement('small')
        hint.textContent = tGet(`firstSteps.${step.id}Hint`)
        copy.append(title, hint)
        row.append(mark, copy)
        row.disabled = done
        row.addEventListener('click', () => {
            pulse(step.target)
            step.run?.()
        })
        return row
    }

    function render(note = '') {
        if (!isActive()) return
        if (!card) {
            card = document.createElement('aside')
            card.id = 'firstSteps'
            card.className = 'first-steps'
            document.body.append(card)
        }
        const done = doneCount()
        const allDone = done === STEPS.length
        card.classList.toggle('is-collapsed', isCollapsed())
        card.textContent = ''

        const head = document.createElement('button')
        head.type = 'button'
        head.className = 'fs-head'
        const heading = document.createElement('span')
        heading.textContent = tGet('firstSteps.title')
        const counter = document.createElement('em')
        counter.textContent = `${done}/${STEPS.length}`
        head.append(heading, counter)
        head.addEventListener('click', () => {
            store.set(COLLAPSED_KEY, !isCollapsed())
            render()
        })
        card.append(head)
        if (isCollapsed()) return

        const bar = document.createElement('div')
        bar.className = 'fs-bar'
        const fill = document.createElement('i')
        fill.style.transform = `scaleX(${done / STEPS.length})`
        bar.append(fill)
        const body = document.createElement('div')
        body.className = 'fs-body'
        if (allDone) renderFinish(body, note)
        else {
            const reward = document.createElement('p')
            reward.className = 'fs-reward'
            reward.textContent = tGet('firstSteps.reward')
            body.append(reward, ...STEPS.map(renderStep))
            body.append(button('fs-skip', tGet('firstSteps.skip'), close))
        }
        card.append(bar, body)
    }

    function start() {
        store.set(ACTIVE_KEY, true)
        render()
    }

    document.addEventListener(CHANGE_EVENT, () => render())
    document.addEventListener('cloud-profile-opened', () => render())

    return { render, start, closeForOldAccount, requirePro }
}

module.exports = { createFirstSteps }
