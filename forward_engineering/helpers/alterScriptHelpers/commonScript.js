const _ = require('lodash');
const { escapeString } = require('../../utils/escapeString');

module.exports = ({ getName, getFullName, templates, assignTemplates, tab }) => {
	const getSchemaFullName = (database, schemaName, isCaseSensitive) => {
		const setSchemaName = getName(isCaseSensitive, schemaName);
		const databaseName = getName(isCaseSensitive, database);

		return getFullName(databaseName, setSchemaName);
	};

	const getAlterSchemaScript = ({ database, isCaseSensitive, newName } = {}) => {
		const schemaFullName = getSchemaFullName(database, newName, isCaseSensitive);

		return assignTemplates(templates.alterSchemaScript, { name: schemaFullName });
	};

	const getAlterEntityScript = (template, { database, isCaseSensitive, newName, schemaName } = {}) => {
		const schemaFullName = getSchemaFullName(database, schemaName, isCaseSensitive);
		const tableName = getName(isCaseSensitive, newName);
		const tableFullName = getFullName(schemaFullName, tableName);

		return assignTemplates(template, { name: tableFullName });
	};

	const getAlterSchemaName = ({ script, data }) => {
		const { nameData } = data;
		const { database, isCaseSensitive, oldName, nameIsChanged, newName } = nameData;
		const oldFullName = getSchemaFullName(database, oldName, isCaseSensitive);
		const newFullName = getSchemaFullName(database, newName, isCaseSensitive);

		if (nameIsChanged) {
			const alterScriptForRename = assignTemplates(templates.alterSchemaScript, { name: oldFullName });

			script = [
				...script,
				alterScriptForRename + assignTemplates(templates.alterEntityRename, { name: newFullName }),
			];
		}

		return { script, data };
	};

	const getSetCollectionProperty =
		alterScript =>
		({ script, data }) => {
			const { setProperty, nameData } = data;
			if (nameData?.isExternal) {
				return { script, data };
			}

			const setPropertyData = Object.keys(setProperty).map((key, index) => {
				const propValue = setProperty[key];
				const scriptFormat = _.get(data, 'options.targetScriptOptions.keyword');

				const value = key === 'description' ? escapeString(scriptFormat, propValue) : propValue;
				key = key === 'description' ? 'COMMENT' : key;
				const statement = `${key} = ${value}`;

				return Boolean(index) ? tab(statement) : statement;
			});

			if (!_.isEmpty(setPropertyData)) {
				const setPropertyScript =
					alterScript +
					assignTemplates(templates.setPropertySchema, { property: setPropertyData.join('\n') });
				script = [...script, setPropertyScript];
			}

			return { script, data };
		};

	const getUnsetCollectionProperty =
		alterScript =>
		({ script, data }) => {
			const { unsetProperty, nameData } = data;
			if (nameData?.isExternal) {
				return { script, data };
			}

			const unsetPropertyData = unsetProperty.map((key, index) => {
				key = key === 'description' ? 'COMMENT' : key;
				return Boolean(index) ? `${key}` : `${key}`;
			});

			if (!_.isEmpty(unsetPropertyData)) {
				const unsetPropertyScript =
					alterScript +
					assignTemplates(templates.unsetPropertySchema, { property: unsetPropertyData.join('\n') });
				script = [...script, unsetPropertyScript];
			}

			return { script, data };
		};

	const getSchemaMenageAccess =
		alterScript =>
		({ script, data }) => {
			const { managedAccess } = data;

			if (managedAccess.isChange) {
				const access = managedAccess.value ? 'ENABLE' : 'DISABLE';
				script = [...script, alterScript + assignTemplates(templates.manageAccessSchema, { access })];
			}

			return { script, data };
		};

	/**
	 * @typedef {{ script: string[], data: object }} AlterData
	 * @param {string} alterScript
	 * @returns {({ script, data }: AlterData) => AlterData}
	 */
	const getAlterObjectTagsScript =
		alterScript =>
		({ script, data }) => {
			const config = {
				tagsToSet: templates.setPropertySchema,
				tagsToUnset: templates.unsetPropertySchema,
			};

			return Object.entries(config).reduce(
				(result, [keyword, template]) => {
					const property = result.data.tags?.[keyword];

					if (!property) {
						return result;
					}

					const script = alterScript + assignTemplates(template, { property });

					return {
						...result,
						script: [...result.script, script],
					};
				},
				{ script, data },
			);
		};

	const getAlterEntityRename =
		(alterEntityTemplate, alterEntityRename) =>
		({ script, data }) => {
			const { nameData } = data;
			const { database, isCaseSensitive, oldName, nameIsChanged, newName, schemaName } = nameData;
			const schemaFullName = getSchemaFullName(database, schemaName, isCaseSensitive);
			const oldFullName = getFullName(schemaFullName, getName(isCaseSensitive, oldName));
			const newFullName = getFullName(schemaFullName, getName(isCaseSensitive, newName));

			if (nameIsChanged && !nameData.isExternal) {
				const alterScriptForRename = assignTemplates(alterEntityTemplate, { name: oldFullName });

				script = [...script, alterScriptForRename + assignTemplates(alterEntityRename, { name: newFullName })];
			}

			return { script, data };
		};

	const getAlterTableFormat =
		(alterScript, getFileFormat) =>
		({ script, data }) => {
			const { formatData, formatTypeOptions: typeOptions, nameData } = data;
			if (nameData.isExternal) {
				return { script, data };
			}

			let fileFormat = formatData.fileFormat;
			let formatName = formatData.formatName;

			let formatTypeOptions =
				typeOptions.optionsIsChanged || formatData.isChangeType ? typeOptions.typeOptions : {};
			if (formatData.isChangeType && !formatData.fileFormat) {
				fileFormat = 'CSV';
				formatTypeOptions = {};
			}

			if (fileFormat === 'custom' && !formatName) {
				return { script, data };
			}

			if (formatData.isChangeType || formatData.isChangeCustomFileFormat || typeOptions.optionsIsChanged) {
				const scriptFormat =
					'STAGE_FILE_FORMAT = ' + getFileFormat(fileFormat, formatTypeOptions || {}, formatName);
				script = [
					...script,
					alterScript + assignTemplates(templates.setPropertyTable, { property: scriptFormat }),
				];
			}

			return { script, data };
		};

	const getAlterTableStageCopyOptions =
		(alterScript, getCopyOptions, _) =>
		({ script, data }) => {
			const { stageCopyOptions, nameData } = data;

			if (stageCopyOptions.optionsIsChanged && !_.isEmpty(stageCopyOptions.options) && !nameData?.isExternal) {
				const scriptOptions = getCopyOptions(stageCopyOptions.options);
				script = [
					...script,
					alterScript + assignTemplates(templates.setPropertyTable, { property: scriptOptions }),
				];
			}

			return { data, script };
		};

	return {
		getAlterSchemaName,
		getSetCollectionProperty,
		getUnsetCollectionProperty,
		getSchemaMenageAccess,
		getAlterSchemaScript,
		getAlterTableFormat,
		getAlterEntityScript,
		getAlterEntityRename,
		getAlterTableStageCopyOptions,
		getAlterObjectTagsScript,
	};
};
