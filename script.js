const socket = io();
const songEditor = document.getElementById('songEditor');
const previewContent = document.getElementById('previewContent');
const songTitle = document.getElementById('songTitle');

// Emit updates when user types
songEditor.addEventListener('input', () => {
    const songData = { title: songTitle.value, content: songEditor.value };
    socket.emit('updateSong', songData);
    updatePreview(songData);
});

// Update preview
function updatePreview(data) {
    previewContent.innerHTML = `<h3>${data.title}</h3><pre>${data.content}</pre>`;
}

// Listen for real-time updates
socket.on('songUpdate', (data) => {
    if (data) {
        songEditor.value = data.content;
        songTitle.value = data.title;
        updatePreview(data);
    }
});

// Share View - Room Code Prompt
document.getElementById('shareView').addEventListener('click', () => {
    const roomCode = prompt('Enter a room code to start a live session:');
    if (roomCode) {
        socket.emit('joinRoom', roomCode);
        alert(`Share this room code: ${roomCode}`);
    }
});

// Listen for room join confirmation
socket.on('roomJoined', (roomCode) => {
    console.log(`Joined room: ${roomCode}`);
});

// Font Selection (Affects Both Editor & Preview)
document.querySelectorAll('.format-button.font').forEach(button => {
    button.addEventListener('click', () => {
        const font = button.dataset.value;
        
        // Apply the font to the editor and preview
        document.getElementById('songEditor').style.fontFamily = font === 'Serif' ? 'Georgia, serif' : 'Arial, sans-serif';
        document.getElementById('previewContent').style.fontFamily = font === 'Serif' ? 'Georgia, serif' : 'Arial, sans-serif';

        // Mark selected button
        document.querySelectorAll('.format-button.font').forEach(btn => btn.dataset.selected = "false");
        button.dataset.selected = "true";
    });
});

// Export to PDF
document.getElementById('exportPdf').addEventListener('click', () => {
    const content = previewContent.innerHTML;
    const pdfWindow = window.open('', '_blank');
    pdfWindow.document.write(`<pre>${content}</pre>`);
    pdfWindow.print();
});
