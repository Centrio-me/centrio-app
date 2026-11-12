// The name of a chat in MAX's list: the row's first text that holds no other text. A channel keeps an icon beside its
// name, so «the first text with no children» skipped it and took the unread counter for the name (channels showed
// «3», «127» and did not open on a click: the click looks the chat up by that name). An unread counter is never a name.
// Plain ES5 on purpose: it is also put into MAX's page as source (adapters.js).
function maxTitleOf(cell, textOf) {
    var texts = cell.querySelectorAll('.text')
    for (var i = 0; i < texts.length; i++) {
        var el = texts[i]
        if (el.querySelector('.text')) continue
        var title = textOf(el)
        if (!title) continue
        if (/(^|\s)text--20(\s|$)/.test(String(el.className)) && /^\d+$/.test(title)) continue
        return { el: el, title: title }
    }
    return { el: null, title: '' }
}

module.exports = { maxTitleOf }
