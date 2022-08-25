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

module.exports = {
	checkFieldPropertiesChanged,
	prepareContainerLevelData,
	getBaseAndContaienrNames,
	getNames,
};
