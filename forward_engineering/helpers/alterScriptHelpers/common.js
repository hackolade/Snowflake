const { getDiffCopyOptionsByDefault } = require('./tableCopyOptionsHelper');

const POSSIBLE_CHANGE_CONTAINER_DATA = ['DATA_RETENTION_TIME_IN_DAYS', 'description'];
const REDUNDANT_OPTIONS = ['id'];

const checkFieldPropertiesChanged = (compMod, propertiesToCheck) => {
	return propertiesToCheck.some(
		prop => compMod?.oldField[prop] !== compMod?.newField[prop]
	);
};

const prepareContainerLevelData = container => ({
	udfs: container.UDFs,
	sequences: container.sequences,
	fileFormats: container.fileFormats,
});

const getNames = (schema, getName, getEntityName) => {
	const { schemaName, databaseName } = getBaseAndContaienrNames(schema, getName);
	const tableName = getName(schema.isCaseSensitive, getEntityName(schema));

	return {
		schemaName,
		databaseName,
		tableName,
	};
};

const getBaseAndContaienrNames = (schema, getName) => {
	const { database, isCaseSensitive } = schema.compMod?.bucketProperties || {};
	const { keyspaceName } = schema.compMod;
	const schemaName = getName(isCaseSensitive, keyspaceName);
	const databaseName = getName(isCaseSensitive, database);

	return {
		schemaName,
		databaseName,
	};
};

const prepareContainerName = ({ collection, data }) => {
	const { database } = collection?.role || {};
	data = {
		...data,
		nameData: {
			...(data.nameData || {}),
			database,
		}
	}
	
	return { collection, data };
};

const prepareTableName = ({ collection, data }) => {
	const compMod = collection?.role?.compMod || {};

	data = {
		...data,
		nameData: {
			...(data.nameData || {}),
			isExternal: collection?.role?.external,
			database: compMod?.bucketProperties?.database,
			schemaName: compMod?.keyspaceName,
		}
	};
	
	return { collection, data };
};

const setName = (compMod = {}) => {
	const code = compMod.code;
	const name = compMod.name || compMod.collectionName;

	return { 
		oldName: code?.old || name?.old,
		newName: code?.new || name?.new,
	};
};

const prepareName = ({ collection, data }) => {
	const { compMod, isCaseSensitive, name, code, materialized } = collection?.role || {};
	const compName = setName(compMod);
	const nameIsChanged = compName?.newName !== compName?.oldName;

	data = {
		...data,
			nameData: {
				...(data.nameData || {}),
				isCaseSensitive,
				nameIsChanged,
				isMaterialized: materialized,
				newName: compName?.newName || code || name,
				oldName: compName?.oldName,
			}
	}

	return { collection, data };
};

const prepareAlterSetUnsetData = ({ collection, data }) => {
	const { compMod } = collection?.role || {};
	const changedProperty = POSSIBLE_CHANGE_CONTAINER_DATA.reduce((acc, property) => {
		const { new: newData, old: oldData } = compMod?.[property] || {};
		const propertyIsChanged = oldData !== newData;

		if (!propertyIsChanged) {
			return acc;
		}

		if (newData) {
			return {
				...acc,
				set: {
					...acc.set,
					[property]: newData
				}
			};
		} else if (oldData) {
			return {
				...acc,
				unset: [...acc.unset, property],
			};
		}

		return acc;
	}, { set: {}, unset: [] });

	return {
		collection,
		data: {
			...data,
			setProperty: changedProperty.set,
			unsetProperty: changedProperty.unset,
		},
	};
};

const prepareMenageContainerData = ({ collection, data }) => {
	const managedAccess = collection?.role?.compMod?.managedAccess;
	const isChange = managedAccess && managedAccess?.new !== managedAccess?.old;

	return {
		collection,
		data: {
			...data,
			managedAccess: {
				isChange,
				value: Boolean(managedAccess?.new),
			}
		}
	};
};

const prepareCollectionFileFormat = ({ collection, data }) => {
	const role = collection?.role || {};
	const compMod = role.compMod || {};
	const { new: newType, old: oldType } = compMod.fileFormat || {};
	const { new: newCustomFileFormat, old: oldCustomFileFormat} = compMod.customFileFormatName || {};
	const isChangeType = (newType || oldType) && newType !== oldType;
	const isChangeCustomFileFormat = (newCustomFileFormat || oldCustomFileFormat) && newCustomFileFormat !== oldCustomFileFormat;

	return {
		collection,
		data: {
			...data,
			formatData: {
				isChangeCustomFileFormat,
				isChangeType,
				fileFormat: newType || role?.fileFormat,
				formatName: newCustomFileFormat
			}
		}
	};
};

const getObjectCommonKeys = _ => (oldData = {}, newData = {}) => {
	const newDataKeys = Object.keys(oldData);
	const oldDataKeys = Object.keys(newData);

	return _.union(newDataKeys, oldDataKeys).filter(key => !REDUNDANT_OPTIONS.includes(key));
};

const prepareCollectionFormatTypeOptions = _ => ({ collection, data }) => {
	const { new: newOptions = {}, old: oldOptions = {} } = collection?.role?.compMod?.formatTypeOptions || {};
	const commonOptionsKeys = getObjectCommonKeys(_)(oldOptions, newOptions);
	const optionsIsChanged = commonOptionsKeys.some(key => !_.isEqual(newOptions[key], oldOptions[key]));

	return {
		collection,
		data: {
			...data,
			formatTypeOptions: {
				optionsIsChanged,
				typeOptions: newOptions,
			}
		}
	};
};

const prepareCollectionStageCopyOptions = (clean, getStageCopyOptions, _) => ({ collection, data }) => {
	const { new: newOptions = {}, old: oldOptions = {} } = collection?.role?.compMod?.stageCopyOptions || {};
	const commonOptionsKeys = getObjectCommonKeys(_)(oldOptions, newOptions);

	const optionsIsChanged = commonOptionsKeys.some(key => !_.isEqual(newOptions[key], oldOptions[key]));
	let options = getDiffCopyOptionsByDefault(_)(oldOptions, newOptions, commonOptionsKeys);
	options = {
		...options,
		sizeLimit: _.has(options, 'SIZE_LIMIT'),
	}

	const stageCopyOptions = { 
		optionsIsChanged, 
		options: clean(getStageCopyOptions(options))
	};
	return { 
		collection,
		data: {
			...data,
			stageCopyOptions,
		}
	};
};

module.exports = {
	checkFieldPropertiesChanged,
	prepareContainerLevelData,
	getBaseAndContaienrNames,
	getNames,
	prepareTableName,
	prepareContainerName,
	prepareName,
	prepareAlterSetUnsetData,
	prepareMenageContainerData,
	prepareCollectionFileFormat,
	prepareCollectionFormatTypeOptions,
	prepareCollectionStageCopyOptions,
};
