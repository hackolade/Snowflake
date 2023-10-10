/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

const snowflakeHelper = require('../../reverse_engineering/helpers/snowflakeHelper');
const {
	setDependencies,
	dependencies,
} = require('../../reverse_engineering/helpers/appDependencies');

const applyToInstance = async (connectionInfo, logger, app) => {
	const async = app.require('async');
	initDependencies(app);
	await snowflakeHelper.connect(logger, connectionInfo);

	const queries = createQueries(app, connectionInfo.script);

	await async.mapSeries(queries, async query => {
		const message = createMessage(query);
		logger.progress({ message });
		logger.log('info', { message }, 'Apply to instance');

		await snowflakeHelper.applyScript(query);
	});
};

const createQueries = (app, script = '') => {
	const _ = app.require('lodash');
	const { filterDeactivatedQuery, queryIsDeactivated } = require('./commentDeactivatedHelper')(_);
	script = filterDeactivatedQuery(script);
	return script
		.split(';')
		.filter(Boolean)
		.map(query => `${query.trim()};`)
		.filter(query => !queryIsDeactivated(query));

}

const createMessage = query =>
	'Query: ' + query.replace(/\n+/, '').split('\n').shift().substring(0, 150);

const initDependencies = app => {
	setDependencies(app);
	snowflakeHelper.setDependencies(dependencies);
};

module.exports = { applyToInstance };
