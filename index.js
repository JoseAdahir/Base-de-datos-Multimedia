import express from 'express';
import dotenv from 'dotenv';
import mongodb from 'mongodb';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();



const app = express();
const url = process.env.URL || 'mongodb://localhost:27017/bibliotecMultimedia';
const puerto = process.env.PORT;
app.get("/", function(req, res){
    res.sendFile(__dirname + "/index.html");
});

app.get('/init-video', function(req, res){
    mongodb.MongoClient.connect(url, function(error, client){
        if (error) {
            res.json(error);
            return;
        }
        const db = client.db('videos');
        const bucket = new mongodb.GridFSBucket(db);
        const videoUploadStream = bucket.openUploadStream('miVideo');
        const videoReadStream = fs.createReadStream('miVideo.mp4');
        videoReadStream.pipe(videoUploadStream);
        res.status(200).send('Video subido correctamente');
    });
});

app.get('/mongo-video', function(req, res){
    mongodb.MongoClient.connect(url, function(error, client){
        if (error) {
            res.json(error);
            return;
        }
        const range = req.headers.range;
        if (!range) {
            res.status(400).send("Se requiere el encabezado Range");
            return;
        }
        const db = client.db('videos');
        db.collection('fs.files').findOne({}, (err,video) =>{
            if (!video){
                res.status(404).send("Video no encontrado");
                return;
            }

            const videoSize = video.length;
            const start = Number(range.replace(/\D/g, ""));
            const end = videoSize -1;

            const contentLenghth = end - start + 1;
            const headers ={
                "Content-Range": `bytes ${start}-${end}/${videoSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": contentLenghth,
                "Content-Type": "video/mp4"
            };
        });
        res.writeHead(200, headers);
        const bucket = new mongodb.GridFSBucket(db);
        const downloadStream = bucket.openDownloadStreamByName('miVideo',{
            start
        });
        downloadStream.pipe(res);
    });

});


app.listen(3000, function(){
    console.log("Servidor iniciado en el puerto 3000");
});
