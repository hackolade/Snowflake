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

const getAlterContainersScripts = collection => {
	const addedContainerScripts = getItems(collection, 'containers', 'added', 'keys').map(
		getAddContainerScript
	);
	const deletedContainerScripts = getItems(collection, 'containers', 'deleted', 'keys').map(
		getDeleteContainerScript
	);
	return [...addedContainerScripts, ...deletedContainerScripts];
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

	return [
		...addedCollectionScripts,
		...deletedCollectionScripts,
		...addedColumnScripts,
		...deletedColumnScripts,
		...modifiedColumnScripts,
	].map(script => script.trim());;
};

module.exports = {
	getAlterContainersScripts,
	getAlterCollectionsScripts,
};
