'use strict'


module.exports = {
	generateScript(data, logger, callback, app) {
		const {
			getAlterContainersScripts,
			getAlterCollectionsScripts,
		} = require('./helpers/alterScriptFromDeltaHelper');
		const _ = app.require('lodash');
		const ddlProvider = require('./ddlProvider')(_);

		const collection = JSON.parse(data.jsonSchema);
		
		if (!collection) {
			throw new Error(
				'"comparisonModelCollection" is not found. Alter script can be generated only from Delta model',
			);
		}

		const containersScripts = getAlterContainersScripts(collection);
		const collectionsScripts = getAlterCollectionsScripts(collection, _, ddlProvider);

		callback(
			null,
			[...containersScripts, ...collectionsScripts].join('\n\n'),
		);
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
