const _ = require('lodash');
const {
	getAddContainerScriptDto,
	getDeleteContainerScriptDto,
	getModifyContainerScriptDto,
} = require('./alterScriptHelpers/alterContainerHelper');
const { AlterScriptDto, ModificationScript } = require('./types/AlterScriptDto');
const { App, CoreData } = require('../types/coreApplicationTypes');
const {
	getModifyContainerTagsScriptDtos,
	getDeleteContainerTagsScriptDtos,
	getAddContainerTagsScriptDtos,
} = require('./alterScriptHelpers/containerHelpers/alterTagHelper');

const getContainerData = container => Object.values(container.properties)[0] ?? {};

/**
 * @param {{ collection: object, app: App, ddlProvider: object }}
 * @return {AlterScriptDto[]}
 * */
const getAlterContainersScriptDtos = ({ collection, app, ddlProvider }) => {
	const addedContainers = collection.properties?.containers?.properties?.added?.items;
	const deletedContainers = collection.properties?.containers?.properties?.deleted?.items;
	const modifiedContainers = collection.properties?.containers?.properties?.modified?.items;

	const addContainersScriptDtos = []
		.concat(addedContainers)
		.filter(Boolean)
		.map(container => getAddContainerScriptDto({ container: getContainerData(container), app, ddlProvider }));
	const deleteContainersScriptDtos = []
		.concat(deletedContainers)
		.filter(Boolean)
		.map(container => getDeleteContainerScriptDto({ container: getContainerData(container), app, ddlProvider }));
	const modifiedContainersScriptDtos = []
		.concat(modifiedContainers)
		.filter(Boolean)
		.map(container => getModifyContainerScriptDto({ container: getContainerData(container), app, ddlProvider }));

	return [...addContainersScriptDtos, ...deleteContainersScriptDtos, ...modifiedContainersScriptDtos].filter(Boolean);
};

/**
 * @param {{ dto: AlterScriptDto }}
 * @return {AlterScriptDto | undefined}
 */
const prettifyAlterScriptDto = ({ dto }) => {
	if (!dto) {
		return undefined;
	}
	/**
	 * @type {Array<ModificationScript>}
	 * */
	const nonEmptyScriptModificationDtos = dto.scripts
		.map(scriptDto => ({
			...scriptDto,
			script: (scriptDto.script || '').trim(),
		}))
		.filter(scriptDto => Boolean(scriptDto.script));
	if (!nonEmptyScriptModificationDtos.length) {
		return undefined;
	}
	return {
		...dto,
		scripts: nonEmptyScriptModificationDtos,
	};
};

/**
 * @param {{
 * collection: Object,
 * app: App,
 * }} dto
 * @return {AlterScriptDto[]}
 * */
const getAlterContainersTagsScriptDtos = ({ collection, app, ddlProvider }) => {
	const addedContainers = collection.properties?.containers?.properties?.added?.items;
	const deletedContainers = collection.properties?.containers?.properties?.deleted?.items;
	const modifiedContainers = collection.properties?.containers?.properties?.modified?.items;

	const addContainersTagsScriptDtos = []
		.concat(addedContainers)
		.filter(Boolean)
		.flatMap(container =>
			getAddContainerTagsScriptDtos({ container: getContainerData(container), app, ddlProvider }),
		);
	const deleteContainersScriptDtos = []
		.concat(deletedContainers)
		.filter(Boolean)
		.flatMap(container =>
			getDeleteContainerTagsScriptDtos({ container: getContainerData(container), app, ddlProvider }),
		);
	const modifyContainersScriptDtos = []
		.concat(modifiedContainers)
		.filter(Boolean)
		.flatMap(container =>
			getModifyContainerTagsScriptDtos({ container: getContainerData(container), app, ddlProvider }),
		);

	return [...addContainersTagsScriptDtos, ...deleteContainersScriptDtos, ...modifyContainersScriptDtos].filter(
		Boolean,
	);
};

/**
 * @param {{ data: CoreData, app: App, ddlProvider: object }}
 * @return {Array<AlterScriptDto>}
 * */
const getAlterScriptDtos = ({ data, app, ddlProvider }) => {
	const collection = JSON.parse(data.jsonSchema);

	if (!collection) {
		throw new Error(
			'"comparisonModelCollection" is not found. Alter script can be generated only from Delta model',
		);
	}
	const containersTagsScriptDtos = getAlterContainersTagsScriptDtos({ collection, app, ddlProvider });
	const containersScriptDtos = getAlterContainersScriptDtos({ collection, app, ddlProvider });

	return [...containersTagsScriptDtos, ...containersScriptDtos]
		.filter(Boolean)
		.map(dto => prettifyAlterScriptDto({ dto }))
		.filter(Boolean);
};

module.exports = {
	getAlterScriptDtos,
};
