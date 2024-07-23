const _ = require('lodash');
const { AlterScriptDto } = require('../../types/AlterScriptDto');
const { App } = require('../../../types/coreApplicationTypes');

const tagsCompModKey = 'tags';

/**
 * @param {{ app: App, ddlProvider: object }}
 * @return {({ container }: { container: object }) => AlterScriptDto[]}
 * */
const getAddContainerTagsScriptDtos = ({ container, app, ddlProvider }) => {
	const { getDbName, getName } = require('../../../helpers/general')(app);
	const isCaseSensitive = container.role?.isCaseSensitive;
	const dbName = getDbName(container.role);
	const schemaName = getName(isCaseSensitive, dbName);

	return (container.role?.tags || [])
		.map(tag => {
			const script = ddlProvider.createTag({ tag, schemaName, isCaseSensitive });

			return AlterScriptDto.getInstance([script], true, false);
		})
		.filter(Boolean);
};

/**
 * @param {{ app: App }}
 * @return {({ container }: { container: object }) => AlterScriptDto[]}
 * */
const getModifyContainerTagsScriptDtos = ({ container, app, ddlProvider }) => {
	const { getDbName, getName, getGroupItemsByCompMode } = require('../../../helpers/general')(app);
	const isCaseSensitive = container.role?.isCaseSensitive;
	const dbName = getDbName(container.role);
	const schemaName = getName(isCaseSensitive, dbName);
	const tagsCompMod = container.role?.compMod?.[tagsCompModKey] || {};
	const { new: newItems = [], old: oldItems = [] } = tagsCompMod;
	const { removed, added, modified } = getGroupItemsByCompMode({ newItems, oldItems });

	const removedScriptDtos = removed.map(tag => {
		const script = ddlProvider.dropTag({ tag, schemaName, isCaseSensitive });

		return AlterScriptDto.getInstance([script], true, true);
	});

	const addedScriptDtos = added.map(tag => {
		const script = ddlProvider.createTag({ tag, schemaName, isCaseSensitive });

		return AlterScriptDto.getInstance([script], true, false);
	});

	const modifiedScriptDtos = modified.map(tag => {
		const oldTag = _.find(oldItems, { id: tag.id }) || {};
		const script = ddlProvider.alterTag({ tag, oldTag, schemaName, isCaseSensitive });
		const isDropScript = script.startsWith('DROP');

		return AlterScriptDto.getInstance([script], true, isDropScript);
	});

	return [...modifiedScriptDtos, ...removedScriptDtos, ...addedScriptDtos].filter(Boolean);
};

/**
 * @param {{ app: App }}
 * @return {({ container }: { container: object }) => AlterScriptDto[]}
 * */
const getDeleteContainerTagsScriptDtos = ({ container, app, ddlProvider }) => {
	const { getDbName, getName } = require('../../../helpers/general')(app);
	const isCaseSensitive = container.role?.isCaseSensitive;
	const dbName = getDbName(container.role);
	const schemaName = getName(isCaseSensitive, dbName);

	return (container.role?.tags || [])
		.map(tag => {
			const script = ddlProvider.dropTag({ tag, schemaName, isCaseSensitive });

			return AlterScriptDto.getInstance([script], true, true);
		})
		.filter(Boolean);
};

module.exports = {
	getAddContainerTagsScriptDtos,
	getModifyContainerTagsScriptDtos,
	getDeleteContainerTagsScriptDtos,
};
