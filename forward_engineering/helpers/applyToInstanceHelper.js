const _ = require('lodash');
const async = require('async');
const { filterDeactivatedQuery, queryIsDeactivated } = require('./commentDeactivatedHelper');
const snowflakeHelper = require('../../reverse_engineering/helpers/snowflakeHelper');
const { setDependencies, dependencies } = require('../../reverse_engineering/helpers/appDependencies');

const createQueries = (script = '') => {
	script = filterDeactivatedQuery(script);
	return script
		.split(';')
		.filter(Boolean)
		.map(query => `${query.trim()};`)
		.filter(query => !queryIsDeactivated(query));
};

const createMessage = query => 'Query: ' + query.replace(/\n+/, '').split('\n').shift().substring(0, 150);

const initDependencies = app => {
	setDependencies(app);
	snowflakeHelper.setDependencies(dependencies);
};

const applyToInstance = async (connectionInfo, logger, app) => {
	initDependencies(app);
	await snowflakeHelper.connect(logger, connectionInfo);

	const queries = createQueries(connectionInfo.script);

	await async.mapSeries(queries, async query => {
		const message = createMessage(query);
		logger.progress({ message });
		logger.log('info', { message }, 'Apply to instance');

		await snowflakeHelper.applyScript(query);
	});
};

module.exports = { applyToInstance };
