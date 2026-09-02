// Reuse Mongoose's pool and share an in-flight connect across warm invocations.
// Cold serverless instances necessarily create their own connection pool.
function createDatabaseConnector(mongoose, uri, cache = { promise: null }) {
  return async function connectDB() {
    if (mongoose.connection.readyState === 1) return mongoose;
    if (!uri) throw new Error('MONGO_URI is not configured.');
    if (!cache.promise) {
      cache.promise = mongoose.connect(uri, {
        bufferCommands: false,
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
    }
    const pending = cache.promise;
    try {
      return await pending;
    } finally {
      // Failed attempts must not poison subsequent invocations.
      if (cache.promise === pending) cache.promise = null;
    }
  };
}

module.exports = { createDatabaseConnector };
