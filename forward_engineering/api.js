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
	}
};
