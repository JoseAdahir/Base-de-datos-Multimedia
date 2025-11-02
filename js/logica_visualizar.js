const player = document.getElementById('videoPlayer');
const params = new URLSearchParams(window.location.search);
const videoFilename = params.get('video');

console.log('Video a reproducir:', videoFilename);

if (videoFilename) {
    const source = document.createElement('source');
    source.src = `/mongo-video/${videoFilename}`;
    source.type = 'video/mp4';
    
    player.appendChild(source);
    player.load();
    
    player.play().catch(err => {
    console.error('Error al reproducir:', err);
    document.body.innerHTML += '<p style="color:red;">Error al reproducir el video. Asegúrate de que el servidor esté corriendo.</p>';
    });
} else {
    document.body.innerHTML += '<p style="color:red;">No se especificó un video para reproducir</p>';
}