# Image saving check (release gate)

A page with every kind of picture messengers use (same site, another site with and without CORS, blob, canvas, data:,
CSS background, a frame of another site, a layer on top, a picture that needs the tab's cookie, a big one, a name that lies
about its type) and a script that saves each of them through the real menu of the app.

1. `node fixture-server.js` (ports 38501 and 38502)
2. start the test copy: `electron . --user-data-dir=<profile> --remote-debugging-port=9333`, make its window visible
3. in that copy: «Не спрашивать, куда сохранять» on and the folder `C:/tmp/img-save-test` (the script reads files from there)
4. `node save-fixture.js "<a sidebar tab name>"` — every line must say `saved … content=PNG`

Run it five times in a row before a release that touches saving or the page menu: 65 of 65 is the bar.
