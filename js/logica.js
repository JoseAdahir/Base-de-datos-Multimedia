const fileInput = document.getElementById('file');
const statusEl = document.getElementById('status');
//const player = document.getElementById('player');

document.getElementById('uploadBtn').onclick = async () => {
    const file = fileInput.files?.[0];
    if (!file) return alert('Selecciona un archivo');

    const form = new FormData();
    form.append('file', file);

    statusEl.textContent = 'Subiendo...';
    const res = await fetch('/upload', { method: 'POST', body: form });
    const data = await res.json();

    if (!res.ok) {
    statusEl.textContent = data.error || 'Error';
    return;
    }


    statusEl.textContent = 'Listo';
    // apunta el reproductor al endpoint de streaming (usar el videoId, no fileId)
    //player.src = `/videos/${data.videoId}/streaming`;
    //player.load();
    //player.play();
    };
    document.addEventListener('DOMContentLoaded', () => {
    const videosList = document.getElementById('videosList');
    

    // Cargar videos al iniciar
    loadVideos();

    
    // Cargar lista de videos
    async function loadVideos() {
        try {
        const response = await fetch('/listar-videos');
        console.log(`✅ Response status: ${response.status}`);
        const data = await response.json();
        console.log(`✅ Response data:`, data);

        videosList.innerHTML = '';

        if (data.length === 0) {
            videosList.innerHTML = '<p style="text-align:center; color:#666;">No hay videos disponibles. Sube uno primero.</p>';
            return;
        }

        data.forEach(video => {
            const videoCard = document.createElement('div');

            console.log(video.filename);
            videoCard.className = 'video-card';
            videoCard.innerHTML = `
            <div class="video-thumbnail" onclick="playVideo('${video.filename}')">
                <span>▶️ ${video.filename}</span>
            </div>
            <div class="video-info" onclick="playVideo('${video.filename}')">
                <h3>${video.filename}</h3>
                <p>Tamaño: ${(video.length / 1024 / 1024).toFixed(2)} MB</p>
                <p>Subido: ${new Date(video.uploadDate).toLocaleDateString()}</p>
            </div>
            `;
            videosList.appendChild(videoCard);
        });
        } catch (err) {
        console.error('Error al cargar videos:', err);
        videosList.innerHTML = '<p style="text-align:center; color:red;">Error al cargar videos</p>';
        }
    }
    });

    // Función global para reproducir videos
    function playVideo(filename) {
    window.location.href = `visualizar_videos.html?video=${encodeURIComponent(filename)}`;
    }