import cookieParser from 'cookie-parser';
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectToDatabase, getDatabaseStatus } from './server/db/connect.js';
import { authRouter } from './server/routes/authRoutes.js';
import { calibrationRouter } from './server/routes/calibrationRoutes.js';
import { plannerRouter } from './server/routes/plannerRoutes.js';
import { routineRouter } from './server/routes/routineRoutes.js';
import { sessionAndIntelligenceRouter } from './server/routes/sessionAndIntelligenceRoutes.js';
import { taskRouter } from './server/routes/taskRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      database: getDatabaseStatus(),
      groqConfigured: Boolean(process.env.GROQ_API_KEY?.trim()),
    });
  });

  app.use('/api/v1', authRouter);
  app.use('/api/v1', routineRouter);
  app.use('/api/v1', calibrationRouter);
  app.use('/api/v1', taskRouter);
  app.use('/api/v1', plannerRouter);
  app.use('/api/v1', sessionAndIntelligenceRouter);

  return app;
}

async function startServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  const port = Number(process.env.PORT) || 3000;

  if (process.env.MONGODB_URI) {
    try {
      await connectToDatabase(process.env.MONGODB_URI);
      console.log('[db] Connected to MongoDB.');
    } catch (err) {
      console.warn(
        '[db] Could not connect to MongoDB on startup:',
        err instanceof Error ? err.message : err
      );
    }
  } else {
    console.warn(
      '[db] MONGODB_URI is not set. API routes requiring persistence will return 503 until configured.'
    );
  }

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const hmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      plugins: hmrDisabled
        ? [
            {
              name: 'disable-hmr-client-ws',
              enforce: 'post',
              transform(code, id) {
                if (
                  id.includes('vite/dist/client/client.mjs') &&
                  code.includes('transport.connect(createHMRHandler(handleMessage));')
                ) {
                  return {
                    code: code.replace(
                      'transport.connect(createHMRHandler(handleMessage));',
                      '/* HMR WebSocket disabled when DISABLE_HMR=true */'
                    ),
                    map: null,
                  };
                }
                return null;
              },
            },
          ]
        : [],
      server: hmrDisabled
        ? { middlewareMode: true, hmr: false, ws: false }
        : { middlewareMode: { server: httpServer }, ws: { server: httpServer } },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(`[server] Tid - Take it Done running on http://0.0.0.0:${port}`);
  });
}

const isDirectExecution =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectExecution) {
  startServer().catch((err) => {
    console.error('[server] Fatal startup error:', err);
    process.exit(1);
  });
}
