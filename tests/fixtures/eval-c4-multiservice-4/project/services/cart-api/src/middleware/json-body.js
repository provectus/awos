'use strict';

// Reads and parses a JSON request body. Non-JSON or oversized bodies reject
// with a ValidationError the error serializer maps to a 400.

const {
  ValidationError,
} = require('../../../../packages/domain/src/validation/errors');

const MAX_BODY_BYTES = 1024 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new ValidationError('request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(null);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new ValidationError('request body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { readJsonBody };
