'use strict';

const snowflakeHelper = require('./helpers/snowflakeHelper');
const _ = require('lodash');

const connect = async (connectionInfo, logger, cb) => {
	logger.clear();
	logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
	try {
		await snowflakeHelper.connect(connectionInfo);
		cb();
	} catch (err) {
		cb(err);
	}
};

const disconnect = async (connectionInfo, logger, cb) => {
	try {
		await snowflakeHelper.disconnect();
		cb();
	} catch (err) {
		cb(err);
	}
};

const testConnection = async (connectionInfo, logger, cb) => {
	try {
		await snowflakeHelper.testConnection(connectionInfo);
		cb();
	} catch (err) {
		cb(err);
	}
};

const getDatabases = (connectionInfo, logger, cb) => {
	cb();
};

const getDocumentKinds = (connectionInfo, logger, cb) => {
	cb();
};

const getDbCollectionsNames = async (connectionInfo, logger, cb) => {
	try {
		await snowflakeHelper.connect(connectionInfo);
		const namesBySchemas = await snowflakeHelper.getEntitiesNames();

		cb(null, namesBySchemas);
	} catch (err) {
		cb(err);
	}
};

const getDbCollectionsData = async (data, logger, cb) => {
	const collections = data.collectionData.collections;
	const dataBaseNames = data.collectionData.dataBaseNames;
	const entitiesPromises = await dataBaseNames.reduce(async (packagesPromise, schema) => {
		const packages = await packagesPromise;
		const entities = snowflakeHelper.splitEntityNames(collections[schema]);

		const containerData = await snowflakeHelper.getContainerData(schema);
		const [ database, schemaName ] = schema.split('.');

		const tablesPackages = entities.tables.map(async table => {
			const fullTableName = snowflakeHelper.getFullEntityName(schema, table);
			logger.progress({ message: `Start getting data from table`, containerName: schema, entityName: table });
			const ddl = await snowflakeHelper.getDDL(fullTableName);
			const quantity = await snowflakeHelper.getRowsCount(fullTableName);
			const documents = await snowflakeHelper.getDocuments(fullTableName, getCount(quantity, data.recordSamplingSettings));

			logger.progress({ message: `Fetching record for JSON schema inference`, containerName: schema, entityName: table });

			const jsonSchema = await snowflakeHelper.getJsonSchema(documents, fullTableName);
			const entityData = await snowflakeHelper.getEntityData(fullTableName);

			logger.progress({ message: `Schema inference`, containerName: schema, entityName: table });

			const handledDocuments = snowflakeHelper.handleComplexTypesDocuments(jsonSchema, documents);

			logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: table });

			return {
				dbName: schemaName,
				collectionName: table,
				entityLevel: entityData,
				documents: handledDocuments,
				views: [],
				ddl: {
					script: ddl,
					type: 'snowflake'
				},
				emptyBucket: false,
				validation: {
					jsonSchema
				},
				bucketInfo: {
					indexes: [],
					database,
					...containerData
				}
			};
		});

		const views = await Promise.all(entities.views.map(async view => {
			const fullViewName = snowflakeHelper.getFullEntityName(schema, view);
			logger.progress({ message: `Start getting data from view`, containerName: schema, entityName: view });
			const ddl = await snowflakeHelper.getViewDDL(fullViewName);
			const viewData = await snowflakeHelper.getViewData(fullViewName);

			logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: view });
			
			return {
				name: view,
				data: viewData,
				ddl: {
					script: ddl,
					type: 'snowflake'
				}
			};
		}));

		if (_.isEmpty(views)) {
			return [ ...packages, ...tablesPackages ];
		}
		
		const viewPackage = Promise.resolve({
			dbName: schemaName,
			entityLevel: {},
			views,
			emptyBucket: false,
			bucketInfo: {
				indexes: [],
				database,
				...containerData
			}
		});

		return [ ...packages, ...tablesPackages, viewPackage ];
	}, Promise.resolve([]));

	const packages = await Promise.all(entitiesPromises).catch(err => cb(err));

	cb(null, packages.filter(Boolean));
};

const getCount = (count, recordSamplingSettings) => {
	const per = recordSamplingSettings.relative.value;
	const size = (recordSamplingSettings.active === 'absolute')
		? recordSamplingSettings.absolute.value
		: Math.round(count / 100 * per);
	return size;
};

module.exports = {
	connect,
	disconnect,
	testConnection,
	getDatabases,
	getDocumentKinds,
	getDbCollectionsNames,
	getDbCollectionsData
}