const _ = require('lodash');
const snowflake = require('snowflake-sdk');
const axios = require('axios');
const uuid = require('uuid');
const BSON = require('bson');
const errorMessages = require('./errorMessages');
const { getRole, getAccountName, removeQuotes } = require('./common.js/index.js');
const { authByOkta } = require('./connections/oktaConnection.js');
const { authByExternalBrowser } = require('./connections/externalBrowserConnection.js');
const { authByCredentials } = require('./connections/credentialsConnection.js');
const { authByKeyPair } = require('./connections/keyPairConnection.js');
const { getConnection, execute, disconnect } = require('./connections/connection.js');

const ALREADY_CONNECTED_STATUS = 405502;
const CANT_REACH_SNOWFLAKE_ERROR_STATUS = 401001;
const CONNECTION_TIMED_OUT_CODE = 'CONNECTION_TIMED_OUT';

const DEFAULT_CLIENT_APP_ID = 'JavaScript';
const DEFAULT_CLIENT_APP_VERSION = '1.5.1';
const DEFAULT_WAREHOUSE = 'COMPUTE_WH';
const DEFAULT_ROLE = 'PUBLIC';
const HACKOLADE_APPLICATION = 'Hackolade';
const CLOUD_PLATFORM_POSTFIXES = ['gcp', 'aws', 'azure'];

const SECONDS_IN_DAY = 86400;
const SECONDS_IN_HOUR = 3600;
const SECONDS_IN_MINUTE = 60;

let containers = {};

const connect = async (
	logger,
	{
		host,
		username,
		password,
		authType,
		authenticator,
		proofKey,
		token,
		role,
		warehouse,
		name,
		cloudPlatform,
		queryRequestTimeout,
		databaseName,
		privateKeyPath,
		privateKeyPass,
	},
) => {
	const connection = getConnection();

	if (connection) {
		logger.log('info', 'connection already exists', 'Connection');

		return connection;
	}

	const account = getAccount(host);
	const accessUrl = getAccessUrl(account);
	const timeout = _.toNumber(queryRequestTimeout) || 2 * 60 * 1000;

	logger.log(
		'info',
		`Connection name: ${name}\n` +
			`Cloud platform: ${cloudPlatform}\n` +
			`Host: ${host}\n` +
			`Auth type: ${authType}\n` +
			`Username: ${username}\n` +
			`Warehouse: ${warehouse}\n` +
			`Role: ${role}\n` +
			`Database name: ${databaseName}`,
		'Connection',
	);

	const connectionFallbackStrategy = err => {
		if (err.code !== CANT_REACH_SNOWFLAKE_ERROR_STATUS || hasCloudPlatform(account)) {
			throw err;
		}

		const message = _.isString(err) ? err : _.get(err, 'message', 'Reverse Engineering error');
		logger.log(
			'info',
			`Can't reach Snowflake server. Trying to add cloudPlatformName. \nInitial error: ${message}`,
			'Connection',
		);

		return connect(logger, {
			host: `${host}.${_.toLower(cloudPlatform)}`,
			username,
			password,
			authType,
			authenticator,
			proofKey,
			token,
			role,
			warehouse,
			name,
			cloudPlatform,
			queryRequestTimeout,
		});
	};

	let authPromise;
	if (authType === 'okta') {
		return authByOkta({
			account,
			accessUrl,
			username,
			password,
			authenticator,
			role,
			warehouse,
			timeout,
			logger,
		}).catch(connectionFallbackStrategy);
	}
	if (authType === 'externalbrowser') {
		authPromise = authByExternalBrowser({
			account,
			accessUrl,
			token,
			proofKey,
			username,
			password,
			role,
			warehouse,
			timeout,
			logger,
		});
	} else if (authType === 'keyPair') {
		authPromise = authByKeyPair({ account, role, timeout, username, privateKeyPath, privateKeyPass });
	} else {
		authPromise = authByCredentials({ account, username, password, role, warehouse, timeout });
	}

	return authPromise.catch(connectionFallbackStrategy);
};

const getAccount = hostUrl =>
	(hostUrl || '')
		.trim()
		.replace(/\.snowflakecomputing\.com.*$/gi, '')
		.replace(/^http(s)?:\/\//gi, '');

const getAccessUrl = account => `https://${account}.snowflakecomputing.com`;

const testConnection = async (logger, info) => {
	await connect(logger, info);
	await execute('SELECT 1 as t;');
	await disconnect();
};

const showTables = () => execute('SHOW TABLES;');

const showTablesByDatabases = async databases =>
	_.isEmpty(databases)
		? showTables()
		: Promise.allSettled(
				databases.map(database => execute(`SHOW TABLES IN DATABASE "${removeQuotes(database.name)}";`)),
			);

const showSchemasByDatabase = async databaseName =>
	databaseName ? showSchemasInDatabase(databaseName) : showSchemas();

const showDatabases = () => execute('SHOW DATABASES;');

const showSchemas = () => execute('SHOW SCHEMAS;');

const showSchemasInDatabase = databaseName => execute(`SHOW SCHEMAS IN DATABASE "${removeQuotes(databaseName)}";`);

const showExternalTables = ({ options = '' } = {}) => execute(`SHOW EXTERNAL TABLES${options};`);

const showViews = ({ options = '' } = {}) => execute(`SHOW VIEWS${options};`);

const showMaterializedViews = ({ options = '' } = {}) => execute(`SHOW MATERIALIZED VIEWS${options};`);

const showIcebergTables = ({ options = '' } = {}) => execute(`SHOW ICEBERG TABLES${options};`);

const describeTable = ({ tableType = '', params = '' } = {}) => execute(`DESCRIBE${tableType} TABLE${params};`);

const annotateView = row => ({ ...row, name: `${row.name} (v)` });

const splitEntityNames = names => {
	const namesByCategory = _.partition(names, isView);

	return { views: namesByCategory[0].map(name => name.slice(0, -4)), tables: namesByCategory[1] };
};

const isView = name => name.slice(-4) === ' (v)';

const getSchemasInfo = async ({ databaseName }) => {
	const schemas = await showSchemasByDatabase(databaseName).catch(err => [{ status: 'error', message: err.message }]);

	if (schemas[0]?.status === 'error') {
		return schemas;
	}

	return schemas.map(schema => ({
		name: schema.name,
		database: schema.database_name,
		isDefault: schema.is_default,
		isCurrent: schema.is_current,
	}));
};

const getNamesBySchemas = entitiesRows => {
	return entitiesRows.reduce((namesBySchemas, entityRow) => {
		const schema = entityRow.schema_name;
		if (schema === 'INFORMATION_SCHEMA') {
			return namesBySchemas;
		}

		return {
			...namesBySchemas,
			[schema]: [..._.get(namesBySchemas, schema, []), entityRow.name],
		};
	}, {});
};

const getRowsByDatabases = entitiesRows => {
	return entitiesRows.reduce((entitiesByDatabases, entityRow) => {
		const database = entityRow.database_name;

		return {
			...entitiesByDatabases,
			[database]: [..._.get(entitiesByDatabases, database, []), entityRow],
		};
	}, {});
};

const logErrorAndReturnEmptyArray =
	({ logger, query = '' }) =>
	err => {
		logger.log('error', err, `"${query}" query execution error`);
		return [];
	};

const logTablesMeta = async ({ logger, tables = [], icebergTables = [] }) => {
	if (!tables.length || !logger) {
		return;
	}

	const combinedMeta = [];
	for (const table of tables) {
		try {
			const { database_name, name, rows, is_dynamic, is_external, is_iceberg } = table;
			let metaInfo =
				`${database_name}.${name}: ` +
				`rows=${rows}; ` +
				`is_dynamic=${is_dynamic}; ` +
				`is_external=${is_external}; ` +
				`is_iceberg=${is_iceberg};`;

			if (is_iceberg === 'Y') {
				const response = await showIcebergTables({ options: ` LIKE '%${name}%'` });
				const icebergMeta = _.head(response);
				if (icebergMeta) {
					metaInfo += '\nIceberg table meta: ';
					_.forOwn(icebergMeta, (value, key) => (metaInfo += `${key}=${value};`));
				}
			}

			combinedMeta.push(metaInfo);
		} catch (error) {
			logger.log(
				'error',
				error,
				`Error getting iceberg table metadata for "${table.database_name}.${table.name}"`,
			);
		}
	}

	logger.log('info', combinedMeta, 'Tables metadata');
};

const getEntitiesNames = async ({ databaseName, logger }) => {
	const logError = logErrorAndReturnEmptyArray({ logger, query: 'SHOW' });
	const databaseQueryOptions = databaseName ? ` IN DATABASE "${removeQuotes(databaseName)}"` : '';
	const databases = databaseName ? [{ name: databaseName }] : await showDatabases().catch(logError);
	const tablesRows = await showTablesByDatabases(databases).catch(logError);
	const flatTableRows = tablesRows.flatMap(row => row.value).filter(Boolean);
	const icebergTables = await showIcebergTables({ options: databaseQueryOptions }).catch(logError);

	await logTablesMeta({ logger, tables: flatTableRows, icebergTables });

	const externalTableRows = await showExternalTables({ options: databaseQueryOptions }).catch(logError);
	const viewsRows = await showViews({ options: databaseQueryOptions }).catch(logError);
	const materializedViewsRows = await showMaterializedViews({ options: databaseQueryOptions }).catch(logError);

	const entitiesRows = [
		...flatTableRows,
		...externalTableRows,
		...viewsRows.map(annotateView),
		...materializedViewsRows.map(annotateView),
	];

	const rowsByDatabases = getRowsByDatabases(entitiesRows);

	return Object.keys(rowsByDatabases).reduce((buckets, dbName) => {
		const namesBySchemas = getNamesBySchemas(rowsByDatabases[dbName]);

		return [
			...buckets,
			...Object.keys(namesBySchemas).reduce((buckets, schema) => {
				const entities = namesBySchemas[schema];

				return [
					...buckets,
					{
						dbName: `${dbName}.${schema}`,
						dbCollections: entities,
						isEmpty: !entities.length,
					},
				];
			}, []),
		];
	}, []);
};

const getFullEntityName = (schemaName, tableName) => {
	return [...schemaName.split('.'), tableName].map(addQuotes).join('.');
};

const addQuotes = string => {
	if (/^".*"$/.test(string)) {
		return string;
	}

	return `"${string}"`;
};

const getSchemaDDL = async schemaName => {
	try {
		const fullSchemaName = schemaName.split('.').map(addQuotes).join('.');
		const queryResult = await execute(`SELECT get_ddl('schema', '${fullSchemaName}');`);

		return getFirstObjectItem(_.first(queryResult));
	} catch (err) {
		return '';
	}
};

const getDDL = async (tableName, logger) => {
	try {
		const queryResult = await execute(`SELECT get_ddl('table', '${tableName}');`);

		return getFirstObjectItem(_.first(queryResult));
	} catch (err) {
		logger.log('error', { tableName, message: err.message, stack: err.stack }, 'Getting table DDL');
		return '';
	}
};

const getViewDDL = async (viewName, logger) => {
	try {
		const queryResult = await execute(`SELECT get_ddl('view', '${viewName}');`);

		return getFirstObjectItem(_.first(queryResult));
	} catch (err) {
		logger.log('error', { viewName, message: err.message, stack: err.stack }, 'Getting view DDL');
		return '';
	}
};

const getFirstObjectItem = object => {
	const index = _.first(Object.keys(object));

	return object[index];
};

const getRowsCount = async tableName => {
	try {
		const queryResult = await execute(`SELECT count(*) AS COUNT FROM ${tableName};`);

		return getFirstObjectItem(_.first(queryResult));
	} catch {
		return '';
	}
};

const getDocuments = async (tableName, limit) => {
	try {
		const rows = await execute(`SELECT * FROM ${tableName} LIMIT ${limit};`);

		return filterDocuments(rows.map(filterNull));
	} catch (err) {
		return [];
	}
};

const filterNull = row => {
	return Object.keys(row).reduce((filteredRow, key) => {
		const value = row[key];
		if (_.isNull(value)) {
			return filteredRow;
		}
		return {
			...filteredRow,
			[key]: value,
		};
	}, {});
};

const handleComplexTypesDocuments = (jsonSchema, documents) => {
	try {
		return documents.map(row => {
			return Object.keys(row).reduce((rows, key) => {
				const property = row[key];
				const schemaRow = _.get(jsonSchema, ['properties', key]);
				if (_.toLower(_.get(schemaRow, 'type')) === 'array') {
					if (!_.isArray(property)) {
						return {
							...rows,
							[key]: property,
						};
					}
					return {
						...rows,
						[key]: property.reduce((items, item) => {
							if (_.isObject(item)) {
								return [...items, JSON.stringify(item)];
							}
							return items;
						}, []),
					};
				}
				return {
					...rows,
					[key]: property,
				};
			}, {});
		});
	} catch (err) {
		return documents;
	}
};

const getJsonSchemaFromRows = (documents, rows) => {
	const complexTypes = ['variant', 'object', 'array', 'geography'];
	const properties = rows
		.filter(row => complexTypes.includes(_.toLower(row.type)))
		.reduce((properties, row) => {
			if (_.toLower(row.type) === 'variant') {
				return {
					...properties,
					[row.name]: handleVariant(documents, row.name),
				};
			} else if (_.toLower(row.type) === 'array') {
				return {
					...properties,
					[row.name]: handleArray(documents, row.name),
				};
			} else if (_.toLower(row.type) === 'object') {
				return {
					...properties,
					[row.name]: handleObject(documents, row.name),
				};
			} else if (_.toLower(row.type) === 'geography') {
				return {
					...properties,
					[row.name]: handleGeography(documents, row.name),
				};
			}

			return properties;
		}, {});

	return properties;
};

const handleGeography = (documents, rowName) => {
	const types = documents.reduce((types, document) => {
		if (types.includes('object')) {
			return types;
		}
		const property = document[rowName];
		const type = getVariantPropertyType(property);
		if (types.includes(type)) {
			return types;
		}

		return [...types, type];
	}, []);

	let type = _.first(types);
	let variantProperties = {};
	if (types.includes('object')) {
		type = 'object';
		variantProperties = { properties: {} };
	}
	return { type: 'geography', variantType: 'JSON', subtype: type, ...variantProperties };
};

const handleVariant = (documents, name) => {
	const types = documents.reduce((types, document) => {
		if (types.includes('object')) {
			return types;
		}
		const property = _.get(document, name);
		const type = getVariantPropertyType(property);

		if (types.includes(type)) {
			return types;
		}

		return [...types, type];
	}, []);

	let variantProperties = {};
	let type = _.first(types);
	if (types.includes('object')) {
		type = 'object';
	} else if (types.includes('array')) {
		type = 'array';
	} else if (type === 'null' && types.length > 1) {
		type = types[1];
	}
	if (type === 'array') {
		variantProperties = { items: [] };
	} else if (type === 'object') {
		variantProperties = { properties: {} };
	}
	return { type: 'variant', variantType: 'JSON', subtype: type, ...variantProperties };
};

const getVariantPropertyType = property => {
	const type = typeof property;

	if (_.isArray(property)) {
		return 'array';
	} else if (_.isNil(property)) {
		return 'null';
	}

	return type;
};

const handleArray = (documents, rowName) => {
	const types = documents.reduce((types, document) => {
		const rawArrayDocuments = document[rowName];
		const arrayDocuments = _.isArray(rawArrayDocuments) ? rawArrayDocuments : [];
		const propertyTypes = arrayDocuments.map(getVariantPropertyType).filter(type => !_.isUndefined(type));

		return [...types, ...propertyTypes];
	}, []);

	return {
		type: 'array',
		items: _.uniq(types).map(type => {
			let variantProperties = {};
			type = _.isArray(type) ? _.first(type) : type;

			if (type === 'array') {
				variantProperties = { items: [] };
			} else if (type === 'object') {
				variantProperties = { properties: {} };
			}

			return { type: 'variant', subtype: type, ...variantProperties };
		}),
	};
};

const handleObject = (documents, rowName) => {
	const objectDocuments = documents.map(document => _.get(document, rowName), {});
	const objectKeys = objectDocuments.reduce((rows, document) => {
		if (!_.isPlainObject(document)) {
			return rows;
		}
		const keys = Object.keys(document);
		return _.uniq([...rows, ...keys]);
	}, []);
	const objectRows = objectKeys.map(key => ({ name: key, type: 'variant' }));

	return {
		type: 'object',
		subtype: 'json',
		properties: getJsonSchemaFromRows(objectDocuments, objectRows),
	};
};

const getJsonSchema = async (logger, limit, tableName) => {
	try {
		const rows = await execute(`DESC TABLE ${tableName};`);
		const hasJsonFields = rows.some(row =>
			['variant', 'object', 'array', 'geography'].includes(_.toLower(row.type)),
		);
		if (!hasJsonFields) {
			return {
				jsonSchema: { properties: {} },
				documents: [],
			};
		}

		const documents = await getDocuments(tableName, limit).catch(err => {
			logger.log('error', err.message, 'Connection');
			return [];
		});

		return {
			documents,
			jsonSchema: {
				properties: getJsonSchemaFromRows(documents, rows),
			},
		};
	} catch (err) {
		const documents = await getDocuments(tableName, limit).catch(err => {
			logger.log('error', err.message, 'Connection');
			return [];
		});

		return {
			documents,
			jsonSchema: {
				properties: {},
			},
		};
	}
};

const removeLinear = str => {
	return (str || '').replace(/^linear([\s\S]*)$/im, '$1');
};
const removeBrackets = str => {
	return (str || '').replace(/^\(([\s\S]*)\)$/im, '$1');
};

const getVariantName = str => {
	return _.first(str.split(':'));
};

const handleClusteringKey = (fieldsNames, keysExpression) => {
	if (!keysExpression) {
		return;
	}
	keysExpression = removeBrackets(removeLinear(keysExpression));
	const items = keysExpression.split(',');

	return items.reduce((keys, item) => {
		const args = item.split('(');
		let expression = '';

		const clusteringKeys = args.reduce((acc, arg) => {
			const rawName = _.get(_.trim(arg).match(/^(\S+)/), 1);
			if (!rawName) {
				if (expression) {
					expression += '(';
				}
				expression += arg;
				return acc;
			}
			const name = removeQuotes(_.last(getVariantName(_.trim(rawName)).split('.')));
			const fieldName = fieldsNames.find(fieldName => _.toUpper(fieldName) === _.toUpper(name));
			if (!fieldName) {
				if (expression) {
					expression += '(';
				}
				expression += arg;
				return acc;
			}

			if (name === _.trim(removeQuotes(item))) {
				acc.push({ name: fieldName });

				return acc;
			}

			if (expression) {
				expression += '(';
			}
			expression += arg.replace(new RegExp(`^${name}`), '${name}');

			acc.push({ name: fieldName });

			return acc;
		}, []);

		if (!_.isEmpty(clusteringKeys)) {
			return [
				...keys,
				{
					clusteringKey: clusteringKeys,
					expression: _.trim(expression),
				},
			];
		}
		const lastKey = _.last(keys);
		let complexExpression = _.get(lastKey, 'expression', '');
		if (complexExpression) {
			complexExpression += ',';
		}
		return [
			...keys.slice(0, -1),
			{
				...lastKey,
				expression: complexExpression + expression,
			},
		];
	}, []);
};

const getEntityData = async ({ fullTableName, logger }) => {
	const [dbName, schemaName, tableName] = fullTableName.split('.');

	try {
		let entityLevelData = {};
		const rows = await execute(
			`select * from "${removeQuotes(dbName)}".information_schema.tables where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`,
		);
		const data = _.first(rows);

		const fields = await describeTable({ params: fullTableName }).catch(
			logErrorAndReturnEmptyArray({ logger, query: 'DESCRIBE TABLE' }),
		);

		const fieldsNames = fields.map(field => field.name);
		const clusteringKey = handleClusteringKey(fieldsNames, _.get(data, 'CLUSTERING_KEY', ''));
		const stageData = await describeTable({ params: `${fullTableName} type = stage` });

		const fileFormat = _.toUpper(
			_.get(
				stageData.find(item => item.property === 'TYPE'),
				'property_value',
				'',
			),
		);
		const isDynamic = _.toUpper(_.get(data, 'IS_DYNAMIC', '')) === 'YES';
		const isIceberg = _.toUpper(_.get(data, 'IS_ICEBERG', '')) === 'YES';

		if (isDynamic) {
			const dynamicTableData = await getDynamicTableData({ fullTableName, logger });
			entityLevelData = { ...data, ...dynamicTableData, iceberg: isIceberg };
		}

		let external = _.toUpper(_.get(data, 'TABLE_TYPE', '')) === 'EXTERNAL TABLE';
		if (!external && checkExternalMetaFields(fields)) {
			logger.log(
				'info',
				{
					message: `External table was detected by meta properties. Table type: ${_.get(data, 'TABLE_TYPE', '')}`,
					containerName: schemaName,
					entityName: tableName,
				},
				'Getting external table data',
			);
			external = true;
		}
		if (external) {
			const externalTableData = await getExternalTableData(fullTableName);
			entityLevelData = { ...data, ...externalTableData };
		}
		if (!fileFormat) {
			entityLevelData.customFileFormatName = _.toUpper(
				_.get(
					stageData.find(item => item.property === 'FORMAT_NAME'),
					'property_value',
					'',
				),
			);
		}

		const fileFormatKey = external ? 'externalFileFormat' : 'fileFormat';
		if (hasStageCopyOptions(stageData)) {
			entityLevelData.stageCopyOptions = getStageCopyOptions(stageData);
		}

		return {
			...entityLevelData,
			[fileFormatKey]: fileFormat || 'custom',
			external,
			clusteringKey,
			formatTypeOptions: getFileFormatOptions(stageData),
			transient: Boolean(_.get(data, 'IS_TRANSIENT', false) && _.get(data, 'IS_TRANSIENT') !== 'NO'),
			description: _.get(data, 'COMMENT') || '',
		};
	} catch (err) {
		return {};
	}
};

const checkExternalMetaFields = fields => {
	const metaField = _.first(fields) || {};

	return metaField.name === 'VALUE' && metaField.type === 'VARIANT';
};

const getFileFormatOptions = stageData => {
	return getOptions(stageData.filter(item => item.parent_property === 'STAGE_FILE_FORMAT'));
};

const hasStageCopyOptions = stageData => {
	return !!stageData
		.filter(item => item.parent_property === 'STAGE_COPY_OPTIONS')
		.find(item => item.property_value !== item.property_default);
};

const getStageCopyOptions = stageData => {
	return getOptions(stageData.filter(item => item.parent_property === 'STAGE_COPY_OPTIONS'));
};

const getOptions = optionsData => {
	return optionsData.reduce((options, item) => {
		if (item.property_type === 'List') {
			const list = item.property_value.slice(1, -1).split(',').map(_.trim);
			if (!_.isArray(list)) {
				return options;
			}

			return {
				...options,
				[item.property]: list.map(value => ({ [`${item.property}_item`]: value })),
			};
		}
		if (item.property_type === 'Boolean') {
			return {
				...options,
				[item.property]: item.property_value && item.property_value !== 'false',
			};
		}
		if (item.property_type === 'Long') {
			if (item.property === 'SIZE_LIMIT') {
				return {
					...options,
					sizeLimit: !!item.property_value,
					[item.property]: _.toNumber(item.property_value),
				};
			}
			return {
				...options,
				[item.property]: _.toNumber(item.property_value),
			};
		}

		return {
			...options,
			[item.property]: item.property_value,
		};
	}, {});
};

const getViewData = async (fullName, logger) => {
	const [dbName, schemaName, tableName] = fullName.split('.');

	try {
		const rows = await execute(
			`select * from "${removeQuotes(dbName)}".information_schema.views where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`,
		);
		const data = _.first(rows);
		if (!_.isEmpty(data)) {
			return {
				secure: _.get(data, 'IS_SECURE') && _.get(data, 'IS_SECURE') !== 'NO',
				description: _.get(data, 'COMMENT') || '',
			};
		}
		const materializedViewData = await getMaterializedViewData(fullName);

		return materializedViewData;
	} catch (err) {
		logger.log('error', { viewName: fullName, message: err.message, stack: err.stack }, 'Getting view data');
		return {};
	}
};

const getMaterializedViewData = async fullName => {
	const [dbName, schemaName, tableName] = fullName.split('.');

	try {
		const rows = await execute(
			`select * from "${removeQuotes(dbName)}".information_schema.tables where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`,
		);
		const data = _.first(rows);
		return {
			secure: _.get(data, 'IS_SECURE') && _.get(data, 'IS_SECURE') !== 'NO',
			description: _.get(data, 'COMMENT') || '',
		};
	} catch (err) {
		return {};
	}
};

function getOptionValue({ query, optionName }) {
	const regex = new RegExp(`${optionName}\\s*=\\s*'([^']*)'|${optionName}\\s*=\\s*(\\w+)`, 'i');
	const match = query.match(regex);

	if (match) {
		return match[1] || match[2];
	}
}

function getTargetLagStringValue(timeString) {
	const timePattern = /(\d+)\s*(day|hour|minute|second)s?/g;
	let totalSeconds = 0;
	let match;
	while ((match = timePattern.exec(timeString)) !== null) {
		const value = parseInt(match[1]);
		const unit = match[2];

		switch (unit) {
			case 'day':
				totalSeconds += value * SECONDS_IN_DAY;
				break;
			case 'hour':
				totalSeconds += value * SECONDS_IN_HOUR;
				break;
			case 'minute':
				totalSeconds += value * SECONDS_IN_MINUTE;
				break;
			case 'second':
				totalSeconds += value;
				break;
		}
	}

	if (totalSeconds >= SECONDS_IN_DAY) {
		const days = totalSeconds / SECONDS_IN_DAY;
		return {
			targetLagAmount: Math.round(days),
			targetLagTimeSpan: 'days',
		};
	} else if (totalSeconds >= SECONDS_IN_HOUR) {
		const hours = totalSeconds / SECONDS_IN_HOUR;
		return {
			targetLagAmount: Math.round(hours),
			targetLagTimeSpan: 'hours',
		};
	} else if (totalSeconds >= SECONDS_IN_MINUTE) {
		const minutes = totalSeconds / SECONDS_IN_MINUTE;
		return {
			targetLagAmount: Math.round(minutes),
			targetLagTimeSpan: 'minutes',
		};
	}
	return {
		targetLagAmount: Math.round(totalSeconds),
		targetLagTimeSpan: 'seconds',
	};
}

function getTargetLag(targetLag) {
	if (targetLag === 'DOWNSTREAM') {
		return {
			targetLagDownstream: true,
		};
	}

	return getTargetLagStringValue(targetLag);
}

const getDynamicTableData = async ({ fullTableName, logger }) => {
	const [dbName, schemaName, tableName] = fullTableName.split('.');

	try {
		const rows = await execute(
			`SHOW DYNAMIC TABLES LIKE '${removeQuotes(tableName)}' IN SCHEMA "${removeQuotes(dbName)}"."${removeQuotes(schemaName)}"`,
		);

		const data = _.first(rows);
		const refreshMode = _.get(data, 'refresh_mode', '').toLowerCase();
		const warehouse = _.get(data, 'warehouse', '');
		const query = _.get(data, 'text', '');
		const asClauseKeyword = 'AS\n';

		const targetLag = getTargetLag(_.get(data, 'target_lag', ''));
		const externalVolume = getOptionValue({ query, optionName: 'EXTERNAL_VOLUME' });
		const initialize = getOptionValue({ query, optionName: 'INITIALIZE' }).toLowerCase();
		const catalog = getOptionValue({ query, optionName: 'CATALOG' });
		const baseLocation = getOptionValue({ query, optionName: 'BASE_LOCATION' });
		const DATA_RETENTION_TIME_IN_DAYS = getOptionValue({ query, optionName: 'DATA_RETENTION_TIME_IN_DAYS' });
		const MAX_DATA_EXTENSION_TIME_IN_DAYS = getOptionValue({
			query,
			optionName: 'MAX_DATA_EXTENSION_TIME_IN_DAYS',
		});

		const selectStatement = query
			.slice(query.indexOf(asClauseKeyword) + asClauseKeyword.length, -1)
			.split('\n')
			.filter(Boolean)
			.map(line => (line.startsWith('\t') ? line.slice(1, -1) : line))
			.join('\n');

		return {
			dynamic: true,
			targetLag,
			refreshMode,
			warehouse,
			selectStatement,
			externalVolume,
			catalog,
			initialize,
			baseLocation,
			DATA_RETENTION_TIME_IN_DAYS,
			MAX_DATA_EXTENSION_TIME_IN_DAYS,
		};
	} catch (error) {
		logger.log(
			'error',
			{ error },
			`Reverse Engineering error while retrieving schema data from table ${fullTableName}`,
		);

		return {};
	}
};

const getExternalTableData = async fullName => {
	const [dbName, schemaName, tableName] = fullName.split('.');

	try {
		const rows = await execute(
			`select * from "${removeQuotes(dbName)}".information_schema.EXTERNAL_TABLES where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`,
		);
		const data = _.first(rows);
		const location = _.get(data, 'LOCATION', '').split('/');
		const namespace = _.first(location);
		const path = location.slice(1).join('/');
		return {
			location: {
				namespace,
				path: path ? '/' + path : '',
			},
		};
	} catch (err) {
		return {};
	}
};

const getFunctions = async (dbName, schemaName) => {
	const rows = await execute(
		`select * from "${removeQuotes(dbName)}".information_schema.functions where FUNCTION_SCHEMA='${schemaName}'`,
	);

	return rows.map(row => {
		const functionArguments = row['ARGUMENT_SIGNATURE'] === '()' ? '' : row['ARGUMENT_SIGNATURE'];

		return {
			name: row['FUNCTION_NAME'],
			functionLanguage: _.toLower(row['FUNCTION_LANGUAGE']),
			functionArguments,
			functionReturnType: row['DATA_TYPE'],
			functionBody: row['FUNCTION_DEFINITION'],
			functionDescription: row['COMMENT'] || '',
		};
	});
};

const getProcedures = async (dbName, schemaName) => {
	const rows = await execute(
		`select * from "${removeQuotes(dbName)}".information_schema.procedures where PROCEDURE_SCHEMA='${schemaName}'`,
	);

	return rows.map(row => {
		const procedureArguments =
			row['ARGUMENT_SIGNATURE'] === '()' ? '' : row['ARGUMENT_SIGNATURE'].replace(/[()]/gm, '');

		return {
			name: row['PROCEDURE_NAME'],
			orReplace: true,
			language: _.toLower(row['PROCEDURE_LANGUAGE']),
			inputArgs: procedureArguments,
			returnType: row['DATA_TYPE'],
			body: row['PROCEDURE_DEFINITION'],
			description: row['COMMENT'] || '',
		};
	});
};

const getStages = async (dbName, schemaName) => {
	const rows = await execute(
		`select * from "${removeQuotes(dbName)}".information_schema.stages where STAGE_SCHEMA='${schemaName}'`,
	);

	return rows.map(row => {
		return {
			name: row['STAGE_NAME'],
			url: row['STAGE_URL'],
		};
	});
};

const getSequences = async (dbName, schemaName) => {
	const rows = await execute(
		`select * from "${removeQuotes(dbName)}".information_schema.sequences where SEQUENCE_SCHEMA='${schemaName}'`,
	);

	return rows.map(row => ({
		name: row['SEQUENCE_NAME'],
		sequenceStart: Number(_.get(row, 'START_VALUE')) || 1,
		sequenceIncrement: Number(_.get(row, 'INCREMENT')) || 1,
		sequenceComments: row['COMMENT'] || '',
	}));
};

const convertFileFormatsOptions = optionsData => {
	const selectOptions = ['COMPRESSION', 'BINARY_FORMAT'];
	const groupOptions = ['NULL_IF'];
	const checkboxOptions = [
		'ERROR_ON_COLUMN_COUNT_MISMATCH',
		'VALIDATE_UTF8',
		'EMPTY_FIELD_AS_NULL',
		'ALLOW_DUPLICATE',
		'STRIP_OUTER_ARRAY',
		'STRIP_NULL_VALUES',
		'IGNORE_UTF8_ERRORS',
		'TRIM_SPACE',
		'SNAPPY_COMPRESSION',
		'BINARY_AS_TEXT',
		'PRESERVE_SPACE',
		'STRIP_OUTER_ELEMENT',
		'DISABLE_SNOWFLAKE_DATA',
		'DISABLE_AUTO_CONVERT',
		'SKIP_BYTE_ORDER_MARK',
	];
	const numericOptions = ['SKIP_HEADER'];

	return Object.keys(optionsData).reduce((options, key) => {
		const value = _.isNil(optionsData[key]) ? '' : optionsData[key];
		if (selectOptions.includes(key)) {
			return { ...options, [key]: _.toUpper(value) };
		} else if (groupOptions.includes(key)) {
			return {
				...options,
				[key]: value
					.slice(1, -1)
					.split(',')
					.map(value => ({ [`${key}_item`]: _.trim(value) })),
			};
		} else if (checkboxOptions.includes(key)) {
			return { ...options, [key]: _.isBoolean(value) ? value : _.toUpper(value) !== 'FALSE' };
		} else if (numericOptions.includes(key)) {
			return { ...options, [key]: isNaN(value) ? '' : Number(value) };
		}

		return { ...options, [key]: value };
	}, {});
};

const getFileFormats = async (dbName, schemaName) => {
	const rows = await execute(
		`select * from "${removeQuotes(dbName)}".information_schema.FILE_FORMATS where FILE_FORMAT_SCHEMA='${schemaName}'`,
	);

	return Promise.all(
		rows.map(async row => {
			const describeProperties = await execute(
				`DESCRIBE FILE FORMAT "${removeQuotes(dbName)}"."${removeQuotes(schemaName)}"."${row['FILE_FORMAT_NAME']}"`,
			);
			const propertiesRow = describeProperties.reduce(
				(properties, { property, property_value }) => ({
					...properties,
					[property]: property_value,
				}),
				{},
			);

			return {
				name: row['FILE_FORMAT_NAME'],
				fileFormat: _.toUpper(row['FILE_FORMAT_TYPE']),
				formatTypeOptions: convertFileFormatsOptions({ ...row, ...propertiesRow }),
				fileFormatComments: row['COMMENT'] || '',
			};
		}),
	);
};

const getContainerData = async ({ schema, logger }) => {
	if (containers[schema]) {
		return containers[schema];
	}
	const [dbName, schemaName] = schema.split('.');
	const dbNameWithoutQuotes = removeQuotes(dbName);

	try {
		const dbRows = await execute(
			`select * from "${dbNameWithoutQuotes}".information_schema.databases where DATABASE_NAME='${dbNameWithoutQuotes}'`,
		);
		const dbData = _.first(dbRows);
		const schemaRows = await execute(
			`select * from "${dbNameWithoutQuotes}".information_schema.schemata where SCHEMA_NAME='${removeQuotes(schemaName)}'`,
		);
		const isCaseSensitive = _.toUpper(schemaName) !== schemaName;
		const schemaData = _.first(schemaRows);
		const functions = await getFunctions(dbName, schemaName);
		const procedures = await getProcedures(dbName, schemaName);
		const stages = await getStages(dbName, schemaName);
		const sequences = await getSequences(dbName, schemaName);
		const fileFormats = await getFileFormats(dbName, schemaName);
		const tags = await getTags({ dbName, schemaName, logger });
		const schemaTags = await getSchemaTags({ dbName, schemaName, logger });

		const data = {
			transient: Boolean(_.get(schemaData, 'IS_TRANSIENT', false) && _.get(schemaData, 'IS_TRANSIENT') !== 'NO'),
			description: _.get(schemaData, 'COMMENT') || _.get(dbData, 'COMMENT') || '',
			managedAccess: _.get(schemaData, 'IS_TRANSIENT') !== 'NO',
			UDFs: functions,
			Procedures: procedures,
			stages,
			sequences,
			fileFormats,
			isCaseSensitive,
			tags,
			schemaTags,
		};
		containers[schema] = data;

		return data;
	} catch (error) {
		logger.log('error', { error }, 'Reverse Engineering error while retrieving schema data');

		return {};
	}
};

const getTagAllowedValues = ({ values, logger }) => {
	try {
		if (typeof values !== 'string') {
			return [];
		}
		const allowedValues = JSON.parse(values);
		return allowedValues.map(value => ({ value }));
	} catch (error) {
		logger.log('error', { error }, 'Reverse Engineering error while retrieving tag allowed values');

		return [];
	}
};

const getTags = async ({ dbName, schemaName, logger }) => {
	try {
		const rows = await execute(`SHOW TAGS IN SCHEMA "${removeQuotes(dbName)}"."${removeQuotes(schemaName)}";`);

		return rows.map(row => ({
			name: row.name,
			description: row.comment,
			allowedValues: getTagAllowedValues({ values: row.allowed_values, logger }),
		}));
	} catch (error) {
		logger.log('error', { error }, 'Reverse Engineering error while retrieving tags');

		return [];
	}
};

const getSchemaTags = async ({ dbName, schemaName, logger }) => {
	try {
		const rows = await execute(
			`SELECT TAG_DATABASE, TAG_SCHEMA, TAG_NAME, TAG_VALUE FROM TABLE("${removeQuotes(dbName)}".information_schema.tag_references('"${removeQuotes(dbName)}"."${removeQuotes(schemaName)}"', 'SCHEMA'));`,
		);

		return rows.map(row => ({
			tagName: row['TAG_NAME'],
			tagValue: row['TAG_VALUE'],
		}));
	} catch (error) {
		logger.log('error', { error }, 'Reverse Engineering error while retrieving schema tags');

		return [];
	}
};

const hasCloudPlatform = accountName => {
	return CLOUD_PLATFORM_POSTFIXES.some(postfix => accountName.endsWith(postfix));
};

const getObjSize = obj => {
	if (!obj) {
		return 0;
	}

	return BSON.calculateObjectSize(obj) / (1024 * 1024);
};

const filterDocuments = rows => {
	const size = getObjSize(rows);

	if (size < 200) {
		return rows;
	}

	return filterDocuments(rows.slice(0, rows.length / 2));
};

const applyScript = async script => {
	return await execute(script);
};

module.exports = {
	connect,
	disconnect,
	testConnection,
	getEntitiesNames,
	getDDL,
	getViewDDL,
	getSchemaDDL,
	getFullEntityName,
	getRowsCount,
	getDocuments,
	handleComplexTypesDocuments,
	getJsonSchema,
	splitEntityNames,
	getEntityData,
	getViewData,
	getContainerData,
	getAccount,
	getAccessUrl,
	getSchemasInfo,
	applyScript,
};
