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
    
    const videoPath = join(__dirname, 'miVideo.mp4');
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
        const videoUploadStream = bucket.openUploadStream('miVideo');
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

//lista dinamica de videos en index.html -> /list-videos info -> Reproducir video (id o filename)
app.get('/listar-videos', async function(req, res){
    let cliennt;
    try {
        client = await MongoClient.connect(url);
        console.log("✅ MongoDB connection successful");
        const db = client.db('bibliotecMultimedia');
        const videos = await db.collection('fs.files').find({}).toArray();
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
        const video = await db.collection('fs.files').findOne({ filename: 'miVideo' });
        
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
        
        res.writeHead(206, headers); // 206 = Partial Content
        
        const bucket = new GridFSBucket(db);
        const downloadStream = bucket.openDownloadStreamByName('miVideo', {
            start
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

app.post('/upload', async function (req, res) {
  const bb = Busboy({ headers: req.headers, limits: { files: 1, fileSize: 1024 * 1024 * 1024 } }); // 1GB ejemplo
  let client;
  let fileIdInGridFS = null;
  let fileMeta = { originalName: null, mimeType: null, size: 0 };
  client = await MongoClient.connect(url);
       
        
  const db = client.db('bibliotecMultimedia');

  bb.on('file', (name, file, info) => {
    const { filename, mimeType } = info;

    // Valida MIME básico
    if (!/^video\//.test(mimeType)) {
      file.resume();
      return res.status(400).json({ error: 'Solo se permiten archivos de video' });
    }

    fileMeta.originalName = filename;
    fileMeta.mimeType = mimeType;

    const gridfs = new GridFSBucket(db, { bucketName: 'videos' });
    const uploadStream = gridfs.openUploadStream(filename, {
      contentType: mimeType,
      metadata: { source: 'web-upload' }
    });

    fileIdInGridFS = uploadStream.id;

    file.on('data', (chunk) => { fileMeta.size += chunk.length; });
    file.pipe(uploadStream);

    uploadStream.on('error', (err) => {
      console.error(err);
      return res.status(500).json({ error: 'Error guardando en GridFS' });
    });

    uploadStream.on('finish', async () => {
      try {
        const now = new Date();
        const videosCol = db.collection('videos');

        const metaDoc = {
          title: fileMeta.originalName,
          description: '',
          ownerId: null, // pon ObjectId del usuario autenticado si aplica
          fileId: uploadStream.id,
          originalName: fileMeta.originalName,
          mimeType: fileMeta.mimeType,
          size: fileMeta.size,
          duration: null,
          status: 'uploaded',
          visibility: 'public',
          tags: [],
          thumbnails: [],
          variants: [],
          counters: { views: 0, likes: 0, comments: 0 },
          createdAt: now,
          updatedAt: now,
          deletedAt: null
        };

        const { insertedId } = await videosCol.insertOne(metaDoc);
        console.log(`Video metadata saved with ID: ${insertedId}`);
        // Tip: aquí puedes encolar un job a FFmpeg para generar duración/miniaturas/transcodificaciones.
        // Al terminar, actualiza { status: 'ready', duration, thumbnails, variants, updatedAt }
        await client.close();
        return res.status(201).json({
          videoId: insertedId,
          fileId: fileIdInGridFS,
          message: 'Video cargado'
        });

      } catch (e) {
        console.error(e);
        if (client) {
            await client.close();
        }
        return res.status(500).json({ error: 'Error guardando metadatos' });
      }
    });
  });

  bb.on('error', (e) => res.status(500).json({ error: 'Error en carga' }));
  bb.on('finish', () => { /* no-op: respondemos en uploadStream.finish */ });

  req.pipe(bb);
});

app.listen(puerto, function(){
    console.log(`Servidor iniciado en el puerto ${puerto}`);
});
