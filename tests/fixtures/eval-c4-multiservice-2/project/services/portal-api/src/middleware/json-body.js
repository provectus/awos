'use strict';

const { BadRequestError } = require('../errors');

const MAX_BODY_BYTES = 64 * 1024;

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new BadRequestError('request body exceeds 64 KiB limit'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (text === '') {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new BadRequestError('request body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = { readJsonBody, MAX_BODY_BYTES };
