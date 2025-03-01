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
}).catch(err => console.error('Microphone access denied:', err));

document.getElementById('pickFolder').addEventListener('click', async () => {
    try {
        directoryHandle = await window.showDirectoryPicker();
        alert('Folder selected! Songs will save there automatically.');
    } catch (err) {
        console.error('Folder picker failed:', err);
        alert('Using downloads instead.');
    }
});

document.getElementById('togglePresentation').addEventListener('click', () => {
    const panel = document.getElementById('presentation');
    if (panel.style.display === 'none' || panel.style.display === '') {
        panel.style.display = 'block';
        document.getElementById('togglePresentation').textContent = 'Hide';
    } else {
        panel.style.display = 'none';
        document.getElementById('togglePresentation').textContent = 'Show';
    }
});

document.getElementById('toggleSongList').addEventListener('click', () => {
    const songList = document.getElementById('songList');
    if (songList.classList.contains('closed')) {
        songList.classList.remove('closed');
    } else {
        songList.classList.add('closed');
    }
});

function connectWebSocket(room, isHostFlag) {
    if (ws) ws.close();
    
    ws = new WebSocket(`ws://localhost:8080?room=${room}`);
    isHost = isHostFlag;
    roomCode = room;

    ws.onopen = () => {
        console.log(`Connected to WebSocket room: ${room}`);
        if (isHost) {
            updatePresentation();
            sendUpdate();
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'pdfUpdate') {
            document.getElementById('presentation-content').innerHTML = data.content;
        }
    };
}

function sendUpdate() {
    if (isHost && ws && ws.readyState === WebSocket.OPEN) {
        const pdfContent = document.getElementById('presentation-content').innerHTML;
        ws.send(JSON.stringify({ type: 'pdfUpdate', content: pdfContent }));
    }
}

function updatePresentation() {
    const title = document.getElementById('songTitle').value || 'Untitled';
    const authors = document.getElementById('songAuthors').value || '';
    const sections = Array.from(document.querySelectorAll('.section')).map(section => ({
        title: section.querySelector('.section-title').value || 'Untitled Section',
        text: section.querySelector('.lyrics-chords').value
    }));

    const content = document.getElementById('presentation-content');
    content.innerHTML = `<h2>${title}</h2>
        ${authors ? `<p class="authors">${authors}</p>` : ''}
        ${sections.map(s => `<h3>${s.title}</h3><div>${s.text.replace(/\n/g, '<br>')}</div>`).join('')}`;

    sendUpdate();
}

document.getElementById('shareView').addEventListener('click', () => {
    if (!roomCode) {
        roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        connectWebSocket(roomCode, true);
        alert(`Room created! Share this code: ${roomCode}`);
    }

    const shareUrl = `${window.location.origin}${window.location.pathname}?view=${roomCode}`;
    prompt('Copy this link to share live updates:', shareUrl);
});

document.getElementById('exportPdf').addEventListener('click', () => {
    updatePresentation();
    html2pdf().from(document.getElementById('presentation-content')).save('Song.pdf');
});
