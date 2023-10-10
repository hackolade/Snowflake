/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

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
