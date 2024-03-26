'use strict';

const snowflakeHelper = require('./helpers/snowflakeHelper');
const ssoHelper = require('./helpers/ssoHelper');
const { setDependencies, dependencies } = require('./helpers/appDependencies');
let _;

const connect = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	logger.clear();
	logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
	try {
		await snowflakeHelper.connect(logger, connectionInfo);
		cb();
	} catch (err) {
		handleError(logger, err, cb);
	}
};

const disconnect = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	try {
		await snowflakeHelper.disconnect();
		cb();
	} catch (err) {
		handleError(logger, err, cb);
	}
};

const testConnection = async (connectionInfo, logger, cb, app) => {
	initDependencies(app);
	logger.clear();
	logger.log('info', connectionInfo, 'connectionInfo', connectionInfo.hiddenKeys);
	try {
		if (connectionInfo.authType === 'externalbrowser') {
			await getExternalBrowserUrl(connectionInfo, logger, cb, app);
		} else {
			await snowflakeHelper.testConnection(logger, connectionInfo);
		}
		cb();
	} catch (err) {
		handleError(logger, err, cb);
	}
};

const getExternalBrowserUrl = async (connectionInfo, logger, cb, app) => {
	try {
		initDependencies(app);
		const ssoData = await ssoHelper.getSsoUrlData(logger, _, connectionInfo);
		cb(null, ssoData);
	} catch (err) {
		handleError(logger, err, cb);
	}
};

const getDatabases = (connectionInfo, logger, cb) => {
	cb();
};

const getDocumentKinds = (connectionInfo, logger, cb) => {
	cb();
};

const getDbCollectionsNames = async (connectionInfo, logger, cb, app) => {
	try {
		logger.clear();
		initDependencies(app);
		await snowflakeHelper.connect(logger, connectionInfo);
		const schemasInfo = await snowflakeHelper.getSchemasInfo();
		logger.log('info', { schemas: schemasInfo }, 'Found schemas');
		const namesBySchemas = await snowflakeHelper.getEntitiesNames();

		logger.log('info', { entities: namesBySchemas }, 'Found entities');

		cb(null, namesBySchemas);
	} catch (err) {
		handleError(logger, err, cb);
	}
};

const getDbCollectionsData = async (data, logger, cb, app) => {
	try {
		initDependencies(app);
		logger.log('info', data, 'Retrieving schema', data.hiddenKeys);
		const collections = data.collectionData.collections;
		const dataBaseNames = data.collectionData.dataBaseNames;
		const entitiesPromises = await dataBaseNames.reduce(async (packagesPromise, schema) => {
			const packages = await packagesPromise;
			const entities = snowflakeHelper.splitEntityNames(collections[schema]);

			const containerData = await snowflakeHelper.getContainerData(schema);
			const [database, schemaName] = schema.split('.');

			const tablesPackages = entities.tables.map(async table => {
				const fullTableName = snowflakeHelper.getFullEntityName(schema, table);
				logger.progress({ message: `Start getting data from table`, containerName: schema, entityName: table });
				logger.log(
					'info',
					{ message: `Start getting data from table`, containerName: schema, entityName: table },
					'Getting schema',
				);
				const ddl = await snowflakeHelper.getDDL(fullTableName, logger);
				const quantity = await snowflakeHelper.getRowsCount(fullTableName);

				logger.progress({
					message: `Fetching record for JSON schema inference`,
					containerName: schema,
					entityName: table,
				});
				logger.log(
					'info',
					{ message: `Fetching record for JSON schema inference`, containerName: schema, entityName: table },
					'Getting schema',
				);

				const { documents, jsonSchema } = await snowflakeHelper.getJsonSchema(
					logger,
					getSampleDocSize(quantity, data.recordSamplingSettings),
					fullTableName,
				);
				const entityData = await snowflakeHelper.getEntityData(fullTableName, logger);

				logger.progress({ message: `Schema inference`, containerName: schema, entityName: table });
				logger.log(
					'info',
					{ message: `Schema inference`, containerName: schema, entityName: table },
					'Getting schema',
				);

				const handledDocuments = snowflakeHelper.handleComplexTypesDocuments(jsonSchema, documents);

				logger.progress({ message: `Data retrieved successfully`, containerName: schema, entityName: table });
				logger.log(
					'info',
					{ message: `Data retrieved successfully`, containerName: schema, entityName: table },
					'Getting schema',
				);

				return {
					dbName: schemaName,
					collectionName: table,
					entityLevel: entityData,
					documents: handledDocuments,
					views: [],
					ddl: {
						script: ddl,
						type: 'snowflake',
						takeAllDdlProperties: true,
					},
					emptyBucket: false,
					validation: {
						jsonSchema: filterMetaProperties(entityData, jsonSchema, logger),
					},
					bucketInfo: {
						indexes: [],
						database,
						...containerData,
					},
				};
			});

			const views = await Promise.all(
				entities.views.map(async view => {
					const fullViewName = snowflakeHelper.getFullEntityName(schema, view);
					logger.progress({
						message: `Start getting data from view`,
						containerName: schema,
						entityName: view,
					});
					logger.log(
						'info',
						{ message: `Start getting data from view`, containerName: schema, entityName: view },
						'Getting schema',
					);

					const ddl = await snowflakeHelper.getViewDDL(fullViewName, logger);
					const viewData = await snowflakeHelper.getViewData(fullViewName, logger);

					logger.progress({
						message: `Data retrieved successfully`,
						containerName: schema,
						entityName: view,
					});
					logger.log(
						'info',
						{ message: `Data retrieved successfully`, containerName: schema, entityName: view },
						'Getting schema',
					);

					return {
						name: view,
						data: viewData,
						ddl: {
							script: ddl,
							type: 'snowflake',
							takeAllDdlProperties: true,
						},
					};
				}),
			);

			if (_.isEmpty(views)) {
				return [...packages, ...tablesPackages];
			}

			const viewPackage = Promise.resolve({
				dbName: schemaName,
				entityLevel: {},
				views,
				emptyBucket: false,
				bucketInfo: {
					indexes: [],
					database,
					...containerData,
				},
			});

			return [...packages, ...tablesPackages, viewPackage];
		}, Promise.resolve([]));

		const packages = await Promise.all(entitiesPromises);

		cb(null, packages.filter(Boolean));
	} catch (err) {
		handleError(logger, err, cb);
	}
};

const filterMetaProperties = (entityData, jsonSchema, logger) => {
	if (!entityData.external) {
		const valueMetaColumn = jsonSchema?.properties?.VALUE;
		if (valueMetaColumn && valueMetaColumn.type === 'variant') {
			logger.log(
				'info',
				{
					message: `The VALUE meta property was found`,
					containerName: entityData.containerName,
					entityName: entityData.entityName,
				},
				'Filtering meta properties',
			);

			return _.omit(jsonSchema.properties, 'VALUE');
		}
		return jsonSchema;
	}
	const columnList = Object.keys(jsonSchema.properties || {}).join();
	logger.log(
		'info',
		{
			message: `External table columns from DESC TABLE: ${columnList}`,
			containerName: entityData.containerName,
			entityName: entityData.entityName,
		},
		'Filtering meta properties',
	);

	return {
		...jsonSchema,
		properties: _.omit(jsonSchema.properties, ['VALUE', 'METADATA$FILENAME', 'METADATA$FILE_ROW_NUMBER']),
	};
};

const getSampleDocSize = (count, recordSamplingSettings) => {
	if (recordSamplingSettings.active === 'absolute') {
		return Number(recordSamplingSettings.absolute.value);
	}

	const limit = Math.ceil((count * recordSamplingSettings.relative.value) / 100);

	return Math.min(limit, recordSamplingSettings.maxValue);
};

const handleError = (logger, error, cb) => {
	const message = _.isString(error) ? error : _.get(error, 'message', 'Reverse Engineering error');
	logger.log('error', { error }, 'Reverse Engineering error');

	return cb({ message });
};

const initDependencies = app => {
	setDependencies(app);
	_ = dependencies.lodash;
	snowflakeHelper.setDependencies(dependencies);
};

module.exports = {
	connect,
	disconnect,
	testConnection,
	getDatabases,
	getDocumentKinds,
	getDbCollectionsNames,
	getDbCollectionsData,
	getExternalBrowserUrl,
};
