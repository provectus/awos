'use strict';

module.exports = {
  ...require('./product-serializer'),
  ...require('./variant-serializer'),
  ...require('./stock-serializer'),
  ...require('./error-serializer'),
};
