import express from 'express';
import dotenv from 'dotenv';
import mongodb from 'mongodb';
import dotenv from 'dotenv';
import mongodb from 'mongodb';
import fs from 'fs';
import Busboy from 'busboy';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';


const { MongoClient, GridFSBucket } = mongodb;

const __dirname = dirname(fileURLToPath(import.meta.url));
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

const router = express.Router();
router.use(express.json());
const url = process.env.URL || 'mongodb://localhost:27017/';


// Serve static files
router.use(express.static(__dirname));


router.get("/", function(req, res){
    res.sendFile(join(__dirname, "index.html"));
});
console.log("La url es "+url);


router.get('/api/media/:fileId', async (req, res) => {
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
            // ** CASO 1: NO HAY 'Range' (El navegador quiere el archivo completo, ej: PDF, imagen) **
            console.log(`Sirviendo archivo completo (PDF/Libro): ${file.filename}`);
            
            res.writeHead(200, { // <-- Status 200 OK (no 206)
                "Content-Length": fileSize,
                "Content-Type": mimeType
            });
            
            // Abrimos un stream del archivo completo
            const downloadStream = bucket.openDownloadStream(_id);

            req.on('close', () => {
                downloadStream.abort();
                if (client) client.close();
            });
            
            downloadStream.on('error', (err) => {
                console.error('❌ Error al transmitir archivo completo:', err);
                if (client) client.close();
            });

            downloadStream.on('end', () => {
                if (client) client.close();
            });
            
            downloadStream.pipe(res);

        } else {
            // ** CASO 2: SÍ HAY 'Range' (El navegador quiere streaming, ej: Video, Audio) **
            console.log(`Sirviendo en modo streaming (Video/Audio): ${file.filename}`);
            
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
            
            res.writeHead(206, headers); // <-- Status 206 Partial Content

            const downloadStream = bucket.openDownloadStream(_id, { 
                start: start,
                end: end + 1 
            });
            
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
        }

    } catch (error) {
        console.error('❌ Error en /api/media/:fileId:', error.message);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error al reproducir media' });
        }
        if (client) await client.close();
    }
});


router.get('/listar-videos', async function(req, res){
    let client;
    try {
        client = await MongoClient.connect(url);
        console.log("✅ MongoDB connection successful");
        const db = client.db('bibliotecMultimedia');
        const videos = await db.collection('videos.files').find({}).toArray();
        console.log(`✅ Found ${videos.length} videos in GridFS`); 
        res.status(200).json(videos);
        await client.close();
        
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


router.get('/mongo-video', async function(req, res){
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


router.get('/mongo-video/:filename', async function(req, res){
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


// server.js

// ... (otras importaciones y configuraciones) ...

router.post('/upload', async function (req, res) {
  const bb = Busboy({ headers: req.headers });
  
  let client;
  const fields = {}; // Para guardar los campos de texto (titulo, autor, etc.)
  const fileUploadPromises = []; // Para guardar las promesas de subida de archivos

  try {
    client = await MongoClient.connect(url);
    const db = client.db('bibliotecMultimedia');

    // Buckets separados para media y miniaturas (más organizado)
    const mediaBucket = new GridFSBucket(db, { bucketName: 'videos' });
    const thumbnailBucket = new GridFSBucket(db, { bucketName: 'thumbnails' });

    bb.on('field', (name, val) => {
      console.log(`Campo [${name}]: valor: ${val}`);
      fields[name] = val;
    });

    bb.on('file', (name, file, info) => {
      const { filename, mimeType } = info;
      
      // Elegir el bucket correcto
      // name === 'thumbnail' (del formulario) -> thumbnailBucket
      // name === 'mi_archivo' (del formulario) -> mediaBucket
      const isThumbnail = (name === 'thumbnail');
      const bucket = isThumbnail ? thumbnailBucket : mediaBucket;
      
      console.log(`Subiendo archivo [${name}]: ${filename}`);

      const uploadStream = bucket.openUploadStream(filename, {
        contentType: mimeType,
      });

      // Creamos una promesa por cada archivo que se sube
      const uploadPromise = new Promise((resolve, reject) => {
        uploadStream.on('error', reject);
        uploadStream.on('finish', () => {
          console.log(`✅ Archivo [${name}] terminado. ID: ${uploadStream.id}`);
          // Devolvemos el 'name' del form y el ID de GridFS
          resolve({ formName: name, fileId: uploadStream.id, originalName: filename, mimeType: mimeType, size: uploadStream.length });
        });
        
        file.pipe(uploadStream);
      });
      
      fileUploadPromises.push(uploadPromise);
    });

    bb.on('finish', async () => {
      console.log('Busboy terminó de parsear. Esperando subidas a GridFS...');
      
      try {
        // Esperamos a que TODAS las promesas de subida terminen
        const uploadedFiles = await Promise.all(fileUploadPromises);
        
        let mainFile = uploadedFiles.find(f => f.formName === 'mi_archivo');
        let thumbnailFile = uploadedFiles.find(f => f.formName === 'thumbnail');

        if (!mainFile) {
           throw new Error('No se subió el archivo principal (mi_archivo).');
        }

        const videosCol = db.collection('videos'); // Tu colección de metadatos

        const metaDoc = {
          titulo: fields.titulo || mainFile.originalName,
          autor: fields.autor || null,
          genero: fields.genero || null,
          ano_publicacion: fields.ano_publicacion ? parseInt(fields.ano_publicacion) : null,
          descripcion: fields.descripcion || '',
          etiquetas: fields.etiquetas ? fields.etiquetas.split(',').map(tag => tag.trim()) : [],
          paginas: fields.paginas ? parseInt(fields.paginas) : null,
          tipo_archivo: fields.tipo_archivo || null,
          
          // IDs de los archivos
          fileId: mainFile.fileId, // ID del video/libro/audio
          thumbnailId: thumbnailFile ? thumbnailFile.fileId : null, // ID de la imagen (o null)
          
          originalName: mainFile.originalName,
          mimeType: mainFile.mimeType,
          size: mainFile.size,
          createdAt: new Date(),
          updatedAt: new Date(),
          // ... otros campos
        };

        const { insertedId } = await videosCol.insertOne(metaDoc);
        console.log(`✅ Metadatos guardados con ID: ${insertedId}`);
        
        await client.close();
        return res.status(201).json({
          videoId: insertedId,
          message: 'Archivo y miniatura guardados correctamente'
        });

      } catch (e) {
        console.error('Error durante la subida a GridFS o guardado de metadatos:', e);
        if (client) await client.close();
        return res.status(500).json({ error: 'Error guardando archivos o metadatos', details: e.message });
      }
    });

    req.pipe(bb);

  } catch (e) {
    console.error('Error de conexión con la base de datos:', e);
    if (client) await client.close();
    return res.status(500).json({ error: 'Error de conexión con la base de datos' });
  }
});

router.get('/api/catalogo', async (req, res) => {
    let client;
    try {
        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');

        // Asegúrate que tu colección se llama 'videos'
        const items = await db.collection('videos').find({}).sort({ createdAt: -1 }).toArray(); 

        await client.close();
        res.status(200).json(items); 

    } catch (error) {
        console.error('❌ Error en /api/catalogo:', error.message);
        if (client) await client.close();
        // Si hay un error aquí, el navegador verá un 500
        res.status(500).json({ error: 'Error al obtener el catálogo' }); 
    }
});

//NUEVA RUTA para servir las miniaturas

router.get('/api/thumbnail/:id', async (req, res) => {
    let client;
    try {
        const { id } = req.params;
        
        if (!mongodb.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID de miniatura inválido' });
        }
        const _id = new mongodb.ObjectId(id);

        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        
        // Buscamos en el bucket 'thumbnails'
        const bucket = new GridFSBucket(db, { bucketName: 'thumbnails' });
        
        // Validar si el archivo existe
        const file = await db.collection('thumbnails.files').findOne({ _id: _id });
        if (!file) {
            await client.close();
            // Opcional: enviar un placeholder si no se encuentra
            // return res.sendFile(join(__dirname, 'img/placeholder-default.jpg'));
            return res.status(404).json({ error: 'Miniatura no encontrada' });
        }

        res.set('Content-Type', file.contentType);
        res.set('Content-Length', file.length);
        
        const downloadStream = bucket.openDownloadStream(_id);
        
        downloadStream.on('error', (err) => {
            console.error('Error al transmitir miniatura:', err);
            if (client) client.close();
            if (!res.headersSent) {
                 res.status(500).json({ error: 'Error al leer la miniatura' });
            }
        });
        
        downloadStream.on('end', () => {
            if (client) client.close();
        });
        
        downloadStream.pipe(res); // Enviamos la imagen al navegador

    } catch (error) {
        console.error('❌ Error en /api/thumbnail/:id:', error.message);
        if (client) await client.close();
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error al obtener la miniatura' });
        }
    }
});

// RUTA NUEVA: Obtener los datos de un solo item por su ID
router.get('/api/item/:id', async (req, res) => {
    let client;
    try {
        const { id } = req.params;
        if (!mongodb.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID inválido' });
        }
        
        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        const item = await db.collection('videos').findOne({ _id: new mongodb.ObjectId(id) });
        
        if (!item) {
            await client.close();
            return res.status(404).json({ error: 'Item no encontrado' });
        }
        
        await client.close();
        res.status(200).json(item);

    } catch (error) {
        console.error('❌ Error en GET /api/item/:id:', error.message);
        if (client) await client.close();
        res.status(500).json({ error: 'Error al obtener el item' });
    }
});

// En server.js, reemplaza tu ruta PUT completa

router.put('/api/item/:id', async (req, res) => {
    const { id } = req.params;
    if (!mongodb.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'ID inválido' });
    }
    const _id = new mongodb.ObjectId(id);

    const bb = Busboy({ headers: req.headers });
    let client;
    const fields = {};
    const fileUploadPromises = [];

    try {
        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        const mediaBucket = new GridFSBucket(db, { bucketName: 'videos' });
        const thumbnailBucket = new GridFSBucket(db, { bucketName: 'thumbnails' });

        bb.on('field', (name, val) => fields[name] = val);

        bb.on('file', (name, file, info) => {
            const { filename } = info;

            if (!filename) {
                file.resume(); // Consumir el stream para que busboy continúe
                return;
            }


            const isThumbnail = (name === 'thumbnail');
            const bucket = isThumbnail ? thumbnailBucket : mediaBucket;
            const uploadStream = bucket.openUploadStream(filename, { contentType: info.mimeType });

            const uploadPromise = new Promise((resolve, reject) => {
                uploadStream.on('finish', () => resolve({ formName: name, fileId: uploadStream.id }));
                uploadStream.on('error', reject);
                file.pipe(uploadStream);
            });
            fileUploadPromises.push(uploadPromise);
        });

        bb.on('finish', async () => {
            try {
                const uploadedFiles = await Promise.all(fileUploadPromises);

                // --- LÓGICA CORREGIDA ---
                // 1. Empezamos con los datos de los campos de texto del formulario
                const updateDoc = {
                    titulo: fields.titulo,
                    autor: fields.autor,
                    genero: fields.genero,
                    tipo_archivo: fields.tipo_archivo,
                    descripcion: fields.descripcion,
                    ano_publicacion: fields.ano_publicacion ? parseInt(fields.ano_publicacion) : null,
                    paginas: fields.paginas ? parseInt(fields.paginas) : null,
                    etiquetas: fields.etiquetas ? fields.etiquetas.split(',').map(tag => tag.trim()) : [],
                    updatedAt: new Date()
                };

                // 2. Usamos los IDs antiguos (de los campos ocultos) como base
                updateDoc.fileId = fields.fileId ? new mongodb.ObjectId(fields.fileId) : null;
                updateDoc.thumbnailId = fields.thumbnailId ? new mongodb.ObjectId(fields.thumbnailId) : null;

                // 3. Si se subió un archivo NUEVO, su ID REEMPLAZA al antiguo
                const mainFile = uploadedFiles.find(f => f.formName === 'mi_archivo');
                if (mainFile) {
                    updateDoc.fileId = mainFile.fileId;
                }

                // 4. Si se subió una miniatura NUEVA, su ID REEMPLAZA a la antigua
                const thumbnailFile = uploadedFiles.find(f => f.formName === 'thumbnail');
                if (thumbnailFile) {
                    updateDoc.thumbnailId = thumbnailFile.fileId;
                }
                // --- FIN DE LA LÓGICA CORREGIDA ---

                const result = await db.collection('videos').updateOne(
                    { _id: _id },
                    { $set: updateDoc }
                );

                if (result.matchedCount === 0) {
                    return res.status(404).json({ error: 'No se encontró el item para actualizar' });
                }

                await client.close();
                res.status(200).json({ message: 'Contenido actualizado correctamente' });

            } catch (e) {
                if (client) await client.close();
                res.status(500).json({ error: 'Error al guardar los cambios', details: e.message });
            }
        });

        req.pipe(bb);

    } catch (e) {
        if (client) await client.close();
        res.status(500).json({ error: 'Error de conexión' });
    }
});

// RUTA NUEVA: Eliminar un item por su ID
router.delete('/api/item/:id', async (req, res) => {
    let client;
    try {
        const { id } = req.params;
        if (!mongodb.ObjectId.isValid(id)) {
            return res.status(400).json({ error: 'ID inválido' });
        }
        const _id = new mongodb.ObjectId(id);

        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        const videosCol = db.collection('videos');

        // ---- PASO 1: Encontrar el documento para obtener los IDs de los archivos ----
        const item = await videosCol.findOne({ _id: _id });
        if (!item) {
            await client.close();
            return res.status(404).json({ error: 'Item no encontrado' });
        }

        // ---- PASO 2: Eliminar los archivos de GridFS ----
        const mediaBucket = new GridFSBucket(db, { bucketName: 'videos' });
        const thumbnailBucket = new GridFSBucket(db, { bucketName: 'thumbnails' });

        // Eliminar el archivo principal (video, musica, etc.)
        if (item.fileId) {
            await mediaBucket.delete(new mongodb.ObjectId(item.fileId));
        }
        
        // Eliminar la miniatura
        if (item.thumbnailId) {
            await thumbnailBucket.delete(new mongodb.ObjectId(item.thumbnailId));
        }

        // ---- PASO 3: Eliminar el documento de metadatos de la colección 'videos' ----
        await videosCol.deleteOne({ _id: _id });

        await client.close();
        res.status(200).json({ message: 'Contenido eliminado exitosamente' });

    } catch (error) {
        console.error('❌ Error en DELETE /api/item/:id:', error.message);
        if (client) await client.close();
        res.status(500).json({ error: 'Error al eliminar el contenido' });
    }
});

// --- RUTA PARA REGISTRAR NUEVOS USUARIOS ---
router.post('/api/auth/register', async (req, res) => {
    let client;
    try {
        const { username, password, email, nombre, edad } = req.body;

        // Validar que tengamos los datos
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        const usersCol = db.collection('users');

        // 1. Revisar si el usuario ya existe
        const existingUser = await usersCol.findOne({ username: username });
        if (existingUser) {
            await client.close();
            return res.status(409).json({ error: 'El nombre de usuario ya existe.' });
        }

        // 2. Hashear la contraseña
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // 3. Guardar el nuevo usuario
        await usersCol.insertOne({
            username: username,
            password: hashedPassword,
            email: email,
            nombre: nombre,
            edad: edad,
            createdAt: new Date()
        });

        await client.close();
        res.status(201).json({ message: 'Usuario registrado exitosamente.' });

    } catch (e) {
        if (client) await client.close();
        res.status(500).json({ error: 'Error al registrar el usuario.', details: e.message });
    }
});

// --- RUTA PARA INICIAR SESIÓN ---
router.post('/api/auth/login', async (req, res) => {
    let client;
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña son requeridos.' });
        }

        client = await MongoClient.connect(url);
        const db = client.db('bibliotecMultimedia');
        const usersCol = db.collection('users');

        // 1. Encontrar al usuario
        const user = await usersCol.findOne({ username: username });
        if (!user) {
            await client.close();
            return res.status(404).json({ error: 'Usuario no encontrado.' });
        }

        // 2. Comparar la contraseña
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await client.close();
            return res.status(401).json({ error: 'Contraseña incorrecta.' });
        }

        // 3. Crear un Token (JWT)
        // (Usa una 'palabra secreta' - cámbiala por algo seguro en un archivo .env en un proyecto real)
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            'MI_PALABRA_SECRETA_SUPER_SEGURA', // ¡Cambia esto en el futuro!
            { expiresIn: '24h' } // El token expira en 24 horas
        );

        await client.close();
        // 4. Enviar el token y el nombre del usuario al cliente
        res.status(200).json({ 
            message: 'Inicio de sesión exitoso.', 
            token: token,
            username: user.username,
            nombre: user.nombre // Enviamos el nombre real para mostrarlo
        });

    } catch (e) {
        if (client) await client.close();
        res.status(500).json({ error: 'Error al iniciar sesión.', details: e.message });
    }
});


export default router;