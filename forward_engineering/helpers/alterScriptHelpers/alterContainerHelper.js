const { 
	prepareContainerLevelData, 
} = require('./common');

const getAddContainerScript = (_, ddlProvider) => container => {
	const { getDbName } = require('../general')(_);
	const containerData = { ...container.role, name: getDbName(container.role) }
	const containerLevelData = prepareContainerLevelData(containerData);
	const hydratedContainer = ddlProvider.hydrateSchema(containerData, containerLevelData);
	const script = ddlProvider.createSchema(hydratedContainer);
	return script;
};

const getDeleteContainerScript = ddlProvider => container => {
	const { name } = ddlProvider.hydrateForDeleteSchema({ ...container, ...container.role });
	return `DROP SCHEMA IF EXISTS ${name};`;
};

const getModifyContainerScript = (_, ddlProvider) => container => {
	const preparedData = ddlProvider.hydrateAlterSchema(container);

	return ddlProvider.alterSchema(preparedData);
};

module.exports = {
	getAddContainerScript,
	getDeleteContainerScript,
	getModifyContainerScript
};
