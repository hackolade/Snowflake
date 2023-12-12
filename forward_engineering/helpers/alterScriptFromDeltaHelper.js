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
const {
	getAddViewScript,
	getDeleteViewScript,
	getModifyViewScript,
} = require('./alterScriptHelpers/alterViewHelper');

const getItems = (collection, nameProperty, modify, objectMethod) =>
	[]
		.concat(collection.properties?.[nameProperty]?.properties?.[modify]?.items)
		.filter(Boolean)
		.map(items => Object[objectMethod](items.properties)[0]);

const getAlterContainersScripts = (collection, _, ddlProvider, app) => {
	const addedContainerScripts = getItems(collection, 'containers', 'added', 'values').map(
		getAddContainerScript(_, ddlProvider, app)
	);
	const deletedContainerScripts = getItems(collection, 'containers', 'deleted', 'values').map(
		getDeleteContainerScript(ddlProvider)
	);
	const modifiedContainerScripts = getItems(collection, 'containers', 'modified', 'values').map(
		getModifyContainerScript(_, ddlProvider)
	)
	return { addedContainerScripts, deletedContainerScripts, modifiedContainerScripts };
};

const getAlterCollectionsScripts = (collection, _, ddlProvider, app) => {
	const getCollectionScripts = (items, compMode, getScript) =>
		items.filter(item => item.compMod?.[compMode]).map(getScript);

	const getColumnScripts = (items, getScript) => items.filter(item => !item.compMod).flatMap(getScript);

	const addedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'added', 'values'),
		'created',
		getAddCollectionScript(_, ddlProvider, app)
	);
	const deletedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		'deleted',
		getDeleteCollectionScript(_, app)
	);

	const modifiedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'modified', 'values'),
		'modified',
		getModifyCollectionScript(ddlProvider)
	);

	const addedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'added', 'values'),
		getAddColumnScript(_, ddlProvider, app)
	);
	const deletedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		getDeleteColumnScript(_, app)
	);
	const modifiedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'modified', 'values'),
		getModifyColumnScript(_, app)
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

const getAlterViewsScripts = ({ schema, _, ddlProvider, app }) => {
	const getViewScripts = (views, compMode, getScript) =>
		views
		.map(view => ({ ...view, ...(view.role || {}) }))
		.filter(view => view.compMod?.[compMode]).map(getScript);

	const getModifiedScript = (items, getScript) => items
		.map(view => ({ ...view, ...(view.role || {}) }))
		.filter(view => !view.compMod?.created && !view.compMod?.deleted).flatMap(getScript);

	const addedViewScripts = getViewScripts(
		getItems(schema, 'views', 'added', 'values'),
		'created',
		getAddViewScript(_, ddlProvider, app)
	);
	const deletedViewScripts = getViewScripts(
		getItems(schema, 'views', 'deleted', 'values'),
		'deleted',
		getDeleteViewScript(_, app)
	);
	const modifiedViewScripts = getModifiedScript(
		getItems(schema, 'views', 'modified', 'values'),
		getModifyViewScript(ddlProvider)
	);

	return {
		addedViewScripts,
		deletedViewScripts,
		modifiedViewScripts,
	}
};


const getAlterScript = ({ collection, _, ddlProvider, app }) => {
	const script = {
		...getAlterCollectionsScripts(collection, _, ddlProvider, app),
		...getAlterContainersScripts(collection, _, ddlProvider, app),
		...getAlterViewsScripts({ schema: collection, _, ddlProvider, app }),
	}
	return [
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
		'deletedContainerScripts'
	].flatMap(name => script[name] || []).map(script => script.trim()).filter(Boolean).join('\n\n');
};

module.exports = {
	getAlterContainersScripts,
	getAlterCollectionsScripts,
	getAlterScript,
};
