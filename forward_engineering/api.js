const _ = require('lodash');
const { commentDropStatements } = require('./helpers/commentHelpers/commentDropStatements');
const { DROP_STATEMENTS } = require('./helpers/constants');
const { getAlterScript } = require('./helpers/alterScriptFromDeltaHelper');
const { applyToInstance } = require('./helpers/applyToInstanceHelper');
const reApi = require('../reverse_engineering/api');

module.exports = {
	generateScript(data, logger, callback, app) {
		try {
			const ddlProvider = require('./ddlProvider')(_, data.options, app);

			const collection = JSON.parse(data.jsonSchema);

			if (!collection) {
				throw new Error(
					'"comparisonModelCollection" is not found. Alter script can be generated only from Delta model',
				);
			}

			const scriptFormat = _.get(data, 'options.targetScriptOptions.keyword');
			const script = getAlterScript({ scriptFormat, collection, ddlProvider, app });

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

	async getExternalBrowserUrl(connectionInfo, logger, cb, app) {
		reApi.getExternalBrowserUrl(connectionInfo, logger, cb, app);
	},

	testConnection(connectionInfo, logger, callback, app) {
		reApi.testConnection(connectionInfo, logger, callback, app);
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
