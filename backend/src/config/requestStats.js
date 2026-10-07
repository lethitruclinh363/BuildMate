const { AsyncLocalStorage } = require('async_hooks');

const requestStats = new AsyncLocalStorage();

module.exports = { requestStats };
