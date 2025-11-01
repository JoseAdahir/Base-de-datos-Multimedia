import express from 'express';
import dotenv from 'dotenv';
import mongodb from 'mongodb';
import fs from 'fs';
import Busboy from 'busboy';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const { MongoClient, GridFSBucket } = mongodb;

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

const app = express();
const url = process.env.URL || 'mongodb://localhost:27017/';
const puerto = process.env.PORT || 3000;

// Serve static files
app.use(express.static(__dirname));

app.get("/", function(req, res){
    res.sendFile(join(__dirname, "index.html"));
});
console.log("La url es "+url);

app.get('/init-video', async function(req, res){
    console.log("Iniciando carga de video...");
    
    const videoPath = join(__dirname, 'cat.mp4');
    if (!fs.existsSync(videoPath)) {
        console.error('❌ El archivo miVideo.mp4 no existe');
        res.status(404).json({ error: 'Archivo no encontrado' });
        return;
    }
    
    let client;
    try {
        client = await MongoClient.connect(url);
        console.log("✅ MongoDB connection successful");
        
        const db = client.db('bibliotecMultimedia');
        const bucket = new GridFSBucket(db);
        const videoUploadStream = bucket.openUploadStream('cat');
        const videoReadStream = fs.createReadStream(videoPath);
        
        // Usar promesa para esperar a que termine
        await new Promise((resolve, reject) => {
            videoReadStream.pipe(videoUploadStream);
            
            videoUploadStream.on('error', (err) => {
                console.error('❌ Error al subir video:', err);
                reject(err);
            });
            
            videoUploadStream.on('finish', () => {
                console.log('✅ Video subido correctamente a MongoDB');
                resolve();
            });
            
            videoReadStream.on('error', (err) => {
                console.error('❌ Error al leer archivo:', err);
                reject(err);
            });
        });
        
        await client.close();
        res.status(200).json({ 
            success: true, 
            message: 'Video subido correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (client) {
            await client.close();
        }
        res.status(500).json({ 
            error: 'Error al subir video', 
            details: error.message 
        });
    }
});

app.get('/subir_video/:filename', async function(req, res){
    console.log("Iniciando carga de video...");
    const filename = req.params.filename;
    const videoPath = join(__dirname, filename);
    if (!fs.existsSync(videoPath)) {
        console.error(`❌ El archivo ${filename} no existe`);
        res.status(404).json({ error: 'Archivo no encontrado' });
        return;
    }
    
    let client;
    try {
        client = await MongoClient.connect(url);
        console.log("✅ MongoDB connection successful");
        
        const db = client.db('bibliotecMultimedia');
        const bucket = new GridFSBucket(db);
        const videoUploadStream = bucket.openUploadStream(filename);
        const videoReadStream = fs.createReadStream(videoPath);
        
        // Usar promesa para esperar a que termine
        await new Promise((resolve, reject) => {
            videoReadStream.pipe(videoUploadStream);
            
            videoUploadStream.on('error', (err) => {
                console.error('❌ Error al subir video:', err);
                reject(err);
            });
            
            videoUploadStream.on('finish', () => {
                console.log('✅ Video subido correctamente a MongoDB');
                resolve();
            });
            
            videoReadStream.on('error', (err) => {
                console.error('❌ Error al leer archivo:', err);
                reject(err);
            });
        });
        
        await client.close();
        res.status(200).json({ 
            success: true, 
            message: 'Video subido correctamente' 
        });
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        if (client) {
            await client.close();
        }
        res.status(500).json({ 
            error: 'Error al subir video', 
            details: error.message 
        });
    }
});

// AÑADE ESTAS DOS NUEVAS RUTAS A TU index.js

// 1. NUEVA RUTA: Obtener los metadatos de un solo item por su ID
// Esta ruta la usará content-page.html para saber qué mostrar
app.get('/api/item/:id', async (req, res) => {
    let client;
    try {
        const { id } = req.params;
        
        // Valida que el ID sea un ObjectId válido de MongoDB
        if (!mongodb.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de item inválido' });
        }
        
        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        
        // Busca en tu colección 'videos' (donde guardas los metadatos)
        const item = await db.collection('videos').findOne({ _id: new mongodb.ObjectId(id) });
        
        if (!item) {
            await client.close();
            return res.status(404).json({ error: 'Item no encontrado' });
        }
        
        await client.close();
        res.status(200).json(item); // Devuelve el JSON del item (titulo, autor, fileId, etc.)

    } catch (error) {
        console.error('❌ Error en /api/item/:id:', error.message);
        if (client) await client.close();
        res.status(500).json({ error: 'Error al obtener el item', details: error.message });
    }
});


// 2. NUEVA RUTA: Reproducir (streaming) un archivo por su fileId
// REEMPLAZA tu ruta /api/media/:fileId por esta versión corregida

// REEMPLAZA tu ruta /api/media/:fileId por esta versión corregida

app.get('/api/media/:fileId', async (req, res) => {
    let client;
    try {
        const { fileId } = req.params;
        if (!mongodb.ObjectId.isValid(fileId)) {
            return res.status(400).json({ error: 'fileId inválido' });
        }
        const _id = new mongodb.ObjectId(fileId);

        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        
        // Usa el bucket 'fs' por defecto, donde probablemente están tus archivos
        const bucket = new GridFSBucket(db, { bucketName: 'videos' });
        const file = await db.collection('videos.files').findOne({ _id: _id }); 

        if (!file) {
            await client.close();
            return res.status(404).send("Archivo no encontrado en GridFS");
        }

        const fileSize = file.length;
        const mimeType = file.contentType;

        if (fileSize === 0) {
            await client.close();
            return res.status(204).send('Archivo vacío'); 
        }

        const range = req.headers.range;

        if (!range) {
            await client.close();
            return res.status(400).send("Se requiere el encabezado 'Range' para streaming");
        }

        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        if (start >= fileSize) {
            await client.close();
            res.status(416).send(`Rango no satisfactorio: ${start} excede el tamaño del archivo ${fileSize}`);
            return;
        }
        
        if (end >= fileSize) {
            end = fileSize - 1;
        }
        
        const contentLength = (end - start) + 1;

        const headers = {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Type": mimeType
        };
        
        res.writeHead(206, headers);

        // ===== LA LÍNEA CORREGIDA ESTÁ AQUÍ =====
        // Le pedimos que lea hasta 'end + 1' para que el rango sea inclusivo
        // y coincida con el contentLength
        const downloadStream = bucket.openDownloadStream(_id, { 
            start: start,
            end: end + 1 // <--- ¡AQUÍ ESTÁ EL CAMBIO!
        });
        // ======================================
        
        req.on('close', () => {
            downloadStream.abort();
            if (client) client.close();
        });
        
        downloadStream.on('error', (err) => {
            console.error('❌ Error al transmitir media:', err);
            if (client) client.close();
        });

        downloadStream.on('end', () => {
            if (client) client.close();
        });
        
        downloadStream.pipe(res);

    } catch (error) {
        console.error('❌ Error en /api/media/:fileId:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error al reproducir media' });
        }
        if (client) await client.close();
    }
});

//lista dinamica de videos en index.html -> /list-videos info -> Reproducir video (id o filename)
app.get('/api/catalogo', async function(req, res){
    let client; // Corregido el typo 'cliennt'
    try {
        client = await MongoClient.connect(url);
        console.log("✅ Conexión a MongoDB exitosa para listar catálogo");
        
        const db = client.db('bibliotecMultimedia');
        
        // Apuntamos a la colección 'videos', donde SÍ están los metadatos
        const items = await db.collection('videos').find({}).toArray();
        
        console.log(`✅ Encontrados ${items.length} items en el catálogo`);
        res.status(200).json(items);

    } catch (error) {
        console.error('❌ Error al listar el catálogo:', error.message);
        res.status(500).json({
            error: 'Error al listar el catálogo',
            details: error.message
        });
    } finally {
        // Asegura que la conexión se cierre
        if (client) {
            await client.close();
            console.log("✅ Conexión a MongoDB cerrada");
        }
    }
});
app.get('/listar-videos', async function(req, res){
    let client;
    try {
        client = await MongoClient.connect(url);
        console.log("✅ MongoDB connection successful");
        const db = client.db('bibliotecMultimedia');
        const videos = await db.collection('videos.files').find({}).toArray();
        res.status(200).json(videos);
    } catch (error) {
        console.error('❌ Error al listar videos:', error.message);
        if (client) {
            await client.close();
        }
        res.status(500).json({
            error: 'Error al listar videos',
            details: error.message
        });
    }
});


app.get('/mongo-video', async function(req, res){
    let client;
    try {
        client = await MongoClient.connect(url);
        
        const range = req.headers.range;
        if (!range) {
            res.status(400).send("Se requiere el encabezado Range");
            await client.close();
            return;
        }
        
        const db = client.db('bibliotecMultimedia');
        const video = await db.collection('videos.files').findOne({ filename: 'miVideo.mp4' });
        
        if (!video) {
            res.status(404).send("Video no encontrado. Primero sube un video usando /init-video");
            await client.close();
            return;
        }

        const videoSize = video.length;
        const start = Number(range.replace(/\D/g, ""));
        const end = videoSize - 1;

        const contentLength = end - start + 1;
        const headers = {
            "Content-Range": `bytes ${start}-${end}/${videoSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Type": "video/mp4"
        };

        console.log("start:", start, "end:", end, "contentLength:", contentLength);
        
        res.writeHead(206, headers); // 206 = Partial Content
        
        const bucket = new GridFSBucket(db, { bucketName: 'videos' });
        // Usar el _id del archivo para abrir el stream con start/end (end + 1 para exclusividad)
        const downloadStream = bucket.openDownloadStream(video._id, {
            start: start,
            end: end + 1
        });
        
        downloadStream.on('error', (err) => {
            console.error('❌ Error al transmitir video:', err);
            if (client) client.close();
        });
        
        downloadStream.on('end', () => {
            if (client) client.close();
        });
        
        downloadStream.pipe(res);
        
    } catch (error) {
        console.error('❌ Error en /mongo-video:', error.message);
        if (client) {
            await client.close();
        }
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al reproducir video', 
                details: error.message 
            });
        }
    }
});


app.get('/mongo-video/:filename', async function(req, res){
    let client;
    try {
        client = await MongoClient.connect(url);
        const filename = req.params.filename;
        const range = req.headers.range;
        if (!range) {
            res.status(400).send("Se requiere el encabezado Range");
            await client.close();
            return;
        }
        
        const db = client.db('bibliotecMultimedia');
        const video = await db.collection('videos.files').findOne({ filename: filename });
        
        if (!video) {
            res.status(404).send("Video no encontrado. Primero sube un video usando /init-video");
            await client.close();
            return;
        }

        const videoSize = video.length;
        const start = Number(range.replace(/\D/g, ""));
        const end = videoSize - 1;

        const contentLength = end - start + 1;
        const headers = {
            "Content-Range": `bytes ${start}-${end}/${videoSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": contentLength,
            "Content-Type": "video/mp4"
        };

        console.log("start:", start, "end:", end, "contentLength:", contentLength);
        
        res.writeHead(206, headers); // 206 = Partial Content
        
        const bucket = new GridFSBucket(db, { bucketName: 'videos' });
        // Usar el _id del archivo para abrir el stream con start/end (end + 1 para exclusividad)
        const downloadStream = bucket.openDownloadStream(video._id, {
            start: start,
            end: end + 1
        });
        
        downloadStream.on('error', (err) => {
            console.error('❌ Error al transmitir video:', err);
            if (client) client.close();
        });
        
        downloadStream.on('end', () => {
            if (client) client.close();
        });
        
        downloadStream.pipe(res);
        
    } catch (error) {
        console.error('❌ Error en /mongo-video:', error.message);
        if (client) {
            await client.close();
        }
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error al reproducir video', 
                details: error.message 
            });
        }
    }
});


// REEMPLAZA TU RUTA app.post('/upload', ...) por esta:

app.post('/upload', async function (req, res) {
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 1024 * 1024 * 1024 } }); // 1GB ejemplo
  
  let client;
  let fileIdInGridFS = null;
  let fileMeta = { originalName: null, mimeType: null, size: 0 };
  
  // --- Objeto para guardar los campos de texto ---
  const fields = {};

  try {
    client = await MongoClient.connect(url);
    const db = client.db('bibliotecMultimedia');

    // --- Escucha los campos de texto ---
    bb.on('field', (name, val, info) => {
        console.log(`Campo [${name}]: valor: ${val}`);
        fields[name] = val;
    });

    bb.on('file', (name, file, info) => {
      const { filename, mimeType } = info;

      // Valida MIME básico (video, audio, libro/pdf, musica/mp3)
      // Puedes hacer esto más estricto si quieres
      if (!/^(video|audio|application|image)/.test(mimeType)) { 
        file.resume();
        return res.status(400).json({ error: 'Tipo de archivo no permitido' });
      }

      fileMeta.originalName = filename;
      fileMeta.mimeType = mimeType;

      const gridfs = new GridFSBucket(db, { bucketName: 'videos' }); // Puedes cambiar 'videos' por 'fs' si prefieres
      const uploadStream = gridfs.openUploadStream(filename, {
        contentType: mimeType,
        metadata: { 
            source: 'web-upload',
            // --- Guarda los campos de texto como metadatos ---
            // (Esto es opcional, pero útil)
            titulo: fields.titulo,
            autor: fields.autor,
            genero: fields.genero,
            tipo: fields.tipo_archivo
        }
      });

      fileIdInGridFS = uploadStream.id;

      file.on('data', (chunk) => { fileMeta.size += chunk.length; });
      file.pipe(uploadStream);

      uploadStream.on('error', (err) => {
        console.error(err);
        if(client) client.close();
        return res.status(500).json({ error: 'Error guardando en GridFS' });
      });

      uploadStream.on('finish', async () => {
        try {
          const now = new Date();
          const videosCol = db.collection('videos'); // Esta es tu colección de metadatos

          // --- Construye el documento de metadatos CON TUS CAMPOS ---
          const metaDoc = {
            // Usa los campos del formulario, con un fallback
            titulo: fields.titulo || fileMeta.originalName,
            autor: fields.autor || null,
            genero: fields.genero || null,
            ano_publicacion: fields.ano_publicacion ? parseInt(fields.ano_publicacion) : null,
            descripcion: fields.descripcion || '',
            etiquetas: fields.etiquetas ? fields.etiquetas.split(',').map(tag => tag.trim()) : [],
            paginas: fields.paginas ? parseInt(fields.paginas) : null,
            tipo_archivo: fields.tipo_archivo || null,
            
            // Info del archivo
            fileId: uploadStream.id,
            originalName: fileMeta.originalName,
            mimeType: fileMeta.mimeType,
            size: fileMeta.size,
            
            // Campos por defecto (como los tenías)
            ownerId: null,
            duration: null,
            status: 'uploaded',
            visibility: 'public',
            thumbnails: [],
            variants: [],
            counters: { views: 0, likes: 0, comments: 0 },
            createdAt: now,
            updatedAt: now,
            deletedAt: null
          };

          const { insertedId } = await videosCol.insertOne(metaDoc);
          console.log(`✅ Metadatos guardados con ID: ${insertedId}`);
          
          await client.close();
          return res.status(201).json({
            videoId: insertedId,
            fileId: fileIdInGridFS,
            message: 'Archivo y datos guardados correctamente'
          });

        } catch (e) {
          console.error(e);
          if (client) await client.close();
          return res.status(500).json({ error: 'Error guardando metadatos' });
        }
      });
    });

    bb.on('error', (e) => {
        if(client) client.close();
        res.status(500).json({ error: 'Error en carga' })
    });
    
    req.pipe(bb);

  } catch (e) {
      console.error(e);
      if (client) await client.close();
      return res.status(500).json({ error: 'Error de conexión con la base de datos' });
  }
});

app.listen(puerto, function(){
    console.log(`Servidor iniciado en el puerto ${puerto}`);
});
