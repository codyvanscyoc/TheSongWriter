let ws = null;
let isHost = false;
let roomCode = null;

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
    const content = document.getElementById('presentation-content');

    content.innerHTML = `<h2>${title}</h2>
        ${authors ? `<p>${authors}</p>` : ''}`;

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
