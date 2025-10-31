const reApi = require('../../reverse_engineering/api.js');

function testConnection(connectionInfo, logger, callback, app) {
	reApi.testConnection(connectionInfo, logger, callback, app);
}

module.exports = {
	testConnection,
};
