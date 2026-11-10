import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import busRouter from './routers/bus-route.js';
import weatherRouter from './routers/weather.js';
import placesRouter from './routers/places.js';
import { closeDb, getDb } from './db/sqlite.js';
import authRouter from './routers/auth.js';
import routinesRouter from './routers/routines.js';
import settingsRouter from './routers/settings.js';
import devicesRouter from './routers/devices.js';
import devRouter from './routers/dev.js';
import { globalCSARouter } from './repo/csa-router.js';
import { globalKnxService } from './services/knx-service.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        // Allow localhost and 127.0.0.1
        if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Allow private network IPs (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
        if (/^https?:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\.[\.\d]+(:\d+)?$/.test(origin)) {
            return callback(null, true);
        }
        // Allow custom origins from env
        const allowed = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (allowed.includes(origin)) {
            return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));
app.use(express.json());
app.use(cookieParser());
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url} - Cookies: ${JSON.stringify(req.cookies || {})} - Header Cookie: ${req.headers.cookie || 'none'}`);
    res.on('finish', () => {
        console.log(`[RESPONSE] ${req.method} ${req.url} -> ${res.statusCode}`);
    });
    next();
});

getDb();

// Load the graph for CSA routing in the background
globalCSARouter.loadGraph().catch(console.error);

// Start KNX Multicast service
globalKnxService.start();

app.use(busRouter);
app.use(weatherRouter);
app.use(placesRouter);
app.use(authRouter);
app.use(routinesRouter);
app.use(settingsRouter);
app.use(devicesRouter);
app.use(devRouter);

process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await globalKnxService.stop();
    closeDb();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});