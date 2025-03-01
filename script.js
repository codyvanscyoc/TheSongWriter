const socket = io();
const songEditor = document.getElementById('sections');
const previewContent = document.getElementById('previewContent');
const songTitle = document.getElementById('songTitle');
const songAuthors = document.getElementById('songAuthors');

// Local Database
let savedSongs = JSON.parse(localStorage.getItem("songs")) || [];

// Add New Section
document.getElementById('addSection').addEventListener('click', () => {
    const section = document.createElement('div');
    section.classList.add('section');
    section.innerHTML = `
        <input type="text" class="section-title" placeholder="Section (e.g., Verse)">
        <textarea class="lyrics-chords" placeholder="Lyrics / Chords"></textarea>
        <button class="delete-section">🗑️</button>
    `;
    document.getElementById('sections').appendChild(section);
    setupSectionControls(section);
});

// Set Up Section Controls
function setupSectionControls(section) {
    section.querySelector('.delete-section').addEventListener('click', () => {
        section.remove();
        updateSong();
    });

    section.querySelector('.lyrics-chords').addEventListener('input', updateSong);
}

// Update Live Preview & Database
function updateSong() {
    const songData = {
        title: songTitle.value,
        authors: songAuthors.value,
        sections: Array.from(document.querySelectorAll('.section')).map(sec => ({
            title: sec.querySelector('.section-title').value,
            text: sec.querySelector('.lyrics-chords').value,
        }))
    };

    socket.emit('updateSong', songData);
    localStorage.setItem("songs", JSON.stringify(savedSongs));
    updatePreview(songData);
}

// Update Live View
function updatePreview(data) {
    previewContent.innerHTML = `<h3>${data.title}</h3><p>${data.authors}</p>` +
        data.sections.map(sec => `<h4>${sec.title}</h4><pre>${sec.text}</pre>`).join('');
}

// Listen for Updates
socket.on('songUpdate', (data) => {
    songTitle.value = data.title;
    songAuthors.value = data.authors;
    document.getElementById('sections').innerHTML = "";
    data.sections.forEach(sec => {
        const section = document.createElement('div');
        section.classList.add('section');
        section.innerHTML = `
            <input type="text" class="section-title" value="${sec.title}">
            <textarea class="lyrics-chords">${sec.text}</textarea>
            <button class="delete-section">🗑️</button>
        `;
        document.getElementById('sections').appendChild(section);
        setupSectionControls(section);
    });
    updatePreview(data);
});

// Share View - Room Code Prompt
document.getElementById('shareView').addEventListener('click', () => {
    const roomCode = prompt('Enter a room code to start a live session:');
    if (roomCode) {
        socket.emit('joinRoom', roomCode);
        alert(`Share this room code: ${roomCode}`);
    }
});

// Export PDF
document.getElementById('exportPdf').addEventListener('click', () => {
    const content = previewContent.innerHTML;
    const pdfWindow = window.open('', '_blank');
    pdfWindow.document.write(`<pre>${content}</pre>`);
    pdfWindow.print();
});
