import express from 'express';
import dotenv from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import routes from './backend/server.js';


const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config();

const app = express();

const puerto = process.env.PORT || 3000;


app.use(express.static(__dirname));

app.get("/", function(req, res){
    res.sendFile(join(__dirname, "index.html"));
});

app.use(routes);




app.listen(puerto, function(){
    console.log(`Servidor iniciado en el puerto ${puerto}`);
});
