import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import cors from 'cors';
import morgan from 'morgan';

const app = express();
dotenv.config();
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://uuwewypnofukynlndlsu.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV1d2V3eXBub2Z1a3lubG5kbHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk4NDE5ODMsImV4cCI6MjA2NTQxNzk4M30.4phV5-9SNaPaq3XgNLueAQSwxl9Oltd3F5IIyourrOw"
);


// Configuración
const PORT = process.env.PORT || 5000;
const UPLOADS_FOLDER = path.resolve(process.env.UPLOADS_FOLDER);
const IMAGES_FOLDER = path.resolve(process.env.IMAGES_FOLDER || path.join(UPLOADS_FOLDER, 'images'));
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE_MB * 1024 * 1024 *1024;
const ALLOWED_TYPES = process.env.ALLOWED_VIDEO_TYPES.split(',');
const ALLOWED_IMAGE_TYPES = process.env.ALLOWED_IMAGE_TYPES?.split(',') || ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Crear carpeta de uploads si no existe
if (!fs.existsSync(UPLOADS_FOLDER)) {
  fs.mkdirSync(UPLOADS_FOLDER, { recursive: true });
}
if (!fs.existsSync(IMAGES_FOLDER)) {
  fs.mkdirSync(IMAGES_FOLDER, { recursive: true });
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));
app.use(express.static('public'));

// Configuración de Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_FOLDER);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);
  if (ALLOWED_TYPES.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Solo se permiten archivos de tipo: ${ALLOWED_TYPES.join(', ')}`), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: fileFilter
}).single('video');

// Configuración de Multer para imágenes
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, IMAGES_FOLDER);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const imageFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase().substring(1);
  if (ALLOWED_IMAGE_TYPES.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Solo se permiten archivos de imagen de tipo: ${ALLOWED_IMAGE_TYPES.join(', ')}`), false);
  }
};

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: imageFileFilter
}).single('image');

// Rutas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get("/getMetadatos", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("pruebas_acervo")
      .select("id, titulo_original, basado_en, genero, sinopsis, video_titulo, poster_name, ano_estreno");
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Listar videos disponibles
app.get('/api/videos', (req, res) => {
  fs.readdir(UPLOADS_FOLDER, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer los videos' });
    }

    const videos = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase().substring(1);
        return ALLOWED_TYPES.includes(ext);
      })
      .map(file => ({
        name: file,
        url: `/api/videos/stream/${file}`
      }));

    res.json(videos);
  });
});

// Subir video
app.post('/api/videos', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    res.json({
      message: 'Video subido con éxito',
      file: req.file.filename,
      path: `/uploads/${req.file.filename}`,
      url: `/api/videos/stream/${req.file.filename}`
    });
  });
});

// Stream de video
app.get('/api/videos/stream/:filename', (req, res) => {
  const filename = req.params.filename;
  const videoPath = path.join(UPLOADS_FOLDER, filename);

  // Verificar si el archivo existe
  if (!fs.existsSync(videoPath)) {
    return res.status(404).send('Video no encontrado');
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    // Streaming por partes (Range requests)
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    
    const file = fs.createReadStream(videoPath, { start, end });
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4'
    };

    res.writeHead(206, head);
    file.pipe(res);
  } else {
    // Enviar todo el video si no hay range
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4'
    };
    
    res.writeHead(200, head);
    fs.createReadStream(videoPath).pipe(res);
  }
});

// === RUTAS DE IMAGEN ===

// Listar imágenes disponibles
app.get('/api/images', (req, res) => {
  fs.readdir(IMAGES_FOLDER, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Error al leer las imágenes' });
    }

    const images = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase().substring(1);
        return ALLOWED_IMAGE_TYPES.includes(ext);
      })
      .map(file => {
        const filePath = path.join(IMAGES_FOLDER, file);
        const stats = fs.statSync(filePath);
        
        return {
          name: file,
          url: `/api/images/serve/${file}`,
          size: stats.size,
          modified: stats.mtime
        };
      });

    res.json(images);
  });
});

// Subir imagen
app.post('/api/images', (req, res) => {
  uploadImage(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'No se subió ningún archivo' });
    }

    res.json({
      message: 'Imagen subida con éxito',
      file: req.file.filename,
      path: `/images/${req.file.filename}`,
      url: `/api/images/serve/${req.file.filename}`,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
  });
});

// Servir imagen
app.get('/api/images/serve/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(IMAGES_FOLDER, filename);

  // Verificar si el archivo existe
  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }

  // Obtener la extensión para determinar el Content-Type
  const ext = path.extname(filename).toLowerCase().substring(1);
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp'
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  // Configurar headers de cache
  res.set({
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400', // Cache por 1 día
    'ETag': `"${filename}-${fs.statSync(imagePath).mtime.getTime()}"`
  });

  // Verificar ETag para cache
  if (req.headers['if-none-match'] === res.get('ETag')) {
    return res.status(304).end();
  }

  // Enviar la imagen
  res.sendFile(imagePath);
});

// Eliminar imagen
app.delete('/api/images/:filename', (req, res) => {
  const filename = req.params.filename;
  const imagePath = path.join(IMAGES_FOLDER, filename);

  if (!fs.existsSync(imagePath)) {
    return res.status(404).json({ error: 'Imagen no encontrada' });
  }

  fs.unlink(imagePath, (err) => {
    if (err) {
      return res.status(500).json({ error: 'Error al eliminar la imagen' });
    }
    
    res.json({ message: 'Imagen eliminada con éxito' });
  });
});

// Servir archivos de video estáticamente (para el reproductor HTML)
app.use('/uploads', express.static(UPLOADS_FOLDER));
app.use('/images', express.static(IMAGES_FOLDER));

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor de streaming en http://localhost:${PORT}`);
  console.log(`Videos almacenados en: ${UPLOADS_FOLDER}`);
  console.log(`Imágenes almacenadas en: ${IMAGES_FOLDER}`);
});


app.post("/addMetadato", async (req, res) => {
  try {
    const {
      titulo_original,
      basado_en,
      genero,
      sinopsis,
      video_titulo,
      poster_name
    } = req.body;

    // Generate a unique ID if not auto-generated
    const uniqueId =  Math.floor(Math.random() * 1000);

    const { data, error } = await supabase
      .from("pruebas_acervo")
      .insert([
        {
          id: uniqueId,
          titulo_original,
          basado_en,
          genero,
          sinopsis,
          video_titulo,
          poster_name
        }
      ]);

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    res.status(201).json({ message: "Metadato agregado correctamente", data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
