let mediaRecorder, audioChunks = [], directoryHandle = null, lastSavedData = null, currentSongKey = null;
let formatOptions = {
    boldChords: false,
    font: 'Sans',
    transposeSteps: 0,
    columns: 'single',
    fontSize: 'normal',
    lyricsOnlyPdf: false
};

navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
        mediaRecorder.onstop = () => new Blob(audioChunks, { type: 'audio/webm' });
    })
    .catch(err => console.error('Microphone access denied:', err));

async function saveFile(filename, data) {
    if (!directoryHandle) return false;
    try {
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
        return true;
    } catch (err) {
        console.error('File save failed:', err);
        return false;
    }
}

function parseChordsAndLyrics(text) {
    return text.split('\n').map((line, index) => {
        if (index % 2 === 0) {
            return `<div class="chord-line">${line}</div>`;
        } else {
            return `<div class="lyric-line">${line}</div>`;
        }
    }).join('');
}

document.getElementById('pickFolder').addEventListener('click', async () => {
    try {
        directoryHandle = await window.showDirectoryPicker();
        alert('Folder selected! Songs will be saved there.');
    } catch {
        alert('Folder picking not supported. Using downloads instead.');
    }
});

document.getElementById('addSection').addEventListener('click', () => {
    const section = document.createElement('div');
    section.classList.add('section');
    section.innerHTML = `
        <div class="section-header">
            <input type="text" class="section-title" placeholder="Section (e.g., Verse)">
            <button class="delete-section">🗑️</button>
        </div>
        <textarea class="lyrics-chords"></textarea>
        <button class="record-btn">Record Section</button>
    `;
    document.getElementById('sections').appendChild(section);
});

document.getElementById('saveSong').addEventListener('click', async () => {
    const song = {
        title: document.getElementById('songTitle').value || 'Untitled',
        authors: document.getElementById('songAuthors').value,
        sections: Array.from(document.querySelectorAll('.section')).map(sec => ({
            title: sec.querySelector('.section-title').value,
            text: sec.querySelector('.lyrics-chords').value
        })),
        formatOptions
    };

    const songData = JSON.stringify(song);
    if (songData === lastSavedData) return;
    await idbKeyval.set(`song-${song.title}`, songData);
    lastSavedData = songData;
});

document.getElementById('exportPdf').addEventListener('click', () => {
    const content = document.getElementById('presentation-content').innerHTML;
    const pdfWindow = window.open('', '_blank');
    pdfWindow.document.write(`<pre>${content}</pre>`);
    pdfWindow.print();
});
