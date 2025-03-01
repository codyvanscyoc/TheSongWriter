const socket = io();
const songEditor = document.getElementById('songEditor');
const previewContent = document.getElementById('previewContent');
const songTitle = document.getElementById('songTitle');

// Sync content with WebSocket
songEditor.addEventListener('input', () => {
    const songData = { title: songTitle.value, content: songEditor.value };
    socket.emit('updateSong', songData);
    updatePreview(songData);
});

// Update preview area
function updatePreview(data) {
    previewContent.innerHTML = `<h3>${data.title}</h3><pre>${data.content}</pre>`;
}

// Listen for live updates
socket.on('songUpdate', (data) => {
    songEditor.value = data.content;
    songTitle.value = data.title;
    updatePreview(data);
});

// Export to PDF
document.getElementById('exportPdf').addEventListener('click', () => {
    const content = previewContent.innerHTML;
    const pdfWindow = window.open('', '_blank');
    pdfWindow.document.write(`<pre>${content}</pre>`);
    pdfWindow.print();
});
