const _ = require('lodash');
const { commentDropStatements } = require('../helpers/commentHelpers/commentDropStatements.js');
const { getAlterScript } = require('../helpers/alterScriptFromDeltaHelper.js');

function generateScript(data, logger, callback, app) {
	try {
		const ddlProvider = require('../ddlProvider')(_, data.options, app);

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
}

module.exports = {
	generateScript,
};
