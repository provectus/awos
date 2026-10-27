'use strict';

module.exports = {
  ...require('./money'),
  ...require('./product'),
  ...require('./variant'),
  ...require('./cart'),
  ...require('./cart-line'),
  ...require('./quote'),
  ...require('./discount-line'),
  ...require('./promotion'),
  ...require('./order'),
  ...require('./payment'),
  ...require('./reservation'),
  ...require('./stock-level'),
  ...require('./customer'),
};
