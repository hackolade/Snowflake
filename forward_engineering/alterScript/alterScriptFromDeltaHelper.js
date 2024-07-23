const _ = require('lodash');
const {
	getAddContainerScriptDto,
	getDeleteContainerScriptDto,
	getModifyContainerScriptDto,
} = require('./alterScriptHelpers/alterContainerHelper');
const { AlterScriptDto, ModificationScript } = require('./types/AlterScriptDto');
const { App, CoreData } = require('../types/coreApplicationTypes');
// const {
// 	getModifyContainerTagsScriptDtos,
// 	getDeleteContainerTagsScriptDtos,
// 	getAddContainerTagsScriptDtos,
// } = require('./alterScriptHelpers/containerHelpers/alterTagHelper');

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
		.map(container => getAddContainerScriptDto({ app, ddlProvider })(Object.values(container.properties)[0]));
	const deleteContainersScriptDtos = []
		.concat(deletedContainers)
		.filter(Boolean)
		.map(container => getDeleteContainerScriptDto({ app, ddlProvider })(Object.values(container.properties)[0]));
	const modifiedContainersScriptDtos = []
		.concat(modifiedContainers)
		.filter(Boolean)
		.map(container => getModifyContainerScriptDto({ app, ddlProvider })(Object.values(container.properties)[0]));

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

// /**
//  * @param {{
//  * collection: Object,
//  * app: App,
//  * dbVersion: string,
//  * }} dto
//  * @return {AlterScriptDto[]}
//  * */
// const getAlterContainersTagsScriptDtos = ({ collection, app, dbVersion }) => {
// 	const addedContainers = collection.properties?.containers?.properties?.added?.items;
// 	const deletedContainers = collection.properties?.containers?.properties?.deleted?.items;
// 	const modifiedContainers = collection.properties?.containers?.properties?.modified?.items;

// 	const addContainersTagsScriptDtos = []
// 		.concat(addedContainers)
// 		.filter(Boolean)
// 		.map(container => Object.values(container.properties)[0])
// 		.flatMap(container => getAddContainerTagsScriptDtos({ app })({ container, dbVersion }));
// 	const deleteContainersScriptDtos = []
// 		.concat(deletedContainers)
// 		.filter(Boolean)
// 		.map(container => Object.values(container.properties)[0])
// 		.flatMap(container => getDeleteContainerTagsScriptDtos({ app })({ container, dbVersion }));
// 	const modifyContainersScriptDtos = []
// 		.concat(modifiedContainers)
// 		.filter(Boolean)
// 		.map(container => Object.values(container.properties)[0])
// 		.flatMap(container => getModifyContainerTagsScriptDtos({ app })({ container, dbVersion }));

// 	return [...addContainersTagsScriptDtos, ...deleteContainersScriptDtos, ...modifyContainersScriptDtos].filter(
// 		Boolean,
// 	);
// };

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
	// const containersTagsScriptDtos = getAlterContainersTagsScriptDtos({ collection, app, ddlProvider });

	const containersScriptDtos = getAlterContainersScriptDtos({ collection, app, ddlProvider });

	return [...containersScriptDtos]
		.filter(Boolean)
		.map(dto => prettifyAlterScriptDto({ dto }))
		.filter(Boolean);
};

module.exports = {
	getAlterScriptDtos,
};
