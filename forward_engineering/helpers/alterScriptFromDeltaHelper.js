const _ = require('lodash');
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
} = require('./alterScriptHelpers/alterEntityHelper');
const { getAddViewScript, getDeleteViewScript, getModifyViewScript } = require('./alterScriptHelpers/alterViewHelper');
const { getAddTagScript, getDeleteTagScript, getModifyTagScript } = require('./alterScriptHelpers/alterTagHelper');

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

const getAlterCollectionsScripts = (collection, ddlProvider, app) => {
	const getCollectionScripts = (items, compMode, getScript) =>
		items.filter(item => item.compMod?.[compMode]).map(getScript);

	const getColumnScripts = (items, getScript) => items.filter(item => !item.compMod).flatMap(getScript);

	const addedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'added', 'values'),
		'created',
		getAddCollectionScript(ddlProvider, app),
	);
	const deletedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		'deleted',
		getDeleteCollectionScript(app),
	);

	const modifiedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'modified', 'values'),
		'modified',
		getModifyCollectionScript(ddlProvider),
	);

	const addedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'added', 'values'),
		getAddColumnScript(ddlProvider, app),
	);
	const deletedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		getDeleteColumnScript(app),
	);
	const modifiedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'modified', 'values'),
		getModifyColumnScript(app),
	);

	return {
		addedCollectionScripts,
		deletedCollectionScripts,
		modifiedCollectionScripts,
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
		getDeleteViewScript(app),
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
		getAddTagScript({ ddlProvider, app }),
	);
	const deletedTagsScripts = getItems(collection, 'containers', 'deleted', 'values').flatMap(
		getDeleteTagScript({ ddlProvider, app }),
	);
	const modifiedTagsScripts = getItems(collection, 'containers', 'modified', 'values').flatMap(
		getModifyTagScript({ ddlProvider, app }),
	);
	return { addedTagsScripts, deletedTagsScripts, modifiedTagsScripts };
};

const getAlterScript = ({ collection, ddlProvider, app }) => {
	const script = {
		...getAlterCollectionsScripts(collection, ddlProvider, app),
		...getAlterContainersScripts(collection, ddlProvider, app),
		...getAlterViewsScripts({ schema: collection, ddlProvider, app }),
		...getAlterTagsScripts({ collection, ddlProvider, app }),
	};
	return [
		'addedTagsScripts',
		'modifiedTagsScripts',
		'addedContainerScripts',
		'modifiedContainerScripts',
		'deletedViewScripts',
		'deletedCollectionScripts',
		'deletedColumnScripts',
		'addedCollectionScripts',
		'addedColumnScripts',
		'modifiedCollectionScripts',
		'modifiedColumnScripts',
		'addedViewScripts',
		'modifiedViewScripts',
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
