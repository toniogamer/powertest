const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cron = require('node-cron');
const admin = require('firebase-admin');
const axios = require('axios');

        const response = await axios.get(`${POWER_API_TERCERO}${powerName}`);
console.log(response);
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
    console.error('❌ ERROR: No se pudo inicializar Firebase Admin SDK.');
    if (error.code === 'MODULE_NOT_FOUND') {
        console.error('Asegúrate de que el archivo "firebase-credentials.json" existe en la raíz del proyecto si ejecutas localmente.');
    } else {
        console.error('Error:', error.message);
    }
    console.log('Continuando sin funcionalidades de notificación...');
}


// Activar el modo Stealth para Puppeteer
puppeteer.use(StealthPlugin());

console.log('🚀 Vigilante de Powers iniciado. Esperando la primera ejecución...');

// --- CONFIGURACIÓN ---
const encodedUrl1 = 'aHR0cHM6Ly94YXQuY29tL2pzb24vYWJ4Y291bnQucGhw';
const POWER_URL_BASE = Buffer.from(encodedUrl1, 'base64').toString('ascii');

const encodedUrl2 = 'aHR0cHM6Ly9pbGx1eGF0LmNvbS9hcGkvcG93ZXIv';
const POWER_API_TERCERO = Buffer.from(encodedUrl2, 'base64').toString('ascii');

// --- ESTADO EN MEMORIA ---
let ultimoDatoVisto = { m1: "", m2: "", t: 1 };
const powerInfoCache = new Map();

// --- LÓGICA DE DATOS EXTERNOS ---
async function getPowerInfo(powerName) {
    if (powerInfoCache.has(powerName)) {
        console.log(`  -> Obteniendo datos de '${powerName}' desde la caché.`);
        return powerInfoCache.get(powerName);
    }
    try {
        console.log(`  -> Consultando API de terceros para '${powerName}'...`);
        const response = await axios.get(`${POWER_API_TERCERO}${powerName}`);
        
        console.log(response.data).data
        if (response.data) {
            powerInfoCache.set(powerName, response.data);
            return response.data;
        }
        return null;
    } catch (error) {
        console.error(`  -> ERROR al obtener datos de API de terceros para '${powerName}':`, error.message);
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
    Datos extra: ${JSON.stringify(extraInfo || {})}
    ----------------------------------------
    `);
}

// --- LÓGICA PRINCIPAL ---
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
[${new Date().toLocaleTimeString()}] Verificando ${urlCompleta} con Puppeteer (Modo Stealth)...`);
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        const response = await page.goto(urlCompleta, { waitUntil: 'domcontentloaded' });
        if (!response.ok()) throw new Error(`La petición falló con el estado ${response.status()}`);
        const datoActual = await response.json();
        if (JSON.stringify(datoActual) === JSON.stringify(ultimoDatoVisto)) {
            // console.log("  -> Sin cambios. Todo sigue igual.");
            if (ultimoDatoVisto.t > 1) await verificarTiemposRestantes(ultimoDatoVisto);
            return;
        }
        console.log("  -> ¡Cambio detectado!", datoActual);
        ultimoDatoVisto = datoActual;
        if (datoActual.m1 === "" && datoActual.m2 === "" && datoActual.t === 1) {
            console.log("  -> El evento ha terminado o ha sido reseteado.");
            return;
        }
        const producto = parsearNombreProducto(datoActual.m1 || datoActual.m2);
        console.log(`  -> Nuevo evento procesado: ${JSON.stringify(producto)}`);
        await enviarNotificacion('¡Nuevo evento de Power!', `Ha aparecido el power ${producto.name} (${producto.status}).`, producto);
        await verificarTiemposRestantes(datoActual);
    } catch (error) {
        console.error("  -> ERROR al verificar la URL con Puppeteer:", error.message);
    } finally {
        if (browser) await browser.close();
    }
}

async function verificarTiemposRestantes(evento) {
    const ahoraEnSegundos = Math.floor(Date.now() / 1000);
    const eventoEnSegundos = evento.t;
    const segundosRestantes = eventoEnSegundos - ahoraEnSegundos;
    if (segundosRestantes <= 0) return;
    const minutosRestantes = Math.round(segundosRestantes / 60);
    const notificaciones = [
        { umbral: 5 * 60, texto: "5 horas" }, { umbral: 4 * 60, texto: "4 horas" },
        { umbral: 3 * 60, texto: "3 horas" }, { umbral: 2 * 60, texto: "2 horas" },
        { umbral: 1 * 60, texto: "1 hora" }, { umbral: 30, texto: "30 minutos" },
        { umbral: 15, texto: "15 minutos" }, { umbral: 10, texto: "10 minutos" },
        { umbral: 5, texto: "5 minutos" }, { umbral: 2, texto: "2 minutos" },
        { umbral: 0, texto: "es AHORA" }
    ];
    for (const notif of notificaciones) {
        if (Math.abs(minutosRestantes - notif.umbral) < 1) {
            const producto = parsearNombreProducto(evento.m1 || evento.m2);
            await enviarNotificacion(`El evento '${producto.name}' está por comenzar`, `Empieza en aproximadamente ${notif.texto}.`, producto);
            break;
        }
    }
}
// getPowerInfo(666);
// --- INICIO DEL SCRIPT ---
console.log('Iniciando ciclo de verificación cada minuto...');
cron.schedule('* * * * *', verificarUrl);
verificarUrl(); // Ejecutar una vez al inicio
