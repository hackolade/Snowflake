const _ = require('lodash');
const { prepareContainerLevelData } = require('./common');

const getAddTagScript =
	({ ddlProvider, app }) =>
	container => {
		const { getDbName, getName } = require('../general')(app);
		const isCaseSensitive = container.role?.isCaseSensitive;
		const dbName = getDbName(container.role);
		const schemaName = getName(isCaseSensitive, dbName);

		return (container.role?.tags || [])
			.map(tag => ddlProvider.createTag({ tag, schemaName, isCaseSensitive }))
			.filter(Boolean);
	};

const getDeleteTagScript =
	({ ddlProvider, app }) =>
	container => {
		const { getDbName, getName } = require('../general')(app);
		const isCaseSensitive = container.role?.isCaseSensitive;
		const dbName = getDbName(container.role);
		const schemaName = getName(isCaseSensitive, dbName);

		return (container.role?.tags || [])
			.map(tag => ddlProvider.dropTag({ tag, schemaName, isCaseSensitive }))
			.filter(Boolean);
	};

const getModifyTagScript =
	({ ddlProvider, app }) =>
	container => {
		const { getDbName, getName, getGroupItemsByCompMode } = require('../general')(app);
		const isCaseSensitive = container.role?.isCaseSensitive;
		const dbName = getDbName(container.role);
		const schemaName = getName(isCaseSensitive, dbName);
		const tagsCompMod = container.role?.compMod?.tags || {};
		const { new: newItems = [], old: oldItems = [] } = tagsCompMod;
		const { removed, added, modified } = getGroupItemsByCompMode({ newItems, oldItems });

		const removedScriptDtos = removed.map(tag => ddlProvider.dropTag({ tag, schemaName, isCaseSensitive }));

		const addedScriptDtos = added.map(tag => ddlProvider.createTag({ tag, schemaName, isCaseSensitive }));

		const modifiedScriptDtos = modified.map(tag => {
			const oldTag = _.find(oldItems, { id: tag.id }) || {};
			return ddlProvider.alterTag({ tag, oldTag, schemaName, isCaseSensitive });
		});

		return [...removedScriptDtos, ...addedScriptDtos, ...modifiedScriptDtos].filter(Boolean);
	};

module.exports = {
	getAddTagScript,
	getDeleteTagScript,
	getModifyTagScript,
};
