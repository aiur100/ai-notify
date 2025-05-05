/**
 * Creates structured logs for CloudWatch that can be pretty printed or output as JSON
 * @param {string} level - Log level ('info', 'warn', 'error', 'debug')
 * @param {string} message - Main log message
 * @param {Object} [data={}] - Additional data to include in the log
 * @param {boolean} [prettyPrint=false] - Whether to pretty print the JSON output
 * @returns {void}
 */
export const log = (level, message, data = {}, prettyPrint = false) => {
  const timestamp = new Date().toISOString();
  const logObject = {
    timestamp,
    level,
    message,
    ...data
  };
  
  if (prettyPrint) {
    console.log(JSON.stringify(logObject, null, 2));
  } else {
    console.log(JSON.stringify(logObject));
  }
};

/**
 * Convenience method for info level logs
 * @param {string} message - Log message
 * @param {Object} [data={}] - Additional data
 * @param {boolean} [prettyPrint=false] - Whether to pretty print
 */
export const info = (message, data = {}, prettyPrint = false) => log('info', message, data, prettyPrint);

/**
 * Convenience method for error level logs
 * @param {string} message - Log message
 * @param {Object} [data={}] - Additional data
 * @param {boolean} [prettyPrint=false] - Whether to pretty print
 */
export const error = (message, data = {}, prettyPrint = false) => log('error', message, data, prettyPrint);

/**
 * Convenience method for warn level logs
 * @param {string} message - Log message
 * @param {Object} [data={}] - Additional data
 * @param {boolean} [prettyPrint=false] - Whether to pretty print
 */
export const warn = (message, data = {}, prettyPrint = false) => log('warn', message, data, prettyPrint);

/**
 * Convenience method for debug level logs
 * @param {string} message - Log message
 * @param {Object} [data={}] - Additional data
 * @param {boolean} [prettyPrint=false] - Whether to pretty print
 */
export const debug = (message, data = {}, prettyPrint = false) => log('debug', message, data, prettyPrint);
