// Production server entrypoint
require('dotenv').config();

const app = require('./server-optimized');

module.exports = app;
