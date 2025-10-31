const _ = require('lodash');
const { applyToInstance: applyToInstanceHelper } = require('../helpers/applyToInstanceHelper.js');
const { handleError } = require('../helpers/handleError.js');

function applyToInstance(connectionInfo, logger, callback, app) {
	logger.clear();
	logger.log('info', _.omit(connectionInfo, 'script', 'containerData'), 'connectionInfo', connectionInfo.hiddenKeys);

	applyToInstanceHelper(connectionInfo, logger)
		.then(result => {
			callback(null, result);
		})
		.catch(error => handleError(logger, error, callback));
}

module.exports = {
	applyToInstance,
};
