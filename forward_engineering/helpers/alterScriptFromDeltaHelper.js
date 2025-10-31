const {
	getAddContainerScript,
	getDeleteContainerScript,
	getModifyContainerScript,
} = require('./alterScriptHelpers/alterContainerHelper');
const {
	getAddCollectionScript,
	getDeleteCollectionScript,
	getModifyCollectionScript,
	getAddColumnScript,
	getDeleteColumnScript,
	getModifyColumnScript,
	getModifyCollectionKeysScript,
} = require('./alterScriptHelpers/alterEntityHelper');
const { getAddViewScript, getDeleteViewScript, getModifyViewScript } = require('./alterScriptHelpers/alterViewHelper');
const { getAddTagScript, getDeleteTagScript, getModifyTagScript } = require('./alterScriptHelpers/alterTagHelper');
const {
	getAddForeignKeyScriptDtos,
	getDeleteForeignKeyScriptDtos,
	getModifyForeignKeyScriptDtos,
} = require('./alterScriptHelpers/alterForeignKeyHelper');
const { commentIfDeactivated } = require('./commentHelpers/commentDeactivatedHelper');

const getItems = (collection, nameProperty, modify, objectMethod) =>
	[]
		.concat(collection.properties?.[nameProperty]?.properties?.[modify]?.items)
		.filter(Boolean)
		.map(items => Object[objectMethod](items.properties)[0]);

const getAlterContainersScripts = (collection, ddlProvider, app) => {
	const addedContainerScripts = getItems(collection, 'containers', 'added', 'values').map(
		getAddContainerScript(ddlProvider, app),
	);
	const deletedContainerScripts = getItems(collection, 'containers', 'deleted', 'values').map(
		getDeleteContainerScript(ddlProvider),
	);
	const modifiedContainerScripts = getItems(collection, 'containers', 'modified', 'values').map(
		getModifyContainerScript(ddlProvider),
	);
	return { addedContainerScripts, deletedContainerScripts, modifiedContainerScripts };
};

const getAlterCollectionsScripts = ({ collection, ddlProvider, app, scriptFormat }) => {
	const getCollectionScripts = (items, compMode, getScript) =>
		items.filter(item => item.compMod?.[compMode]).map(getScript);

	const getColumnScripts = (items, getScript) => items.filter(item => !item.compMod).flatMap(getScript);

	const addedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'added', 'values'),
		'created',
		getAddCollectionScript({ ddlProvider, scriptFormat }),
	);
	const deletedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		'deleted',
		getDeleteCollectionScript,
	);

	const modifiedItems = getItems(collection, 'entities', 'modified', 'values');
	const modifiedCollectionScripts = getCollectionScripts(
		modifiedItems,
		'modified',
		getModifyCollectionScript(ddlProvider),
	);
	const modifyCollectionKeysScripts = modifiedItems.flatMap(getModifyCollectionKeysScript);

	const addedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'added', 'values'),
		getAddColumnScript({ ddlProvider, scriptFormat }),
	);
	const deletedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		getDeleteColumnScript,
	);
	const modifiedColumnScripts = getColumnScripts(modifiedItems, getModifyColumnScript({ scriptFormat }));

	return {
		addedCollectionScripts,
		deletedCollectionScripts,
		modifiedCollectionScripts,
		modifyCollectionKeysScripts,
		addedColumnScripts,
		deletedColumnScripts,
		modifiedColumnScripts,
	};
};

const getAlterViewsScripts = ({ schema, ddlProvider, app }) => {
	const getViewScripts = (views, compMode, getScript) =>
		views
			.map(view => ({ ...view, ...(view.role || {}) }))
			.filter(view => view.compMod?.[compMode])
			.map(getScript);

	const getModifiedScript = (items, getScript) =>
		items
			.map(view => ({ ...view, ...(view.role || {}) }))
			.filter(view => !view.compMod?.created && !view.compMod?.deleted)
			.flatMap(getScript);

	const addedViewScripts = getViewScripts(
		getItems(schema, 'views', 'added', 'values'),
		'created',
		getAddViewScript(ddlProvider, app),
	);
	const deletedViewScripts = getViewScripts(
		getItems(schema, 'views', 'deleted', 'values'),
		'deleted',
		getDeleteViewScript,
	);
	const modifiedViewScripts = getModifiedScript(
		getItems(schema, 'views', 'modified', 'values'),
		getModifyViewScript(ddlProvider),
	);

	return {
		addedViewScripts,
		deletedViewScripts,
		modifiedViewScripts,
	};
};

/**
 * @returns {{ addedTagsScripts: string[], deletedTagsScripts: string[], modifiedTagsScripts: string[] }}
 */
const getAlterTagsScripts = ({ collection, ddlProvider, app }) => {
	const addedTagsScripts = getItems(collection, 'containers', 'added', 'values').flatMap(
		getAddTagScript({ ddlProvider }),
	);
	const deletedTagsScripts = getItems(collection, 'containers', 'deleted', 'values').flatMap(
		getDeleteTagScript({ ddlProvider }),
	);
	const modifiedTagsScripts = getItems(collection, 'containers', 'modified', 'values').flatMap(
		getModifyTagScript({ ddlProvider }),
	);
	return { addedTagsScripts, deletedTagsScripts, modifiedTagsScripts };
};

/**
 * @returns {{ addedFkScripts: string[], deletedFkScripts: string[], modifiedFkScripts: string[] }}
 */
const getAlterForeignKeysScripts = ({ collection, ddlProvider }) => {
	const addedRelationships = getItems(collection, 'relationships', 'added', 'values').filter(
		rel => rel.role?.compMod?.created,
	);

	const deletedRelationships = getItems(collection, 'relationships', 'deleted', 'values').filter(
		rel => rel.role?.compMod?.deleted,
	);

	const modifiedRelationships = getItems(collection, 'relationships', 'modified', 'values').filter(
		rel => rel.role?.compMod?.modified,
	);

	const addedFkScriptDtos = getAddForeignKeyScriptDtos(ddlProvider)(addedRelationships);
	const deletedFkScriptDtos = getDeleteForeignKeyScriptDtos(ddlProvider)(deletedRelationships);
	const modifiedFkScriptDtos = getModifyForeignKeyScriptDtos(ddlProvider)(modifiedRelationships);

	// Convert AlterScriptDto objects to strings, commenting out deactivated scripts
	const convertDtosToScripts = dtos => {
		return dtos
			.flatMap(dto => {
				if (!dto?.scripts) {
					return [];
				}
				return dto.scripts.map(scriptObj => {
					const script = scriptObj.script;
					if (!script) {
						return null;
					}
					// Handle deactivated scripts by commenting them out
					return commentIfDeactivated(script, { isActivated: dto.isActivated });
				});
			})
			.filter(Boolean);
	};

	const addedFkScripts = convertDtosToScripts(addedFkScriptDtos);
	const deletedFkScripts = convertDtosToScripts(deletedFkScriptDtos);
	const modifiedFkScripts = convertDtosToScripts(modifiedFkScriptDtos);

	return { addedFkScripts, deletedFkScripts, modifiedFkScripts };
};

const getAlterScript = ({ scriptFormat, collection, ddlProvider, app }) => {
	const script = {
		...getAlterCollectionsScripts({ collection, ddlProvider, app, scriptFormat }),
		...getAlterContainersScripts(collection, ddlProvider, app),
		...getAlterViewsScripts({ schema: collection, ddlProvider, app }),
		...getAlterTagsScripts({ collection, ddlProvider, app }),
		...getAlterForeignKeysScripts({ collection, ddlProvider }),
	};
	return [
		'addedTagsScripts',
		'modifiedTagsScripts',
		'addedContainerScripts',
		'modifiedContainerScripts',
		'deletedViewScripts',
		'deletedCollectionScripts',
		'deletedColumnScripts',
		'deletedFkScripts',
		'addedCollectionScripts',
		'addedColumnScripts',
		'modifiedCollectionScripts',
		'modifyCollectionKeysScripts',
		'modifiedColumnScripts',
		'addedViewScripts',
		'modifiedViewScripts',
		'addedFkScripts',
		'modifiedFkScripts',
		'deletedTagsScripts',
		'deletedContainerScripts',
	]
		.flatMap(name => script[name] || [])
		.map(script => script.trim())
		.filter(Boolean)
		.join('\n\n');
};

module.exports = {
	getAlterContainersScripts,
	getAlterCollectionsScripts,
	getAlterScript,
	getAlterTagsScripts,
};
