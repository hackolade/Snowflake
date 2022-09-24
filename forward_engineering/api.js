'use strict';

const { commentDropStatements } = require('./helpers/commentDropStatements');
const { DROP_STATEMENTS } = require('./helpers/constants');

module.exports = {
	generateScript(data, logger, callback, app) {
		try {
			const { getAlterScript } = require('./helpers/alterScriptFromDeltaHelper');
			const _ = app.require('lodash');
			const ddlProvider = require('./ddlProvider')(_);

			const collection = JSON.parse(data.jsonSchema);

			if (!collection) {
				throw new Error(
					'"comparisonModelCollection" is not found. Alter script can be generated only from Delta model',
				);
			}

			const script = getAlterScript({ collection, _, ddlProvider, app });

			const applyDropStatements = data.options?.additionalOptions?.some(
				option => option.id === 'applyDropStatements' && option.value,
			);

			callback(null, applyDropStatements ? script : commentDropStatements(script));
		} catch (error) {
			logger.log('error', { message: error.message, stack: error.stack }, 'Snowflake Forward-Engineering Error');

			callback({ message: error.message, stack: error.stack });
		}
	},

	generateContainerScript(data, logger, callback, app) {
		try {
			data.jsonSchema = data.collections[0];
			this.generateScript(data, logger, callback, app);
		} catch (error) {
			logger.log('error', { message: error.message, stack: error.stack }, 'Snowflake Forward-Engineering Error');

			callback({ message: error.message, stack: error.stack });
		}
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

	testConnection(connectionInfo, logger, callback, app) {
		const reApi = require('../reverse_engineering/api');

		reApi.testConnection(connectionInfo, logger, callback, app).then(callback, callback);
	},

	isDropInStatements(data, logger, callback, app) {
		try {
			const cb = (error, script = '') =>
				callback(
					error,
					DROP_STATEMENTS.some(statement => script.includes(statement)),
				);

			if (data.level === 'container') {
				this.generateContainerScript(data, logger, cb, app);
			} else {
				this.generateScript(data, logger, cb, app);
			}
		} catch (e) {
			callback({ message: e.message, stack: e.stack });
		}
	},
};
