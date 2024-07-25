const _ = require('lodash');
const { prepareContainerLevelData } = require('./common');

const getAddContainerScript = (ddlProvider, app) => container => {
	const { getDbName } = require('../general')(app);
	const containerData = { ...container.role, name: getDbName(container.role) };
	const containerLevelData = prepareContainerLevelData(containerData);
	const hydratedContainer = ddlProvider.hydrateSchema(containerData, containerLevelData);

	return ddlProvider.createSchema(hydratedContainer);
};

const getDeleteContainerScript = ddlProvider => container => {
	const { name } = ddlProvider.hydrateForDeleteSchema({ ...container, ...container.role });

	return `DROP SCHEMA IF EXISTS ${name};`;
};

const getModifyContainerScript = ddlProvider => container => {
	const preparedData = ddlProvider.hydrateAlterSchema(container);

	return ddlProvider.alterSchema(preparedData);
};

module.exports = {
	getAddContainerScript,
	getDeleteContainerScript,
	getModifyContainerScript,
};
