'use strict'


module.exports = {
	generateScript(data, logger, callback) {
		callback(null, '');
	},

	generateContainerScript(data, logger, callback) {
		callback(null, '');
	},

	applyToInstance(connectionInfo, logger, callback, app) {
		const { applyToInstance } = require('./helpers/applyToInstanceHelper');
		const { getSystemInfo } = require('../reverse_engineering/helpers/loggerHelper');

		logger.clear();
		logger.log('info', getSystemInfo(connectionInfo.appVersion), 'Apply to instance');
		logger.log(
			'info',
			app.require('lodash').omit(connectionInfo, 'script', 'containerData'),
			'connectionInfo',
			connectionInfo.hiddenKeys,
		);

		applyToInstance(connectionInfo, logger, app)
			.then(result => {
				callback(null, result);
			})
			.catch(error => {
				const err = {
					message: error.message,
					stack: error.stack,
				};
				logger.log('error', err, 'Error when applying to instance');
				callback(err);
			});
	},
};
