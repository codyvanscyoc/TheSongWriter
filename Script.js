let mediaRecorder;
let audioChunks = [];
let directoryHandle = null;
let lastSavedData = null;
let currentSongKey = null;
let formatOptions = {
    boldChords: false,
    font: 'Sans', // Default to Sans (maps to Helvetica)
    transposeSteps: 0, // Tracks half-step transposition
    columns: 'single',
    fontSize: 'normal',
    lyricsOnlyPdf: false
};

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
    const date = new Date(isoString.replace(/-/g, ':').replace('T', ' ').split('.')[0]);
    return date.toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

function transposeChord(chord, steps) {
    if (!chord.match(/^[A-G](#|b)?[0-9m7dim]*$/i)) return chord; // Skip numbers and non-chord formats
    const keys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const rootMatch = chord.match(/^[A-G](#|b)?/i);
    if (!rootMatch) return chord;
    const root = rootMatch[0].toUpperCase();
    const extension = chord.replace(root, '').toLowerCase() || ''; // e.g., "7", "m", "dim"

    const rootIndex = keys.indexOf(root);
    if (rootIndex === -1) return chord;

    // Shift by steps, handle wrapping (modulo 12), limit to ±12
    let newSteps = steps;
    if (newSteps > 12) newSteps = 12;
    if (newSteps < -12) newSteps = -12;
    const newIndex = (rootIndex + newSteps + 12) % 12; // +12 ensures positive modulo for negative steps
    const newRoot = keys[newIndex];

    return `${newRoot}${extension}`;
}

function parseChordsAndLyrics(text, options = formatOptions, recognizeChords = true) {
    console.log('Parsing text:', text, 'Options:', options, 'Recognize Chords:', recognizeChords); // Debug
    const lines = text.split('\n');
    let output = '';

    lines.forEach((line, index) => {
        const lineNumber = index + 1; // 1-based for user reference
        if (recognizeChords && lineNumber % 2 === 1) { // Odd-numbered lines are chords if recognition is on
            const chords = line.split(' ').map(chord => {
                console.log('Chord or Number:', chord, 'Is Chord:', /^[A-G](#|b)?[0-9m7dim]*$/i.test(chord)); // Debug
                const transposed = options.transposeSteps !== 0 && chord.match(/^[A-G](#|b)?[0-9m7dim]*$/i) 
                    ? transposeChord(chord, options.transposeSteps) 
                    : chord;
                return `<span class="chord${options.boldChords ? ' bold' : ''}" style="font-family: ${options.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif'}; font-size: ${options.fontSize === 'larger' ? '1.2em' : options.fontSize === 'smaller' ? '0.8em' : '1em'}; white-space: pre-wrap;">${transposed}</span>`;
            }).join(' ');
            output += `<div class="chord-line">${chords}</div>`;
        } else { // Even-numbered lines or no chord recognition are lyrics
            output += `<div class="lyric-line" style="font-family: ${options.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif'}; font-size: ${options.fontSize === 'larger' ? '1.2em' : options.fontSize === 'smaller' ? '0.8em' : '1em'}; white-space: pre-wrap;">${line}</div>`;
        }
    });

    return output;
}

function setupRecording(button, audioSelect, audioElement, baseKey, deleteBtn) {
    button.addEventListener('click', async () => {
        if (button.textContent.includes('Record')) {
            audioChunks = [];
            mediaRecorder.start();
            button.textContent = 'Stop';
        } else {
            mediaRecorder.stop();
            button.textContent = button.classList.contains('record-btn') ? 'Record Section' : 'Record Full Song';
            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
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
        updatePresentation(); // Re-render presentation when chord recognition toggles
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
    formatOptions.lyricsOnlyPdf = false; // Removed for now, can be re-added if needed

    // Apply font to editing area
    document.querySelectorAll('.lyrics-chords').forEach(textarea => {
        textarea.style.fontFamily = formatOptions.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif';
    });

    const song = {
        title: songTitle,
        authors: document.getElementById('songAuthors').value,
        sections: Array.from(document.querySelectorAll('.section')).map((section, index) => ({
            title: section.querySelector('.section-title').value,
            text: section.querySelector('.lyrics-chords').value, // Save plain text, no HTML
            audioKeys: Array.from(section.querySelector('.audio-select').options).map(opt => opt.value),
            recognizeChords: section.querySelector('.chord-recognition-toggle').dataset.active === 'true' // Save chord recognition state
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
    const savedToFolder = await saveFile(`${folderName}/lyrics.txt`, textBlob, directoryHandle, manual && !directoryHandle);

    if (manual) {
        alert('Song saved!' + (savedToFolder ? ' Check your folder.' : ' Saved to Downloads (no folder selected).'));
    } else {
        showAutosaveFeedback();
    }
    updatePresentation();
}

document.getElementById('saveSong').addEventListener('click', () => saveSong(true));

document.getElementById('backToList').addEventListener('click', () => {
    saveSong(false);
    updateSongList();
});

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

let debounceTimeout;
function debounceAutosave() {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(triggerAutosave, 2000);
}

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('input, textarea, select').forEach(element => {
        element.addEventListener('input', debounceAutosave);
    });

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
                // Apply font to editing area
                document.querySelectorAll('.lyrics-chords').forEach(textarea => {
                    textarea.style.fontFamily = formatOptions.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif';
                });
                updatePresentation();
            }
        });
    });

    document.querySelectorAll('.transpose-button').forEach(button => {
        button.addEventListener('click', () => {
            let steps = formatOptions.transposeSteps;
            const direction = button.dataset.direction;
            if (direction === '+') {
                steps = Math.min(steps + 1, 12);
            } else if (direction === '-') {
                steps = Math.max(steps - 1, -12);
            }
            formatOptions.transposeSteps = steps;
            document.getElementById('transpose-indicator').textContent = steps === 0 ? '0' : steps > 0 ? `+${steps}` : steps;
            updatePresentation();
        });
    });

    document.querySelector('.bold-toggle').addEventListener('click', () => {
        const isActive = document.querySelector('.bold-toggle').dataset.active === 'true';
        document.querySelector('.bold-toggle').dataset.active = !isActive;
        document.querySelector('.bold-toggle').classList.toggle('active', !isActive);
        formatOptions.boldChords = !isActive;
        updatePresentation();
    });

    document.getElementById('togglePresentation').addEventListener('click', () => {
        const panel = document.getElementById('presentation');
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
            document.getElementById('togglePresentation').textContent = 'Hide';
            document.getElementById('sections').style.flex = '1'; // 50% when panel is visible
        } else {
            panel.style.display = 'none';
            document.getElementById('togglePresentation').textContent = 'Show';
            document.getElementById('sections').style.flex = '9'; // Expand to 90% when hidden
        }
    });

    // Initialize shading for chord lines in editing area with CSS
    document.querySelectorAll('.lyrics-chords').forEach(textarea => {
        textarea.style.whiteSpace = 'pre-wrap'; // Ensure line breaks are preserved
    });
});

setInterval(triggerAutosave, 30000);

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

        li.querySelector('.song-name').addEventListener('click', () => loadSong(songName));
        li.querySelector('.delete-song').addEventListener('click', async () => {
            if (confirm(`Are you sure you want to delete "${songName}"? This will remove it from the app, but not your computer folder.`)) {
                await idbKeyval.del(key);
                const audioKeys = await idbKeyval.keys();
                const relatedAudioKeys = audioKeys.filter(k => k.startsWith(key.split('song-')[1]));
                for (const audioKey of relatedAudioKeys) {
                    await idbKeyval.del(audioKey);
                }
                updateSongList();
            }
        });
    });
    document.getElementById('songList').style.display = 'block';
    document.getElementById('editor').style.display = 'none';
}

document.getElementById('newSong').addEventListener('click', () => {
    currentSongKey = null;
    lastSavedData = null;
    formatOptions.transposeSteps = 0; // Reset transposition on new song
    formatOptions.boldChords = false; // Reset bold state
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
    document.querySelector('.bold-toggle').dataset.active = 'false'; // Reset bold toggle to off
    document.querySelector('.bold-toggle').classList.remove('active');
    document.getElementById('songList').style.display = 'none';
    document.getElementById('editor').style.display = 'block';
    document.getElementById('presentation').style.display = 'block';
    document.getElementById('togglePresentation').textContent = 'Hide';
    document.getElementById('sections').style.flex = '1'; // 50/50 split initially
    document.getElementById('transpose-indicator').textContent = '0'; // Reset transpose indicator
    // Apply default font to editing area
    document.querySelectorAll('.lyrics-chords').forEach(textarea => {
        textarea.style.fontFamily = formatOptions.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif';
    });
    updatePresentation();
    loadFormatOptions();
});

async function loadSong(title) {
    const songData = await idbKeyval.get(`song-${title}`);
    if (songData) {
        currentSongKey = `song-${title}`;
        const song = JSON.parse(songData);
        document.getElementById('songTitle').value = song.title;
        document.getElementById('songAuthors').value = song.authors || '';

        const sectionsDiv = document.getElementById('sections');
        sectionsDiv.innerHTML = '';
        song.sections.forEach(async (section, index) => {
            const sectionDiv = document.createElement('div');
            sectionDiv.classList.add('section');
            sectionDiv.innerHTML = `
                <div class="section-header">
                    <input type="text" class="section-title" value="${section.title}" placeholder="Section (e.g., Verse)">
                    <button class="delete-section">🗑️</button>
                </div>
                <textarea class="lyrics-chords" placeholder="Lyrics / Chords">${section.text}</textarea>
                <button class="record-btn">Record Section</button>
                <div class="audio-controls">
                    <select class="audio-select"></select>
                    <button class="delete-audio">🗑️</button>
                </div>
                <audio controls class="section-audio"></audio>
                <div class="move-buttons">
                    <button class="move-up">↑</button>
                    <button class="move-down">↓</button>
                    <button class="toggle-button chord-recognition-toggle" data-active="${section.recognizeChords}">Recognize chords</button>
                </div>
            `;
            sectionsDiv.appendChild(sectionDiv);

            const btn = sectionDiv.querySelector('.record-btn');
            const audioSelect = sectionDiv.querySelector('.audio-select');
            const audio = sectionDiv.querySelector('.section-audio');
            const deleteBtn = sectionDiv.querySelector('.delete-audio');
            setupRecording(btn, audioSelect, audio, `section-audio-${index}`, deleteBtn);
            setupMoveButtons(sectionDiv);
            setupDeleteSectionButton(sectionDiv);

            section.audioKeys.forEach(audioKey => {
                const option = document.createElement('option');
                option.value = audioKey;
                option.textContent = formatTimestamp(audioKey.split('-').slice(-1)[0].replace(/-/g, ':').replace('T', ' ').split('.')[0]);
                audioSelect.appendChild(option);
            });
            if (section.audioKeys.length > 0) {
                audioSelect.selectedIndex = 0;
                const latestKey = section.audioKeys[0];
                const blob = await idbKeyval.get(latestKey);
                if (blob) {
                    audio.src = URL.createObjectURL(blob);
                    audio.style.display = 'block';
                }
                audioSelect.onchange = async () => {
                    const selectedKey = audioSelect.value;
                    const blob = await idbKeyval.get(selectedKey);
                    if (blob) audio.src = URL.createObjectURL(blob);
                };
            }
            // Apply toggle button state
            const chordToggle = sectionDiv.querySelector('.chord-recognition-toggle');
            chordToggle.classList.toggle('active', section.recognizeChords);
        });

        const fullAudioSelect = document.getElementById('full-audio-select');
        fullAudioSelect.innerHTML = '';
        song.fullSongAudioKeys.forEach(audioKey => {
            const option = document.createElement('option');
            option.value = audioKey;
            option.textContent = formatTimestamp(audioKey.split('-').slice(-1)[0].replace(/-/g, ':').replace('T', ' ').split('.')[0]);
            fullAudioSelect.appendChild(option);
        });
        if (song.fullSongAudioKeys.length > 0) {
            fullAudioSelect.selectedIndex = 0;
            const latestKey = song.fullSongAudioKeys[0];
            const blob = await idbKeyval.get(latestKey);
            if (blob) {
                fullAudio.src = URL.createObjectURL(blob);
                fullAudio.style.display = 'block';
            }
            fullAudioSelect.onchange = async () => {
                const selectedKey = fullAudioSelect.value;
                const blob = await idbKeyval.get(selectedKey);
                if (blob) fullAudio.src = URL.createObjectURL(blob);
            };
        }

        document.getElementById('songList').style.display = 'none';
        document.getElementById('editor').style.display = 'block';
        document.getElementById('presentation').style.display = 'block';
        document.getElementById('togglePresentation').textContent = 'Hide';
        document.getElementById('sections').style.flex = '1'; // 50/50 split initially
        if (song.formatOptions) {
            formatOptions = song.formatOptions;
            document.querySelector('.bold-toggle').dataset.active = formatOptions.boldChords;
            document.querySelector('.bold-toggle').classList.toggle('active', formatOptions.boldChords);
            document.querySelector(`.format-button.font[data-value="${formatOptions.font}"]`).dataset.selected = 'true';
            document.querySelector(`.format-button.font[data-value="${formatOptions.font}"]`).classList.add('selected');
            document.querySelector(`.format-button.columns[data-value="${formatOptions.columns}"]`).dataset.selected = 'true';
            document.querySelector(`.format-button.columns[data-value="${formatOptions.columns}"]`).classList.add('selected');
            formatOptions.transposeSteps = song.formatOptions.transposeSteps || 0;
            document.getElementById('transpose-indicator').textContent = formatOptions.transposeSteps === 0 ? '0' : formatOptions.transposeSteps > 0 ? `+${formatOptions.transposeSteps}` : formatOptions.transposeSteps;
            document.getElementById('fontSize').value = formatOptions.fontSize;
            // Apply font to editing area on load
            document.querySelectorAll('.lyrics-chords').forEach(textarea => {
                textarea.style.fontFamily = formatOptions.font === 'Serif' ? 'Courier New, monospace' : 'Helvetica, sans-serif';
            });
            // document.getElementById('lyricsOnlyPdf').checked = formatOptions.lyricsOnlyPdf; // Removed
        }
        lastSavedData = JSON.stringify(song);
        updatePresentation();
    }
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

    const content = document.getElementById('presentation-content');
    if (formatOptions.columns === 'two') {
        // Estimate standard page height (letter size, 11 inches at 72 DPI = 792px, adjusted for scale)
        const pageHeightPx = 792 / 2; // Adjust for html2pdf scale: 2
        let column1Content = '';
        let column2Content = '';
        let totalHeight = 0;
        let currentHeight = 0;

        sections.forEach(section => {
            const sectionHtml = `
                <h3 style="font-size: ${formatOptions.fontSize === 'larger' ? '1.2em' : formatOptions.fontSize === 'smaller' ? '0.8em' : '1em'}; font-weight: bold">${section.title}</h3>
                <div class="chord-chart">${section.text}</div>
            `;
            const temp = document.createElement('div');
            temp.innerHTML = sectionHtml;
            const height = temp.offsetHeight || 100; // Default to 100 if height can't be calculated

            if (currentHeight + height <= pageHeightPx) {
                column1Content += sectionHtml;
                currentHeight += height;
            } else {
                column2Content += sectionHtml;
                totalHeight += height;
            }
        });

        content.innerHTML = `
            <h2 style="font-size: ${formatOptions.fontSize === 'larger' ? '1.2em' : formatOptions.fontSize === 'smaller' ? '0.8em' : '1em'}">${title}</h2>
            ${authors ? `<p class="authors" style="font-size: ${formatOptions.fontSize === 'larger' ? '1.2em' : formatOptions.fontSize === 'smaller' ? '0.8em' : '1em'}">${authors}</p>` : ''}
            <div class="two-column">
                <div class="column">${column1Content}</div>
                <div class="column">${column2Content || ''}</div>
            </div>
        `;
    } else {
        content.innerHTML = `
            <h2 style="font-size: ${formatOptions.fontSize === 'larger' ? '1.2em' : formatOptions.fontSize === 'smaller' ? '0.8em' : '1em'}">${title}</h2>
            ${authors ? `<p class="authors" style="font-size: ${formatOptions.fontSize === 'larger' ? '1.2em' : formatOptions.fontSize === 'smaller' ? '0.8em' : '1em'}">${authors}</p>` : ''}
            ${sections.map(s => `
                <h3 style="font-size: ${formatOptions.fontSize === 'larger' ? '1.2em' : formatOptions.fontSize === 'smaller' ? '0.8em' : '1em'}; font-weight: bold">${s.title}</h3>
                <div class="chord-chart">${s.text}</div>
            `).join('')}
        `;
    }
}

document.getElementById('exportPdf').addEventListener('click', () => {
    updatePresentation(); // Ensure latest format options are applied
    const element = document.getElementById('presentation-content');
    const opt = {
        margin: 1,
        filename: `${document.getElementById('songTitle').value || 'Untitled'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: formatOptions.columns === 'two' ? 'landscape' : 'portrait' }
    };
    html2pdf().from(element).set(opt).save();
});