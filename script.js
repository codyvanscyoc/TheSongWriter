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

document.getElementById('exportPdf').addEventListener('click', () => {
    const element = document.getElementById('presentation-content');
    html2pdf().from(element).save(`${document.getElementById('songTitle').value || 'Untitled'}.pdf`);
});
