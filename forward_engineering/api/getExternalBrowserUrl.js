const reApi = require('../../reverse_engineering/api.js');

async function getExternalBrowserUrl(connectionInfo, logger, cb, app) {
	reApi.getExternalBrowserUrl(connectionInfo, logger, cb, app);
}

module.exports = {
	getExternalBrowserUrl,
};
