const {
	getAddContainerScript,
	getDeleteContainerScript,
} = require('./alterScriptHelpers/alterContainerHelper');
const {
	getAddCollectionScript,
	getDeleteCollectionScript,
	getAddColumnScript,
	getDeleteColumnScript,
	getModifyColumnScript,
} = require('./alterScriptHelpers/alterEntityHelper');

const getItems = (collection, nameProperty, modify, objectMethod) =>
	[]
		.concat(collection.properties?.[nameProperty]?.properties?.[modify]?.items)
		.filter(Boolean)
		.map(items => Object[objectMethod](items.properties)[0]);

const getAlterContainersScripts = (collection, _, ddlProvider) => {
	const addedContainerScripts = getItems(collection, 'containers', 'added', 'values').map(
		getAddContainerScript(_, ddlProvider)
	);
	const deletedContainerScripts = getItems(collection, 'containers', 'deleted', 'values').map(
		getDeleteContainerScript(ddlProvider)
	);
	return { addedContainerScripts, deletedContainerScripts };
};

const getAlterCollectionsScripts = (collection, _, ddlProvider) => {
	const getCollectionScripts = (items, compMode, getScript) =>
		items.filter(item => item.compMod?.[compMode]).map(getScript);

	const getColumnScripts = (items, getScript) => items.filter(item => !item.compMod).flatMap(getScript);

	const addedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'added', 'values'),
		'created',
		getAddCollectionScript(_, ddlProvider)
	);
	const deletedCollectionScripts = getCollectionScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		'deleted',
		getDeleteCollectionScript(_, ddlProvider)
	);

	const addedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'added', 'values'),
		getAddColumnScript(_, ddlProvider)
	);
	const deletedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'deleted', 'values'),
		getDeleteColumnScript(_, ddlProvider)
	);
	const modifiedColumnScripts = getColumnScripts(
		getItems(collection, 'entities', 'modified', 'values'),
		getModifyColumnScript(_, ddlProvider)
	);

	return {
		addedCollectionScripts,
		deletedCollectionScripts,
		addedColumnScripts,
		deletedColumnScripts,
		modifiedColumnScripts,
	};
};


const getAlterScript = (collection, _, ddlProvider) => {
	const script = {
		...getAlterCollectionsScripts(collection, _, ddlProvider),
		...getAlterContainersScripts(collection, _, ddlProvider),
	}
	return [
		'addedContainerScripts',
		'deletedCollectionScripts',
		'deletedColumnScripts',
		'addedCollectionScripts',
		'addedColumnScripts',
		'modifiedColumnScripts',
		'deletedContainerScripts'
	].flatMap(name => script[name] || []).map(script => script.trim()).filter(Boolean).join('\n\n');
};

module.exports = {
	getAlterContainersScripts,
	getAlterCollectionsScripts,
	getAlterScript,
};
