function createMessengerSoundUiApi({ requirePro } = {}) {
    function openMessengerSoundModal(messengerId, getMessengerById) {
        if (requirePro && !requirePro('sound')) return

        const messenger = getMessengerById(messengerId)
        if (!messenger) return

        // A sound of an older version (no longer in the list) shows as 'default', which is also what plays.
        const items = [...document.querySelectorAll('#messengerSoundList .sound-item')]
        const saved = messenger.notifSound || '__default__'
        const current = items.some(item => item.dataset.msound === saved) ? saved : '__default__'
        items.forEach(item => {
            item.classList.toggle('active', item.dataset.msound === current)
        })

        document.getElementById('messengerSoundModal').classList.add('show')
    }

    return {
        openMessengerSoundModal
    }
}

module.exports = {
    createMessengerSoundUiApi
}