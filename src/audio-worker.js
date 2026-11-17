// Screen Trainer — audio worker: keeps sound synthesis off the overlay's animation thread.
'use strict';
importScripts('m4a.js', 'soundmap.js', 'tunes.js', 'audio-core.js');
self.onmessage = (e) => self.AudioCore.handle(e.data, (m, transfer) => self.postMessage(m, transfer || []));
