let mediaRecorder;
let audioChunks = [];
let directoryHandle = null;
let lastSavedData = null;
let currentSongKey = null;
let formatOptions = {
    boldChords: false,
    font: 'Sans',
    transposeSteps: 0,
    columns: 'single',
    fontSize: 'normal',
    lyricsOnlyPdf: false
};
let ws = null;
let isHost = false;
let roomCode = null;

navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
    mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
        audioChunks = [];
        return audioBlob;
    };
}).catch(err => console.error('Microphone access denied:', err));

document.getElementById('pickFolder').addEventListener('click', async () => {
    try {
        directoryHandle = await window.showDirectoryPicker();
        alert('Folder selected! Songs will save there automatically where supported.');
    } catch (err) {
        console.error('Folder picker failed:', err);
        alert('Folder picking not supported or canceled. Using downloads instead.');
    }
});

async function saveFile(filename, data, folderHandle, forceDownload = false) {
    if (folderHandle) {
        try {
            const songFolder = await folderHandle.getDirectoryHandle(filename.split('/')[0], { create: true });
            const fileHandle = await songFolder.getFileHandle(filename.split('/')[1], { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(data);
            await writable.close();
            return true;
        } catch (err) {
            console.error('File save failed:', err);
            return false;
        }
    }
    if (forceDownload) {
        const url = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename.split('/')[1];
        link.click();
        URL.revokeObjectURL(url);
        return true;
    }
    return false;
}

function formatTimestamp(isoString) {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Recording';
    return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function transposeChord(chord, steps) {
    if (!chord.match(/^[A-G](#|b)?[0-9m7dim]*$/i)) return chord;
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const rootMatch = chord.match(/^[A-G](#|b)?/i);
    if (!rootMatch) return chord;
    const root = rootMatch[0].toUpperCase();
    const extension = chord.replace(root, '').toLowerCase() || '';

    const rootIndex = keys.indexOf(root);
    if (rootIndex === -1) return chord;

    let newSteps = Math.min(Math.max(steps, -12), 12);
    const newIndex = (rootIndex + newSteps + 12) % 12;
    const newRoot = keys[newIndex];

    return `${newRoot}${extension}`;
}

function parseChordsAndLyrics(text, options = formatOptions, recognizeChords = true) {
    const lines = text.split('\n');
    let output = '';

    lines.forEach((line, index) => {
        const lineNumber = index + 1;
        if (recognizeChords && lineNumber % 2 === 1) {
            const chords = line.split(/(\s+)/).map(part => {
                if (part.match(/^[A-G](#|b)?[0-9m7dim]*$/i)) {
                    const transposed = options.transposeSteps !== 0 ? transposeChord(part, options.transposeSteps) : part;
                    return `<span class="chord${options.boldChords ? ' bold' : ''}">${transposed}</span>`;
                }
                return part;
            }).join('');
            output += `<div class="chord-line">${chords}</div>`;
        } else {
            output += `<div class="lyric-line">${line}</div>`;
        }
    });

    return output;
}

function setupRecording(button, audioSelect, audioElement, baseKey, deleteBtn) {
    button.addEventListener('click', async () => {
        if (button.textContent.includes('Record')) {
            if (audioSelect.options.length >= 5) {
                alert('Max 5 recordings per section. Delete one to record again.');
                return;
            }
            audioChunks = [];
            mediaRecorder.start();
            button.textContent = 'Stop';
        } else {
            mediaRecorder.stop();
            button.textContent = button.classList.contains('record-btn') ? 'Record Section' : 'Record Full Song';
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const timestamp = new Date().toISOString();
                const audioKey = `${baseKey}-${timestamp}`;
                const audioUrl = URL.createObjectURL(audioBlob);

                await idbKeyval.set(audioKey, audioBlob);
                if (currentSongKey && directoryHandle) {
                    const songTitle = document.getElementById('songTitle').value || 'Untitled';
                    const folderName = currentSongKey.split('-').slice(1).join('-');
                    const fileName = `${folderName}/${audioKey}.webm`;
                    await saveFile(fileName, audioBlob, directoryHandle, false);
                }

                const option = document.createElement('option');
                option.value = audioKey;
                option.textContent = formatTimestamp(timestamp);
                audioSelect.insertBefore(option, audioSelect.firstChild);
                audioSelect.selectedIndex = 0;
                audioElement.src = audioUrl;
                audioElement.style.display = 'block';

                audioSelect.onchange = async () => {
                    const selectedKey = audioSelect.value;
                    const blob = await idbKeyval.get(selectedKey);
                    if (blob) audioElement.src = URL.createObjectURL(blob);
                    else console.error('Blob not found for key:', selectedKey);
                };

                deleteBtn.onclick = async () => {
                    const selectedKey = audioSelect.value;
                    if (selectedKey && confirm('Delete this recording?')) {
                        await idbKeyval.del(selectedKey);
                        audioSelect.remove(audioSelect.selectedIndex);
                        if (audioSelect.options.length > 0) {
                            const newKey = audioSelect.value;
                            const blob = await idbKeyval.get(newKey);
                            if (blob) audioElement.src = URL.createObjectURL(blob);
                            else audioElement.style.display = 'none';
                        } else {
                            audioElement.src = '';
                            audioElement.style.display = 'none';
                        }
                        triggerAutosave();
                    }
                };

                audioChunks = [];
                triggerAutosave();
            };
        }
    });
}

document.querySelectorAll('.section').forEach((section, index) => {
    const btn = section.querySelector('.record-btn');
    const audioSelect = section.querySelector('.audio-select');
    const audio = section.querySelector('.section-audio');
    const deleteBtn = section.querySelector('.delete-audio');
    setupRecording(btn, audioSelect, audio, `section-audio-${index}`, deleteBtn);
});

function setupMoveButtons(section) {
    const upBtn = section.querySelector('.move-up');
    const downBtn = section.querySelector('.move-down');
    const chordToggle = section.querySelector('.chord-recognition-toggle');

    upBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const prevSection = section.previousElementSibling;
        if (prevSection && prevSection.classList.contains('section')) {
            section.parentNode.insertBefore(section, prevSection);
            triggerAutosave();
        }
    });

    downBtn.addEventListener('click', (event) => {
        event.preventDefault();
        const nextSection = section.nextElementSibling;
        if (nextSection && nextSection.classList.contains('section')) {
            section.parentNode.insertBefore(nextSection, section);
            triggerAutosave();
        }
    });

    chordToggle.addEventListener('click', () => {
        const isActive = chordToggle.dataset.active === 'true';
        chordToggle.dataset.active = !isActive;
        chordToggle.classList.toggle('active', !isActive);
        updatePresentation();
    });
}

function setupDeleteSectionButton(section) {
    const deleteBtn = section.querySelector('.delete-section');
    deleteBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to delete this section?')) {
            section.remove();
            triggerAutosave();
        }
    });
}

document.querySelectorAll('.section').forEach(section => {
    setupMoveButtons(section);
    setupDeleteSectionButton(section);
});

document.getElementById('addSection').addEventListener('click', () => {
    const sectionCount = document.querySelectorAll('.section').length;
    const section = document.createElement('div');
    section.classList.add('section');
    section.innerHTML = `
        <div class="section-header">
            <input type="text" class="section-title" placeholder="Section (e.g., Verse ${sectionCount + 1})">
            <button class="delete-section">🗑️</button>
        </div>
        <textarea class="lyrics-chords" placeholder="Lyrics / Chords"></textarea>
        <button class="record-btn">Record Section</button>
        <div class="audio-controls">
            <select class="audio-select"></select>
            <button class="delete-audio">🗑️</button>
        </div>
        <audio controls class="section-audio"></audio>
        <div class="move-buttons">
            <button class="move-up">↑</button>
            <button class="move-down">↓</button>
            <button class="toggle-button chord-recognition-toggle" data-active="true">Recognize chords</button>
            <span class="chords-advisory">Chords are odd-numbered lines</span>
        </div>
    `;
    document.getElementById('sections').appendChild(section);

    const newBtn = section.querySelector('.record-btn');
    const audioSelect = section.querySelector('.audio-select');
    const newAudio = section.querySelector('.section-audio');
    const deleteBtn = section.querySelector('.delete-audio');
    setupRecording(newBtn, audioSelect, newAudio, `section-audio-${sectionCount}`, deleteBtn);
    setupMoveButtons(section);
    setupDeleteSectionButton(section);
    triggerAutosave();
});

const fullRecordBtn = document.getElementById('recordFull');
const fullAudioSelect = document.getElementById('full-audio-select');
const fullAudio = document.getElementById('fullAudio');
const deleteFullAudioBtn = document.getElementById('delete-full-audio');
setupRecording(fullRecordBtn, fullAudioSelect, fullAudio, 'full-song-audio', deleteFullAudioBtn);

async function saveSong(manual = false) {
    const songTitle = document.getElementById('songTitle').value || 'Untitled';
    const timestamp = currentSongKey ? currentSongKey.split('-').slice(2).join('-') : new Date().toISOString().split('T')[0];
    const folderName = `${songTitle}-${timestamp}`;
    currentSongKey = `song-${songTitle}-${timestamp}`;

    formatOptions.boldChords = document.querySelector('.bold-toggle').dataset.active === 'true';
    formatOptions.font = document.querySelector('.format-button.font[data-selected="true"]').dataset.value;
    formatOptions.transposeSteps = parseInt(document.getElementById('transpose-indicator').textContent) || 0;
    formatOptions.columns = document.querySelector('.format-button.columns[data-selected="true"]').dataset.value;
    formatOptions.fontSize = document.getElementById('fontSize').value;

    document.querySelectorAll('.lyrics-chords').forEach(textarea => {
        textarea.style.fontFamily = formatOptions.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif';
    });

    const song = {
        title: songTitle,
        authors: document.getElementById('songAuthors').value,
        sections: Array.from(document.querySelectorAll('.section')).map((section, index) => ({
            title: section.querySelector('.section-title').value,
            text: section.querySelector('.lyrics-chords').value,
            audioKeys: Array.from(section.querySelector('.audio-select').options).map(opt => opt.value),
            recognizeChords: section.querySelector('.chord-recognition-toggle').dataset.active === 'true'
        })),
        fullSongAudioKeys: Array.from(document.getElementById('full-audio-select').options).map(opt => opt.value),
        formatOptions: { ...formatOptions }
    };

    const songString = JSON.stringify(song);
    if (songString === lastSavedData && !manual) return;

    await idbKeyval.set(currentSongKey, songString);
    lastSavedData = songString;

    const textContent = `${song.title}\n${song.authors ? `Authors: ${song.authors}\n` : ''}\n` + song.sections.map(s => `${s.title}\n${s.text}`).join('\n\n');
    const textBlob = new Blob([textContent], { type: 'text/plain' });
    const savedToFolder = await saveFile(`${folderName}/lyrics.txt`, directoryHandle, manual && !directoryHandle);

    if (manual) {
        alert('Song saved!' + (savedToFolder ? ' Check your folder.' : ' Saved to Downloads (no folder selected).'));
    } else {
        showAutosaveFeedback();
    }
    debouncedUpdatePresentation();

    if (isHost && ws && ws.readyState === WebSocket.OPEN) {
        updatePresentation();
        const pdfContent = document.getElementById('presentation-content').innerHTML;
        ws.send(JSON.stringify({ type: 'pdfUpdate', content: pdfContent }));
    }
}

document.getElementById('saveSong').addEventListener('click', () => saveSong(true));

document.getElementById('darkModeToggle').addEventListener('click', () => {
    const body = document.body;
    if (body.classList.contains('light-mode')) {
        body.classList.remove('light-mode');
        body.classList.add('dark-mode');
        localStorage.setItem('theme', 'dark');
        document.getElementById('darkModeToggle').innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a9 9 0 109 9c0-4.97-4.03-9-9-9zm0 16a7 7 0 110-14 7 7 0 010 14z"/>
            </svg>`;
    } else {
        body.classList.remove('dark-mode');
        body.classList.add('light-mode');
        localStorage.setItem('theme', 'light');
        document.getElementById('darkModeToggle').innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a1 1 0 011 1v2a1 1 0 01-2 0V3a1 1 0 011-1zm0 18a1 1 0 011 1v2a1 1 0 01-2 0v-2a1 1 0 011-1zm9.071-9.071a1 1 0 010 1.414l-1.414 1.414a1 1 0 01-1.414-1.414l1.414-1.414a1 1 0 011.414 0zm-18.142 0a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414L2.929 12.071a1 1 0 010-1.414zM19.071 5.757a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414zm-14.242 14.242a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414zM19.071 18.243a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414zm-14.242-14.242a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414z"/>
            </svg>`;
    }
});

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

let debounceTimeout;
function debounceAutosave() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(triggerAutosave, 2000);
}

const debouncedUpdatePresentation = debounce(updatePresentation, 300);

function connectWebSocket(room, isHostFlag) {
    ws = new WebSocket(`ws://localhost:8080?room=${room}`);
    isHost = isHostFlag;

    ws.onopen = () => {
        console.log(`Connected to WebSocket room: ${room}`);
        if (isHost) {
            updatePresentation();
            const pdfContent = document.getElementById('presentation-content').innerHTML;
            ws.send(JSON.stringify({ type: 'pdfUpdate', content: pdfContent }));
        } else {
            document.getElementById('viewer-join').style.display = 'block';
            document.getElementById('viewer-status').textContent = 'Connected';
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'pdfUpdate') {
            if (isHost) {
                document.getElementById('presentation-content').innerHTML = data.content;
            } else {
                document.getElementById('viewer-content').innerHTML = data.content;
            }
        }
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        ws = null;
        if (isHost) isHost = false;
        if (!isHost) document.getElementById('viewer-status').textContent = 'Disconnected';
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        if (!isHost) document.getElementById('viewer-status').textContent = 'Connection failed';
    };
}

document.addEventListener('DOMContentLoaded', () => {
    loadFormatOptions();

    const urlParams = new URLSearchParams(window.location.search);
    const viewData = urlParams.get('view');
    if (viewData) {
        try {
            const song = JSON.parse(decodeURIComponent(atob(viewData)));
            document.body.classList.add('viewer-mode');
            document.getElementById('container').style.display = 'none';
            document.getElementById('viewer-container').style.display = 'block';
            formatOptions = { ...song.formatOptions };

            // Load initial content
            const title = song.title || 'Untitled';
            const authors = song.authors || '';
            const sections = song.sections.map(section => ({
                title: section.title || 'Untitled Section',
                text: parseChordsAndLyrics(section.text, formatOptions, section.recognizeChords)
            }));
            const fontSizeMap = { 'smaller': '0.8em', 'normal': '1em', 'larger': '1.2em' };
            const fontSize = fontSizeMap[formatOptions.fontSize] || '1em';
            document.getElementById('viewer-content').innerHTML = formatOptions.columns === 'two'
                ? `<h2 style="font-size: ${fontSize}">${title}</h2>
                   ${authors ? `<p class="authors" style="font-size: ${fontSize}">${authors}</p>` : ''}
                   <div class="two-column">${splitIntoColumns(sections)}</div>`
                : `<h2 style="font-size: ${fontSize}">${title}</h2>
                   ${authors ? `<p class="authors" style="font-size: ${fontSize}">${authors}</p>` : ''}
                   ${sections.map(s => `<h3 style="font-size: ${fontSize}; font-weight: bold">${s.title}</h3><div class="chord-chart">${s.text}</div>`).join('')}`;

            // Prompt for room code
            roomCode = prompt('Enter the room code your friend gave you to see live updates:');
            if (roomCode) connectWebSocket(roomCode, false);

            document.getElementById('viewer-join').addEventListener('click', () => {
                roomCode = prompt('Enter the room code to reconnect:');
                if (roomCode) connectWebSocket(roomCode, false);
            });
        } catch (err) {
            console.error('Error decoding view data:', err);
            document.getElementById('viewer-content').innerHTML = '<p>Error loading song data</p>';
        }
        return;
    }

    document.getElementById('editor').addEventListener('input', (e) => {
        if (e.target.matches('input, textarea, select')) {
            debounceAutosave();
        }
    }, true);

    document.querySelectorAll('.format-button.columns, .format-button.font').forEach(button => {
        button.addEventListener('click', () => {
            const option = button.classList.contains('columns') ? 'columns' : 'font';
            const value = button.dataset.value;
            if (option) {
                document.querySelectorAll(`.format-button.${option}`).forEach(btn => {
                    btn.dataset.selected = 'false';
                    btn.classList.remove('selected');
                });
                button.dataset.selected = 'true';
                button.classList.add('selected');
                formatOptions[option] = value;
                document.querySelectorAll('.lyrics-chords').forEach(textarea => {
                    textarea.style.fontFamily = formatOptions.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif';
                });
                debouncedUpdatePresentation();
            }
        });
    });

    document.querySelectorAll('.transpose-button').forEach(button => {
        button.addEventListener('click', () => {
            let steps = formatOptions.transposeSteps;
            const direction = button.dataset.direction;
            if (direction === '+') steps = Math.min(steps + 1, 12);
            else if (direction === '-') steps = Math.max(steps - 1, -12);
            formatOptions.transposeSteps = steps;
            document.getElementById('transpose-indicator').textContent = steps === 0 ? '0' : steps > 0 ? `+${steps}` : steps;
            debouncedUpdatePresentation();
        });
    });

    const boldToggle = document.querySelector('.bold-toggle');
    boldToggle.addEventListener('click', () => {
        const isActive = boldToggle.dataset.active === 'true';
        boldToggle.dataset.active = !isActive;
        boldToggle.classList.toggle('active', !isActive);
        formatOptions.boldChords = !isActive;
        debouncedUpdatePresentation();
    });

    document.getElementById('togglePresentation').addEventListener('click', () => {
        const panel = document.getElementById('presentation');
        const sections = document.getElementById('sections');
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            document.getElementById('togglePresentation').textContent = 'Hide';
            sections.style.flex = '1';
        } else {
            panel.classList.add('hidden');
            document.getElementById('togglePresentation').textContent = 'Show';
            sections.style.flex = '2';
        }
    });

    document.getElementById('toggleSongList').addEventListener('click', () => {
        const songList = document.getElementById('songList');
        const toggleBtn = document.getElementById('toggleSongList');
        const editor = document.getElementById('editor');
        if (songList.classList.contains('closed')) {
            songList.classList.remove('closed');
            toggleBtn.classList.add('open');
            editor.style.flex = '3';
        } else {
            songList.classList.add('closed');
            toggleBtn.classList.remove('open');
            editor.style.flex = '9';
        }
    });

    document.getElementById('exportAll').addEventListener('click', async () => {
        const zip = new JSZip();
        const keys = await idbKeyval.keys();
        const songKeys = keys.filter(key => key.startsWith('song-'));
        const audioKeys = keys.filter(key => !key.startsWith('song-'));

        for (const key of songKeys) {
            const songData = await idbKeyval.get(key);
            zip.file(`${key}.json`, songData);
        }
        for (const key of audioKeys) {
            const audioBlob = await idbKeyval.get(key);
            zip.file(`${key}.webm`, audioBlob);
        }

        const content = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `songs-${new Date().toISOString().split('T')[0]}.zip`;
        link.click();
        URL.revokeObjectURL(url);
    });

    document.getElementById('importSongs').addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.zip';
        input.onchange = async (event) => {
            const file = event.target.files[0];
            const zip = await JSZip.loadAsync(file);
            const existingKeys = await idbKeyval.keys();

            for (const [filename, fileData] of Object.entries(zip.files)) {
                const key = filename.replace(/\.(json|webm)$/, '');
                if (existingKeys.includes(key)) {
                    const choice = confirm(`Song or audio "${key}" already exists. Replace or add as new? (OK = Replace, Cancel = Add New)`);
                    if (choice) {
                        await idbKeyval.set(key, await fileData.async(filename.endsWith('.json') ? 'string' : 'blob'));
                    } else {
                        const newKey = `${key}-copy${Math.floor(Math.random() * 1000)}`;
                        await idbKeyval.set(newKey, await fileData.async(filename.endsWith('.json') ? 'string' : 'blob'));
                    }
                } else {
                    await idbKeyval.set(key, await fileData.async(filename.endsWith('.json') ? 'string' : 'blob'));
                }
            }
            updateSongList();
            alert('Songs imported successfully!');
        };
        input.click();
    });

    document.getElementById('shareView').addEventListener('click', () => {
        if (!isHost) {
            roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
            connectWebSocket(roomCode, true);
            alert(`Share this room code with your friends so they can see live updates: ${roomCode}`);
            const song = {
                title: document.getElementById('songTitle').value || 'Untitled',
                authors: document.getElementById('songAuthors').value,
                sections: Array.from(document.querySelectorAll('.section')).map(section => ({
                    title: section.querySelector('.section-title').value,
                    text: section.querySelector('.lyrics-chords').value,
                    recognizeChords: section.querySelector('.chord-recognition-toggle').dataset.active === 'true'
                })),
                formatOptions: { ...formatOptions }
            };
            const encodedSong = btoa(encodeURIComponent(JSON.stringify(song)));
            const shareUrl = `${window.location.origin}${window.location.pathname}?view=${encodedSong}`;
            prompt('Copy this URL too—it gives them the starting song (they’ll need the room code for live updates):', shareUrl);
        } else {
            alert(`You’re already hosting with room code: ${roomCode}`);
        }
    });

    document.querySelectorAll('.lyrics-chords').forEach(textarea => {
        textarea.style.whiteSpace = 'pre-wrap';
    });
});

setInterval(triggerAutosave, 60000);

function triggerAutosave() {
    saveSong(false);
}

function showAutosaveFeedback() {
    let feedback = document.getElementById('autosaveFeedback');
    if (!feedback) {
        feedback = document.createElement('span');
        feedback.id = 'autosaveFeedback';
        feedback.style.color = '#28a745';
        feedback.style.marginLeft = '10px';
        document.getElementById('saveSong').insertAdjacentElement('afterend', feedback);
    }
    feedback.textContent = 'Autosaved!';
    setTimeout(() => feedback.textContent = '', 2000);
}

async function updateSongList() {
    const songItems = document.getElementById('songItems');
    songItems.innerHTML = '';
    const keys = await idbKeyval.keys();
    const songKeys = keys.filter(key => key.startsWith('song-'));
    songKeys.forEach(key => {
        const li = document.createElement('li');
        const songName = key.replace('song-', '');
        li.innerHTML = `
            <span class="song-name">${songName}</span>
            <button class="delete-song" data-key="${key}">🗑️</button>
        `;
        songItems.appendChild(li);

        li.querySelector('.song-name').addEventListener('click', async () => {
            await saveSong(false);
            loadSong(songName);
        });
        li.querySelector('.delete-song').addEventListener('click', async () => {
            if (confirm(`Are you sure you want to delete "${songName}"? This will remove it from the app, but not your computer folder.`)) {
                await idbKeyval.del(key);
                const audioKeys = await idbKeyval.keys();
                const relatedAudioKeys = audioKeys.filter(k => k.startsWith(key.split('song-')[1]));
                for (const audioKey of relatedAudioKeys) {
                    await idbKeyval.del(audioKey);
                }
                updateSongList();
                if (currentSongKey === key) newSong();
            }
        });
    });
}

document.getElementById('newSong').addEventListener('click', () => newSong());

function newSong() {
    currentSongKey = null;
    lastSavedData = null;
    formatOptions.transposeSteps = 0;
    formatOptions.boldChords = false;
    document.getElementById('songTitle').value = '';
    document.getElementById('songAuthors').value = '';
    document.getElementById('sections').innerHTML = `
        <div class="section">
            <div class="section-header">
                <input type="text" class="section-title" placeholder="Section (e.g., Verse)">
                <button class="delete-section">🗑️</button>
            </div>
            <textarea class="lyrics-chords" placeholder="Lyrics / Chords"></textarea>
            <button class="record-btn">Record Section</button>
            <div class="audio-controls">
                <select class="audio-select"></select>
                <button class="delete-audio">🗑️</button>
            </div>
            <audio controls class="section-audio"></audio>
            <div class="move-buttons">
                <button class="move-up">↑</button>
                <button class="move-down">↓</button>
                <button class="toggle-button chord-recognition-toggle" data-active="true">Recognize chords</button>
                <span class="chords-advisory">Chords are odd-numbered lines</span>
            </div>
        </div>
        <div class="section">
            <div class="section-header">
                <input type="text" class="section-title" placeholder="Section (e.g., Chorus)">
                <button class="delete-section">🗑️</button>
            </div>
            <textarea class="lyrics-chords" placeholder="Lyrics / Chords"></textarea>
            <button class="record-btn">Record Section</button>
            <div class="audio-controls">
                <select class="audio-select"></select>
                <button class="delete-audio">🗑️</button>
            </div>
            <audio controls class="section-audio"></audio>
            <div class="move-buttons">
                <button class="move-up">↑</button>
                <button class="move-down">↓</button>
                <button class="toggle-button chord-recognition-toggle" data-active="true">Recognize chords</button>
                <span class="chords-advisory">Chords are odd-numbered lines</span>
            </div>
        </div>
        <div class="section">
            <div class="section-header">
                <input type="text" class="section-title" placeholder="Section (e.g., Bridge)">
                <button class="delete-section">🗑️</button>
            </div>
            <textarea class="lyrics-chords" placeholder="Lyrics / Chords"></textarea>
            <button class="record-btn">Record Section</button>
            <div class="audio-controls">
                <select class="audio-select"></select>
                <button class="delete-audio">🗑️</button>
            </div>
            <audio controls class="section-audio"></audio>
            <div class="move-buttons">
                <button class="move-up">↑</button>
                <button class="move-down">↓</button>
                <button class="toggle-button chord-recognition-toggle" data-active="true">Recognize chords</button>
                <span class="chords-advisory">Chords are odd-numbered lines</span>
            </div>
        </div>
    `;
    document.getElementById('fullAudio').src = '';
    document.getElementById('fullAudio').style.display = 'none';
    document.getElementById('full-audio-select').innerHTML = '';
    document.querySelectorAll('.section').forEach((section, index) => {
        const btn = section.querySelector('.record-btn');
        const audioSelect = section.querySelector('.audio-select');
        const audio = section.querySelector('.section-audio');
        const deleteBtn = section.querySelector('.delete-audio');
        setupRecording(btn, audioSelect, audio, `section-audio-${index}`, deleteBtn);
        setupMoveButtons(section);
        setupDeleteSectionButton(section);
    });
    document.querySelector('.bold-toggle').dataset.active = 'false';
    document.querySelector('.bold-toggle').classList.remove('active');
    document.getElementById('presentation').classList.remove('hidden');
    document.getElementById('togglePresentation').textContent = 'Hide';
    document.getElementById('transpose-indicator').textContent = '0';
    document.querySelectorAll('.lyrics-chords').forEach(textarea => {
        textarea.style.fontFamily = formatOptions.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif';
    });
    debouncedUpdatePresentation();
}

function loadFormatOptions() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.remove('light-mode');
        document.body.classList.add('dark-mode');
        document.getElementById('darkModeToggle').innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3a9 9 0 109 9c0-4.97-4.03-9-9-9zm0 16a7 7 0 110-14 7 7 0 010 14z"/>
            </svg>`;
    } else {
        document.body.classList.remove('dark-mode');
        document.body.classList.add('light-mode');
        document.getElementById('darkModeToggle').innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2a1 1 0 011 1v2a1 1 0 01-2 0V3a1 1 0 011-1zm0 18a1 1 0 011 1v2a1 1 0 01-2 0v-2a1 1 0 011-1zm9.071-9.071a1 1 0 010 1.414l-1.414 1.414a1 1 0 01-1.414-1.414l1.414-1.414a1 1 0 011.414 0zm-18.142 0a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414L2.929 12.071a1 1 0 010-1.414zM19.071 5.757a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414zm-14.242 14.242a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414zM19.071 18.243a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414zm-14.242-14.242a1 1 0 011.414 0l1.414 1.414a1 1 0 01-1.414 1.414l-1.414-1.414a1 1 0 010-1.414z"/>
            </svg>`;
    }
}

updateSongList();

function updatePresentation() {
    const title = document.getElementById('songTitle').value || 'Untitled';
    const authors = document.getElementById('songAuthors').value || '';
    const sections = Array.from(document.querySelectorAll('.section')).map(section => ({
        title: section.querySelector('.section-title').value || 'Untitled Section',
        text: parseChordsAndLyrics(section.querySelector('.lyrics-chords').value, formatOptions, section.querySelector('.chord-recognition-toggle').dataset.active === 'true')
    }));
    
    const fontSizeMap = {
        'smaller': '0.8em',
        'normal': '1em',
        'larger': '1.2em'
    };
    const fontSize = fontSizeMap[formatOptions.fontSize] || '1em';

    const content = document.getElementById('presentation-content');
    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement('div');

    wrapper.innerHTML = formatOptions.columns === 'two'
        ? `<h2 style="font-size: ${fontSize}">${title}</h2>
           ${authors ? `<p class="authors" style="font-size: ${fontSize}">${authors}</p>` : ''}
           <div class="two-column">${splitIntoColumns(sections)}</div>`
        : `<h2 style="font-size: ${fontSize}">${title}</h2>
           ${authors ? `<p class="authors" style="font-size: ${fontSize}">${authors}</p>` : ''}
           ${sections.map(s => `
               <h3 style="font-size: ${fontSize}; font-weight: bold">${s.title}</h3>
               <div class="chord-chart">${s.text}</div>
           `).join('')}`;

    fragment.appendChild(wrapper);
    content.innerHTML = '';
    content.appendChild(fragment);
}

function splitIntoColumns(sections) {
    const pageHeightPx = 792 / 2;
    let column1Content = '';
    let column2Content = '';
    let currentHeight = 0;

    const fontSizeMap = {
        'smaller': '0.8em',
        'normal': '1em',
        'larger': '1.2em'
    };
    const fontSize = fontSizeMap[formatOptions.fontSize] || '1em';

    sections.forEach(section => {
        const sectionHtml = `
            <h3 style="font-size: ${fontSize}; font-weight: bold">${section.title}</h3>
            <div class="chord-chart">${section.text}</div>
        `;
        const temp = document.createElement('div');
        temp.innerHTML = sectionHtml;
        const height = temp.offsetHeight || 100;

        if (currentHeight + height <= pageHeightPx) {
            column1Content += sectionHtml;
            currentHeight += height;
        } else {
            column2Content += sectionHtml;
        }
    });

    return `<div class="column">${column1Content}</div><div class="column">${column2Content || ''}</div>`;
}

document.getElementById('exportPdf').addEventListener('click', () => {
    updatePresentation();
    const element = document.getElementById('presentation-content');
    const opt = {
        margin: 1,
        filename: `${document.getElementById('songTitle').value || 'Untitled'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 1.5 },
        jsPDF: { unit: 'in', format: 'letter', orientation: formatOptions.columns === 'two' ? 'landscape' : 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
});
