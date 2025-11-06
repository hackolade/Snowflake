const { prepareContainerLevelData } = require('./common');
const { getDbName, isObjectInDeltaModelActivated } = require('../general');
const { commentIfDeactivated } = require('../commentHelpers/commentDeactivatedHelper');

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
	const isActivated = isObjectInDeltaModelActivated(container);
	return commentIfDeactivated(ddlProvider.alterSchema(preparedData), { isActivated });
};

module.exports = {
	getAddContainerScript,
	getDeleteContainerScript,
	getModifyContainerScript,
};
