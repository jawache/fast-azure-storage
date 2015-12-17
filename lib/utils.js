'use strict';

var Promise     = require('promise');
var https       = require('https');

/*
 * Return promise to sleep for a `delay` ms
 *
 * @param   {Number} delay - Number of ms to sleep.
 * @returns {Promise} A romise that will be resolved after `delay` ms
 */
var sleep = function sleep(delay) {
  return new Promise(function(resolve) {
    setTimeout(resolve, delay);
  });
};

// Export sleep
exports.sleep = sleep;

/*
 * Transient error codes from node https module
 * @const
 */
var TRANSIENT_HTTP_ERROR_CODES = [
  'ETIMEDOUT',
  'ECONNRESET',
  'EADDRINUSE',
  'ESOCKETTIMEDOUT',
  'ECONNREFUSED'
];

// Export TRANSIENT_HTTP_ERROR_CODES
exports.TRANSIENT_HTTP_ERROR_CODES = TRANSIENT_HTTP_ERROR_CODES;

/*
 * Retry the asynchronous function `f` until we have exhausted all `retries`,
 * succeed, or encounter an error code not in `transientErrorCodes`.
 * We sleep `Math.min(2 ^ retry * delayFactor, maxDelay)` between each retry.
 * Note, the `f` function must return a promise, and will be given the retry
 * count as first argument, zero for the first request which isn't a _retry_.
 *
 * Warning, for performance reasons this method has no default options, nor does
 * it validate that all options are present. Acceptable because this is mostly
 * intended to be an internal method.
 *
 * @param {Function} f
 * Callback which returns a promise that resolves to if the operation was
 * successful. The callback `f` is the function that will be retried.
 * @param {object} options - Retry options, defined as follows:
 * ```js
 * {
 *   // Max number of request retries
 *   retries:               5,
 *
 *   // Multiplier for computation of retry delay: 2 ^ retry * delayFactor
 *   delayFactor:           100,
 *
 *   // Maximum retry delay in ms (defaults to 30 seconds)
 *   maxDelay:              30 * 1000,
 *
 *   // Error codes for which we should retry
 *   transientErrorCodes:   TRANSIENT_HTTP_ERROR_CODES
 * }
 * ```
 * @returns {Promise} A promise that an iteration `f` of succeeded.
 */
var retry = function retry(f, options) {
  var retry = 0;
  function attempt() {
    return new Promise(function(accept) {
      accept(f(retry));
    }).catch(function(err) {
      // Add number of retries to the error object
      err.retries = retry;

      // Don't retry if this is a non-transient error
      if (options.transientErrorCodes.indexOf(err.code) === -1) {
        throw err;
      }

      // Don't retry if retries have been exhausted
      if (retry >= options.retries) {
        throw err;
      }
      retry += 1;

      // Compute delay
      var delay = Math.min(
        Math.pow(2, retry) * options.delayFactor,
        options.maxDelay
      );

      // Sleep for the delay and try again
      return sleep(delay).then(function() {
        return attempt();
      });
    });
  };
  return attempt();
};

// Export retry
exports.retry = retry;

/*
 * Auxiliary function to create `https.request` with `options` send `data` as
 * UTF-8 and buffer up the response as `payload` property on the response.
 *
 * @param {object} options - `options` compatible with `https.request`.
 * @param {string} data - String to send as UTF-8, or `undefined`.
 * @param {number} timeout - Client-side timeout in milliseconds.
 * @returns {Promise}
 * A promise for the response object with `payload` property as string.
 */
var request = function request(options, data, timeout) {
  return new Promise(function(resolve, reject) {
    // Create https request
    var req = https.request(options);
    req.setTimeout(timeout, function() {
      req.abort();
    });

    // Reject promise
    req.once('error', reject);

    // On response, we buffer up the incoming stream and resolve with that
    req.once('response', function(res) {
      // Set response encoding
      res.setEncoding('utf8');

      // Buffer up chunks
      var chunks = [];
      res.on('data', function(chunk) {
        chunks.push(chunk);
      });

      // Reject on error
      res.once('error', reject);

      // Resolve on request end
      res.once('end', function() {
        // Add payload property to response object
        res.payload = chunks.join('');
        resolve(res);
      });
    });

    // Send data with request
    req.end(data, 'utf-8');
  });
};

// Export request
exports.request = request;

/*
 * Convert Date object to JSON format without milliseconds
 *
 * @param {Date} date - Date object
 * @returns {string} ISO 8601 formatted string without milliseconds
 */
var dateToISOWithoutMS = function dateToISOWithoutMS(date) {
  return date.toJSON().replace(/\.\d+(?=Z$)/, '');
};

// Export dateToISOWithoutMS
exports.dateToISOWithoutMS = dateToISOWithoutMS;
