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

function connectWebSocket(room, isHostFlag) {
    if (ws) ws.close();

    ws = new WebSocket(`ws://localhost:8080?room=${room}`);
    isHost = isHostFlag;
    roomCode = room;

    ws.onopen = () => {
        console.log(`Connected to WebSocket room: ${room}`);
        document.getElementById('refreshView').style.display = 'block';
        document.getElementById('refreshView').textContent = 'Connected - Viewing';

        if (isHost) {
            updatePresentation();
            sendUpdate();
        }
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'pdfUpdate') {
            document.getElementById('presentation-content').innerHTML = data.content;
            console.log('Updated live view with new content');
        }
    };

    ws.onclose = () => {
        console.warn('WebSocket disconnected');
        document.getElementById('refreshView').textContent = 'Disconnected';
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        document.getElementById('refreshView').textContent = 'Connection failed';
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

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const viewRoom = urlParams.get('view');

    if (viewRoom) {
        connectWebSocket(viewRoom, false);

        // Hide everything except the PDF preview
        document.body.classList.add('viewer-mode');
        document.getElementById('container').style.display = 'none';
        document.getElementById('presentation').style.display = 'block';
    }
});

document.getElementById('exportPdf').addEventListener('click', () => {
    updatePresentation();
    const element = document.getElementById('presentation-content');
    html2pdf().from(element).save(`${document.getElementById('songTitle').value || 'Untitled'}.pdf`);
});
