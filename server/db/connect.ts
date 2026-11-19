import mongoose from 'mongoose';

let connectionPromise: Promise<typeof mongoose> | null = null;
let lastConnectionError: string | null = null;

export async function connectToDatabase(uri?: string): Promise<typeof mongoose> {
  const targetUri = uri ?? process.env.MONGODB_URI;
  if (!targetUri || !targetUri.trim()) {
    lastConnectionError =
      'MONGODB_URI environment variable is not configured.';
    throw new Error(lastConnectionError);
  }

  if (mongoose.connection.readyState === 1) {
    lastConnectionError = null;
    return mongoose;
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  connectionPromise = mongoose
    .connect(targetUri, {
      serverSelectionTimeoutMS: 5000,
    })
    .then((conn) => {
      lastConnectionError = null;
      return conn;
    })
    .catch((err: unknown) => {
      connectionPromise = null;
      lastConnectionError =
        err instanceof Error ? err.message : 'Failed to connect to MongoDB.';
      throw err;
    });

  return connectionPromise;
}

export function isDatabaseReady(): boolean {
  return mongoose.connection.readyState === 1;
}

export function getDatabaseStatus(): {
  connected: boolean;
  readyState: number;
  error: string | null;
} {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
    error: lastConnectionError,
  };
}
