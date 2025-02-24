const { prepareContainerLevelData } = require('./common');
const { getDbName } = require('../general');

const getAddContainerScript = ddlProvider => container => {
	const containerData = { ...container.role, name: getDbName(container.role) };
	const containerLevelData = prepareContainerLevelData(containerData);
	const hydratedContainer = ddlProvider.hydrateSchema(containerData, containerLevelData);

	return ddlProvider.createSchema(hydratedContainer);
};

const getDeleteContainerScript = ddlProvider => container => {
	const { name } = ddlProvider.hydrateForDeleteSchema({ ...container, ...container.role });

	return ddlProvider.dropSchema({ name });
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
