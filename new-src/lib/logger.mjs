export async function callBothLoggers({ logger, globalLogger }, data) {
  if (typeof logger != 'function' && logger != null) {
    throw new Error(`logger not function or null: ${typeof logger}`);
  }
  
  if (typeof globalLogger != 'function' && globalLogger != null) {
    throw new Error(`globalLogger not function or null: ${typeof globalLogger}`);
  }
  
  if (logger != null) logger(data);
  if (globalLogger != null) globalLogger(data);
}
