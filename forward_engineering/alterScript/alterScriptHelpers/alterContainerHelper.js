const _ = require('lodash');
const { prepareContainerLevelData } = require('../../helpers/alterScriptHelpers/common');
const { AlterScriptDto } = require('../types/AlterScriptDto');

/**
 * @return {(container: object) => AlterScriptDto | undefined}
 * */
const getAddContainerScriptDto =
	({ app, ddlProvider }) =>
	container => {
		const { getDbName } = require('../../helpers/general')(app);
		const containerData = { ...container.role, name: getDbName(container.role) };
		const containerLevelData = prepareContainerLevelData(containerData);
		const hydratedContainer = ddlProvider.hydrateSchema(containerData, containerLevelData);
		const createContainerStatement = ddlProvider.createSchema(hydratedContainer);

		return AlterScriptDto.getInstance([createContainerStatement], true, false);
	};

/**
 * @return {(container: object) => AlterScriptDto | undefined}
 * */
const getDeleteContainerScriptDto =
	({ app, ddlProvider }) =>
	container => {
		const { name } = ddlProvider.hydrateForDeleteSchema({ ...container, ...container.role });
		const dropContainerStatement = `DROP SCHEMA IF EXISTS ${name};`; //TODO: move to templates

		return AlterScriptDto.getInstance([dropContainerStatement], true, true);
	};

/**
 * @return {(container: object) => AlterScriptDto | undefined}
 * */
const getModifyContainerScriptDto =
	({ app, ddlProvider }) =>
	container => {
		const preparedData = ddlProvider.hydrateAlterSchema(container);
		const modifiedContainerStatement = ddlProvider.alterSchema(preparedData);

		return AlterScriptDto.getInstance([modifiedContainerStatement], true, false);
	};

module.exports = {
	getAddContainerScriptDto,
	getDeleteContainerScriptDto,
	getModifyContainerScriptDto,
};
