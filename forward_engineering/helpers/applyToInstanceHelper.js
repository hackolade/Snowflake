const snowflakeHelper = require('../../reverse_engineering/helpers/snowflakeHelper');
const {
	setDependencies,
	dependencies,
} = require('../../reverse_engineering/helpers/appDependencies');

const applyToInstance = async (connectionInfo, logger, app) => {
	const async = app.require('async');
	initDependencies(app);

	try {
		await snowflakeHelper.connect(logger, connectionInfo);

		const queries = createQueries(connectionInfo.script);

		await async.mapSeries(queries, async query => {
			logger.progress({ message: createMessage(query) });
			await snowflakeHelper.applyScript(query);
		});
	} catch (error) {
		throw error;
	}
};

const createQueries = script =>
	script
		.split(';')
		.filter(Boolean)
		.map(script => `${script};`);

const createMessage = query =>
	'Query: ' + query.replace(/\n+/, '').split('\n').shift().substring(0, 150);

const initDependencies = app => {
	setDependencies(app);
	_ = dependencies.lodash;
	snowflakeHelper.setDependencies(dependencies);
};

module.exports = { applyToInstance };
