const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cron = require('node-cron');
const admin = require('firebase-admin');
const axios = require('axios');

// --- CONFIGURACIÓN DE FIREBASE ---
try {
    let serviceAccount;
    if (process.env.FIREBASE_CREDENTIALS) {
      console.log('Cargando credenciales de Firebase desde variable de entorno...');
      serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    } else {
      console.log('Cargando credenciales de Firebase desde archivo local (firebase-credentials.json)...');
      serviceAccount = require('../firebase-credentials.json');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase Admin SDK inicializado correctamente.');
} catch (error) {
    console.error('❌ ERROR: No se pudo inicializar Firebase Admin SDK.', error.message);
    console.log('Continuando sin funcionalidades de notificación...');
}

// --- CONFIGURACIÓN DEL SERVIDOR Y APP ---
const app = express();
app.use(express.static('public')); // Servir archivos estáticos desde la carpeta 'public'
const PORT = process.env.PORT || 3000;
puppeteer.use(StealthPlugin());

const encodedUrl1 = 'aHR0cHM6Ly94YXQuY29tL2pzb24vYWJ4Y291bnQucGhw';
const POWER_URL_BASE = Buffer.from(encodedUrl1, 'base64').toString('ascii');
const encodedUrl2 = 'aHR0cHM6Ly9pbGx1eGF0LmNvbS9hcGkvcG93ZXIv';
const POWER_API_TERCERO = Buffer.from(encodedUrl2, 'base64').toString('ascii');

// --- ESTADO GLOBAL COMPARTIDO ---
let ultimoEventoDetectado = null; // Aquí guardaremos el último evento
const powerInfoCache = new Map();

// --- LÓGICA DE DATOS EXTERNOS ---
async function getPowerInfo(powerName) {
    if (powerInfoCache.has(powerName)) return powerInfoCache.get(powerName);
    try {
        console.log(`  -> Consultando API de terceros para '${powerName}'...`);
        const response = await axios.get(`${POWER_API_TERCERO}${powerName}`);
        if (response.data) {
            powerInfoCache.set(powerName, response.data);
            return response.data;
        }
        return null;
    } catch (error) {
        return null;
    }
}

// --- LÓGICA DE NOTIFICACIONES ---
async function enviarNotificacion(titulo, cuerpo, producto) {
    const extraInfo = await getPowerInfo(producto.name);
    let cuerpoNotificacion = cuerpo;
    if (extraInfo && extraInfo.price) {
        cuerpoNotificacion += ` Precio estimado: ${extraInfo.price} xats.`;
    }
    console.log(`
    ----------------------------------------
    📲 ENVIANDO NOTIFICACIÓN:
    Título: ${titulo}
    Cuerpo: ${cuerpoNotificacion}
    ----------------------------------------
    `);
    // Aquí la lógica de FCM
}

// --- LÓGICA PRINCIPAL DEL VIGILANTE ---
function parsearNombreProducto(texto) {
    if (!texto || typeof texto !== 'string') return null;
    const partes = texto.split(' ');
    const nombre = partes.find(p => !['new', 'power', 'limit', 'epic'].includes(p.toLowerCase()));
    const status = partes.find(p => ['limit', 'epic'].includes(p.toLowerCase()));
    return { name: nombre || 'Desconocido', status: status || 'Normal' };
}

async function verificarUrl() {
    let browser = null;
    try {
        const timestamp = Math.floor(Date.now() / 1000);
        const urlCompleta = `${POWER_URL_BASE}?c=${timestamp}`;
        console.log(`
[${new Date().toLocaleTimeString()}] Verificando URL principal...`);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        const response = await page.goto(urlCompleta, { waitUntil: 'domcontentloaded' });
        if (!response.ok()) throw new Error(`La petición falló con el estado ${response.status()}`);
        const datoActual = await response.json();

        if (JSON.stringify(datoActual) === JSON.stringify(ultimoEventoDetectado)) return;

        console.log("  -> ¡Cambio detectado!", datoActual);
        ultimoEventoDetectado = datoActual; // Guardamos el dato en el estado global

        if (datoActual.m1 === "" && datoActual.m2 === "" && datoActual.t === 1) {
            console.log("  -> El evento ha terminado o ha sido reseteado.");
            return;
        }
        const producto = parsearNombreProducto(datoActual.m1 || datoActual.m2);
        console.log(`  -> Nuevo evento procesado: ${JSON.stringify(producto)}`);
        await enviarNotificacion('¡Nuevo evento de Power!', `Ha aparecido el power ${producto.name} (${producto.status}).`, producto);
        await verificarTiemposRestantes(datoActual);
    } catch (error) {
        console.error("  -> ERROR al verificar la URL:", error.message);
    } finally {
        if (browser) await browser.close();
    }
}

async function verificarTiemposRestantes(evento) {
    // ... (La lógica de esta función no cambia)
}

// --- ENDPOINTS DE LA API ---
app.get('/', (req, res) => {
    res.send('Servidor del vigilante de Powers funcionando. Accede a /latest para ver el último evento.');
});

app.get('/latest', (req, res) => {
    if (ultimoEventoDetectado) {
        res.json(ultimoEventoDetectado);
    } else {
        res.status(404).json({ error: 'Aún no se ha detectado ningún evento.' });
    }
});

// --- INICIO DEL SERVIDOR Y EL VIGILANTE ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor API escuchando en http://localhost:${PORT}`);
    console.log('Iniciando ciclo de verificación en segundo plano...');
    cron.schedule('* * * * *', verificarUrl);
    verificarUrl(); // Ejecutar una vez al inicio
});
