const snowflake = require('../custom_modules/snowflake-sdk');
const axios = require('axios');
const uuid = require('uuid');
const BSON = require('bson');

const ALREADY_CONNECTED_STATUS = 405502;
const CONNECTION_TIMED_OUT_CODE  = 'CONNECTION_TIMED_OUT'

let connection;
let containers = {};

const noConnectionError = { message: 'Connection error' };
const oktaAuthenticatorError = { message: 'Can\'t get SSO URL. Please, check the authenticator' };
const oktaCredentialsError = { message: 'Incorrect Okta username/password or MFA is enabled. Please, check credentials or use the "Identity Provider SSO (via external browser)" for MFA auth' };
const oktaMFAError = { message: 'Native Okta auth doesn\'t support MFA. Please, use the "Identity Provider SSO (via external browser)" auth instead' };

const DEFAULT_CLIENT_APP_ID = 'JavaScript';
const DEFAULT_CLIENT_APP_VERSION = '1.5.1';
const DEFAULT_WAREHOUSE = 'COMPUTE_WH';
const DEFAULT_ROLE = 'PUBLIC';
const HACKOLADE_APPLICATION = 'Hackolade';
let _;

const connect = async (logger, { host, username, password, authType, authenticator, proofKey, token, role, warehouse, name, cloudPlatform, queryRequestTimeout }) => {
	const account = getAccount(host);
	const accessUrl = getAccessUrl(account);
	const timeout = _.toNumber(queryRequestTimeout) || 2 * 60 * 1000;

	logger.log('info', `Connection name: ${name}\nCloud platform: ${cloudPlatform}\nHost: ${host}\nAuth type: ${authType}\nUsername: ${username}\nWarehouse: ${warehouse}\nRole: ${role}`, 'Connection');

	if (authType === 'okta') {
		return authByOkta(logger, { account, accessUrl, username, password, authenticator, role, warehouse, timeout });
	} if (authType === 'externalbrowser') {
		return authByExternalBrowser(logger, { account, accessUrl, token, proofKey, username, password, role, warehouse, timeout })
	} else {
		return authByCredentials({ account, username, password, role, warehouse, timeout });
	}
};

const authByOkta = async (logger, { account, accessUrl, username, password, authenticator, role, timeout, warehouse = DEFAULT_WAREHOUSE }) => {
	logger.log('info', `Authenticator: ${authenticator}`, 'Connection');
	const accountName = getAccountName(account);
	const ssoUrlsData = await axios.post(`${accessUrl}/session/authenticator-request?Application=${HACKOLADE_APPLICATION}`, { data: {
		ACCOUNT_NAME: accountName, 
		LOGIN_NAME: username,
		AUTHENTICATOR: getOktaAuthenticatorUrl(authenticator)
	} });

	logger.log('info', `Starting Okta connection...`, 'Connection');
	const tokenUrl = _.get(ssoUrlsData, 'data.data.tokenUrl', '');
	const authNUrl = tokenUrl.replace(/api\/v1\/.*/, 'api/v1/authn');
	const ssoUrl = _.get(ssoUrlsData, 'data.data.ssoUrl', '');
	logger.log('info', `Token URL: ${tokenUrl}\nSSO URL: ${ssoUrl}`, 'Connection');

	if (!tokenUrl || !ssoUrl) {
		return Promise.reject(oktaAuthenticatorError);
	}

	const authNData = await axios.post(authNUrl, { username, password, options: {
		multiOptionalFactorEnroll: false,
		warnBeforePasswordExpired: false,
	}}).catch(err => ({}));
	const status =  _.get(authNData, 'data.status', 'SUCCESS');
	const authToken = _.get(authNData, 'data.sessionToken', '');
	if (status.startsWith('MFA')) {
		return Promise.reject(oktaMFAError);
	}

	const identityProviderTokenData = await axios.post(tokenUrl, { username, password }).catch(err => {
		return authToken ? {} : Promise.reject(oktaCredentialsError);
	});

	logger.log('info', `Successfully connected to Okta`, 'Connection');
	const identityProviderToken = _.get(identityProviderTokenData, 'data.cookieToken', '') || authToken;
	if (!identityProviderToken) {
		return Promise.reject(oktaCredentialsError);
	}

	logger.log('info', `One-time IDP token has been provided`, 'Connection');

	const samlUrl = `${ssoUrl}?onetimetoken=${encodeURIComponent(identityProviderToken)}&RelayState=${encodeURIComponent('/some/deep/link')}`;
	const samlResponseData = await axios.get(samlUrl, { headers: { HTTP_HEADER_ACCEPT: '*/*' } });
	const rawSamlResponse = _.get(samlResponseData, 'data', '');

	if (!rawSamlResponse) {	
		logger.log('info', `Warning: RAW_SAML_RESPONSE is empty`, 'Connection');
	} else {
		logger.log('info', `RAW_SAML_RESPONSE has been provided`, 'Connection')
	}

	const requestId = uuid.v4();
	let authUrl = `${accessUrl}/session/v1/login-request?request_id=${encodeURIComponent(requestId)}&Application=${HACKOLADE_APPLICATION}`;
	role = role || DEFAULT_ROLE;

	authUrl += `&roleName=${encodeURIComponent(getRole(role))}`;
	authUrl += `&warehouse=${encodeURIComponent(warehouse)}`;

	const authData = await axios.post(authUrl, {
		data: {
			CLIENT_APP_ID: DEFAULT_CLIENT_APP_ID,
			CLIENT_APP_VERSION: DEFAULT_CLIENT_APP_VERSION,
			RAW_SAML_RESPONSE: rawSamlResponse,
			LOGIN_NAME: username,
			ACCOUNT_NAME: accountName,
			CLIENT_ENVIRONMENT: {
				APPLICATION: HACKOLADE_APPLICATION,
			},
		}
	});
	let tokensData = authData.data;
	if (_.isString(tokensData)) {
		try {
			tokensData = JSON.parse(tokensData);
		} catch (err) {}
	}
	if (!tokensData.success) {
		return Promise.reject(tokensData.message);
	}
	const masterToken = _.get(tokensData, 'data.masterToken', '');
	const sessionToken = _.get(tokensData, 'data.token', '');
	logger.log('info', `Tokens have been provided`, 'Connection');

	return connectWithTimeout({
		accessUrl,
		masterToken,
		sessionToken,
		account,
		username,
		password,
		role,
		warehouse,
		timeout
	}, (error) => error.code === ALREADY_CONNECTED_STATUS)
};

const authByExternalBrowser = async (logger, { token, accessUrl, proofKey, username, account, role, timeout, warehouse = DEFAULT_WAREHOUSE }) => {
	const accountName = getAccountName(account);
	warehouse = _.trim(warehouse);
	role = _.trim(role);

	const requestId = uuid.v4();
	let authUrl = `${accessUrl}/session/v1/login-request?request_id=${encodeURIComponent(requestId)}&Application=${HACKOLADE_APPLICATION}`;
	role = role || DEFAULT_ROLE;
	authUrl += `&roleName=${encodeURIComponent(getRole(role))}`;

	const authData = await axios.post(authUrl, {
		data: {
			CLIENT_APP_ID: DEFAULT_CLIENT_APP_ID,
			CLIENT_APP_VERSION: DEFAULT_CLIENT_APP_VERSION,
			TOKEN: token,
			AUTHENTICATOR: 'EXTERNALBROWSER',
			PROOF_KEY: proofKey,
			LOGIN_NAME: username,
			ACCOUNT_NAME: accountName,
			CLIENT_ENVIRONMENT: {
				APPLICATION: HACKOLADE_APPLICATION,
			},
		}}, { 
		headers: {
			Accept: 'application/json',
			Authorization: 'Basic'
		}
	});
	let tokensData = authData.data;
	if (_.isString(tokensData)) {
		try {
			tokensData = JSON.parse(tokensData);
		} catch (err) {}
	}
	if (!tokensData.success) {
		return Promise.reject(tokensData.message);
	}
	const masterToken = _.get(tokensData, 'data.masterToken', '');
	const sessionToken = _.get(tokensData, 'data.token', '');
	logger.log('info', `Tokens have been provided`, 'Connection');

	await connectWithTimeout({
		accessUrl,
		masterToken,
		sessionToken,
		account,
		username,
		role,
		warehouse,
		password: 'password',
		timeout
	}, (error) => error.code === ALREADY_CONNECTED_STATUS)

	return new Promise((resolve, reject) => {
		execute(`USE WAREHOUSE "${removeQuotes(warehouse)}";`)
			.then(resolve, async err => {
				logger.log('error', err.message, 'Connection');
				await execute(`USE ROLE "${role}"`).catch(err => { });
				let userData = await execute(`DESC USER "${username}"`).catch(err => []);
				userData = userData.filter(data => data.property !== 'PASSWORD');
				logger.log('info', `User info: ${JSON.stringify(userData)}`, 'Connection');
				let warehouses = await execute(`SHOW WAREHOUSES;`).catch(err => { logger.log('error', err.message, 'Connection'); return [] });
				const roles = await execute(`SHOW ROLES;`).catch(err => { logger.log('error', err.message, 'Connection'); return [] });
				const roleNames = roles.map(role => role.name);
				const defaultRoleData = userData.find(data => _.toUpper(_.get(data, 'property')) === 'DEFAULT_ROLE');
				if (_.isEmpty(warehouses)) {
					const userRole = _.get(defaultRoleData, 'value', '');
					if (userRole !== 'null') {
						await execute(`USE ROLE "${userRole}"`).catch(err => { });
					}
					warehouses = await execute(`SHOW WAREHOUSES;`).catch(err => { logger.log('error', err.message, 'Connection'); return [] });
					if (_.isEmpty(warehouses)) {
						reject('Warehouse is not available. Please check your role and warehouse');
					}
				}
				const names = warehouses.map(wh => wh.name);

				const defaultWarehouseData = userData.find(data => _.toUpper(_.get(data, 'property')) === 'DEFAULT_WAREHOUSE');
				const defaultUserWarehouse = _.get(defaultWarehouseData, 'value', '');
				const defaultWarehouse = names.includes(defaultUserWarehouse) ? defaultUserWarehouse : _.first(names);

				logger.log('info', `Available warehouses: ${names.join()}; Available roles: ${roleNames.join()}`, 'Connection');
				logger.log('info', `Fallback to ${defaultWarehouse} warehouse`, 'Connection');

				execute(`USE WAREHOUSE "${removeQuotes(defaultWarehouse)}";`).then(
					resolve,
					async err => {
						const currentInfo = await execute(`select current_warehouse() as warehouse, current_role() as role;`).catch(err => []);
						const infoRow = _.first(currentInfo);
						const currentWarehouse = _.get(infoRow, 'WAREHOUSE', '');
						const currentRole = _.get(infoRow, 'ROLE', '');
						logger.log('info', `Current warehouse: ${currentWarehouse}\n Current role: ${currentRole}`, 'Connection');
						resolve();
					}
				);
			});
	});
};

const getOktaAuthenticatorUrl = (authenticator = '') => {
	if (/^http(s)?/mi.test(authenticator)) {
		return authenticator;
	}

	if (/\.okta\.com\/?$/.test(authenticator)) {
		return `https://${authenticator}`;
	}

	return `https://${authenticator}.okta.com`;
};

const authByCredentials = ({ account, username, password, role, timeout, warehouse }) => {
	return connectWithTimeout({ account, username, password, role, timeout, warehouse })
};

const connectWithTimeout = ({timeout, ...options}, isErrorAllowed = () => false) => {
	const connectPromise = new Promise((resolve, reject) => {
		connection = snowflake.createConnection(options);
		connection.connect(err => {
			if (err && !isErrorAllowed(err)) {
				connection = null;
				return reject(err); 
			}

			resolve();
		});
	});

	const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => reject(getConnectionTimeoutError(timeout)), timeout));

	return Promise.race([connectPromise, timeoutPromise]).catch(error => {
		if (error.code === CONNECTION_TIMED_OUT_CODE) {
			disconnect();
		}

		throw error;
	})
}

const getConnectionTimeoutError = (timeout) => {
	const error = new Error(`Connection timeout ${timeout} ms exceeded!`);
	error.code = CONNECTION_TIMED_OUT_CODE;

	return error
}

const getAccount = hostUrl => (hostUrl || '')
	.trim()
	.replace(/\.snowflakecomputing\.com.*$/gi,'')
	.replace(/^http(s)?:\/\//gi, '');

const getRole = role => {
	if (!_.isString(role)) {
		return role;
	}

	if (_.first(role) === '"' && _.last(role) === '"') {
		return role;
	}

	if (/^[a-z][a-z\d]*$/i.test(role)) {
		return role;
	}

	return `"${role}"`;
};
	
const getAccessUrl = account => `https://${account}.snowflakecomputing.com`;

const getAccountName = account => _.toUpper(_.first(account.split('.')));

const disconnect = () => {
	connectionRole = '';
	if (!connection) {
		return Promise.reject(noConnectionError);
	}

	return new Promise((resolve, reject) => {
		connection.destroy(err => {
			if (err) {
				return reject(err);
			}
			resolve();
		});
	})
}

const testConnection = async (logger, info) => {
	await connect(logger, info);
	await execute('SELECT 1 as t;');
	await disconnect();
};

const showTables = () => execute('SHOW TABLES;');

const showExternalTables = () => execute('SHOW EXTERNAL TABLES;');

const showViews = () => execute('SHOW VIEWS;');

const showMaterializedViews = () => execute('SHOW MATERIALIZED VIEWS;');

const annotateView = row => ({ ...row, name: `${row.name} (v)`});

const splitEntityNames = names => {
	const namesByCategory =_.partition(names, isView);

	return { views: namesByCategory[0].map(name => name.slice(0, -4)), tables: namesByCategory[1] };
};

const isView = name => name.slice(-4) === ' (v)';

const getNamesBySchemas = entitiesRows => {
	return entitiesRows.reduce((namesBySchemas, entityRow) => {
		const schema = entityRow.schema_name;
		if (schema === 'INFORMATION_SCHEMA') {
			return namesBySchemas;
		}

		return {
			...namesBySchemas,
			[schema] : [
				..._.get(namesBySchemas, schema, []),
				entityRow.name
			]
		};
	}, {});
}

const getRowsByDatabases = entitiesRows => {
	return entitiesRows.reduce((entitiesByDatabases, entityRow) => {
		const database = entityRow.database_name;

		return {
			...entitiesByDatabases,
			[database] : [
				..._.get(entitiesByDatabases, database, []),
				entityRow
			]
		};
	}, {});
};

const getEntitiesNames = async () => {
	const tablesRows = await showTables().catch(e => []);
	const externalTableRows = await showExternalTables().catch(e => []);
	const viewsRows = await showViews().catch(e => []);
	const materializedViewsRows = await showMaterializedViews().catch(e => []);

	const entitiesRows = [
		...tablesRows,
		...externalTableRows,
		...viewsRows.map(annotateView),
		...materializedViewsRows.map(annotateView)
	];

	const rowsByDatabases = getRowsByDatabases(entitiesRows);
	
	return Object.keys(rowsByDatabases).reduce((buckets, dbName) => {
		const namesBySchemas = getNamesBySchemas(rowsByDatabases[dbName]);

		return [
			...buckets,
			...Object.keys(namesBySchemas).reduce((buckets, schema) => {
				const entities = namesBySchemas[schema];

				return [ ...buckets, {
					dbName: `${dbName}.${schema}`,
					dbCollections: entities,
					isEmpty: !entities.length
				}];
			}, [])
		];
	}, []);
};

const getFullEntityName = (schemaName, tableName) => {
	return  [ ...schemaName.split('.'), tableName].map(addQuotes).join('.');
};

const addQuotes = string => {
	if (/^\".*\"$/.test(string)) {
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
		logger.log('error', { tableName, message: err.message, stack: err.stack }, 'Getting table DDL')
		throw err;
	}
};

const getViewDDL = async (viewName, logger) => {
	try {
		const queryResult = await execute(`SELECT get_ddl('view', '${viewName}');`);

		return getFirstObjectItem(_.first(queryResult));
	} catch (err) {
		logger.log('error', { viewName, message: err.message, stack: err.stack }, 'Getting view DDL')
		throw err;
	}
};

const getFirstObjectItem = object => {
	const index = _.first(Object.keys(object));

	return object[index];
}

const execute = command => {
	if (!connection) {
		return Promise.reject(noConnectionError)
	}
	return new Promise((resolve, reject) => {
		connection.execute({
			sqlText: command,
			complete: (err, statement, rows) => {
				if (err) {
					return reject(err);
				}
				resolve(rows)
			}
		})
	});
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
			[key]: value
		};
	}, {});
};

const handleComplexTypesDocuments = (jsonSchema, documents) => {
	try {
		return documents.map(row => {
			return Object.keys(row).reduce((rows, key) => {
				const property = row[key];
				const schemaRow = _.get(jsonSchema, ['properties', key ]);
				if (_.toLower(_.get(schemaRow, 'type')) === 'array') {
					if (!_.isArray(property)) {
						return {
							...rows,
							[key]: property
						};
					}
					return {
						...rows,
						[key]: property.reduce((items, item) => {
							if (_.isObject(item)) {
								return [...items, JSON.stringify(item)];
							}
							return items;
						}, [])
					};
				}
				return {
					...rows,
					[key]: property
				};
			}, {})
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
					[row.name]: handleVariant(documents, row.name)
				};
			} else if (_.toLower(row.type) === 'array') {
				return {
					...properties,
					[row.name]: handleArray(documents, row.name)
				};
			} else if (_.toLower(row.type) === 'object') {
				return {
					...properties,
					[row.name]: handleObject(documents, row.name)
				} 
			} else if (_.toLower(row.type) === 'geography') {
				return {
					...properties,
					[row.name]: handleGeography(documents, row.name)
				}
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

		return [ ...types, type ];
	}, []);

	let type = _.first(types);
	let variantProperties = {};
	if (types.includes('object')) {
		type = 'object';
		variantProperties = { properties: {} } ;
	}
	return {type: 'geography', variantType: 'JSON', subtype: type, ...variantProperties}
}

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

		return [ ...types, type ];
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
		variantProperties = { properties: {} } ;
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

const handleArray = ( documents, rowName ) => {
	const types = documents.reduce((types, document) => {
		const rawArrayDocuments = document[rowName];
		const arrayDocuments = _.isArray(rawArrayDocuments) ? rawArrayDocuments : [];
		const propertyTypes = arrayDocuments.map(getVariantPropertyType).filter(type => !_.isUndefined(type));

		return [ ...types, ...propertyTypes ];
	}, []);

	return {
		type: 'array',
		items: _.uniq(types).map(type => { 
			let variantProperties = {};
			type = _.isArray(type) ? _.first(type) : type;

			if (type === 'array') {
				variantProperties = { items: [] };
			} else if (type === 'object') {
				variantProperties = { properties: {} } ;
			}

			return {type: 'variant', subtype: type, ...variantProperties }})
	};
};

const handleObject = ( documents, rowName ) => {
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
		properties: getJsonSchemaFromRows(objectDocuments, objectRows)
	};
};

const getJsonSchema = async (logger, limit, tableName) => {
	try {
		const rows = await execute(`DESC TABLE ${tableName};`);
		const hasJsonFields = rows.some(row => ['variant', 'object', 'array', 'geography'].includes(_.toLower(row.type)));
		if (!hasJsonFields) {
			return {
				jsonSchema: { properties: {} },
				documents: [],
			}
		}

		const documents = await getDocuments(tableName, limit).catch(err => {
			logger.log('error', err.message, 'Connection');
			return [];
		});
		
		return {
			documents,
			jsonSchema: {
				properties: getJsonSchemaFromRows(documents, rows)
			}
		};
	} catch (err) {
		const documents = await getDocuments(tableName, limit).catch(err => {
			logger.log('error', err.message, 'Connection');
			return [];
		});

		return {
			documents,
			jsonSchema: {
				properties: {}
			}
		};
	}
};

const removeQuotes = str => {
	return (str || '').replace(/^\"([\s\S]*)\"$/im, '$1');
};

const removeLinear = str => {
	return (str || '').replace(/^linear([\s\S]*)$/im, '$1');
}
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
		const arguments = item.split('(');
		let expression = '';
		const clusteringKeys = arguments.map(argument => {
			const rawName = _.get(_.trim(argument).match(/^([\S]+)/), 1);
			if (!rawName) {
				if (expression) {
					expression += '(';
				}
				expression += argument;
				return false;
			}
			const name = removeQuotes(_.last(getVariantName(_.trim(rawName)).split('.')));
			const fieldName = fieldsNames.find(fieldName => _.toUpper(fieldName) === _.toUpper(name));
			if (!fieldName) {
				if (expression) {
					expression += '(';
				}
				expression += argument;
				return false;
			}
			
			if (name === _.trim(removeQuotes(item))) {
				return {
					name: fieldName
				};
			}
			
			if (expression) {
				expression += '(';
			}
			expression += argument.replace(new RegExp(`^${name}`), '${name}');

			return {
				name: fieldName
			};
			
			
		}).filter(Boolean);

		if (!_.isEmpty(clusteringKeys)) {
			return [ ...keys, {
				clusteringKey: clusteringKeys,
				expression: _.trim(expression)
			}];
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
				expression: complexExpression + expression
			}
		];
	}, []);
};

const getEntityData = async (fullName, logger) => {
	const [dbName, schemaName, tableName] = fullName.split('.');

	try {
		let entityLevelData = {};
		const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.tables where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`);
		const data = _.first(rows);
		const fields = await execute(`DESC TABLE ${fullName};`).catch(e => []);
		const fieldsNames = fields.map(field => field.name);
		const clusteringKey = handleClusteringKey(fieldsNames, _.get(data, 'CLUSTERING_KEY', ''));
		const stageData = await execute(`DESCRIBE TABLE ${fullName} type = stage;`);
		const fileFormat = _.toUpper(_.get(stageData.find(item => item.property === 'TYPE'), 'property_value', ''));
		let external = _.toUpper(_.get(data, 'TABLE_TYPE', '')) === 'EXTERNAL TABLE';
		if (!external && checkExternalMetaFields(fields)) {
			logger.log(
				'info',
				{
					message: `External table was detected by meta properties. Table type: ${_.get(data, 'TABLE_TYPE', '')}`,
					containerName: schemaName, entityName: tableName
				},
				'Getting external table data'
			);
			external = true;
		};
		if (external) {
			const externalTableData = await getExternalTableData(fullName);
			entityLevelData = { ...data, ...externalTableData };
		}
		if (!fileFormat) {
			entityLevelData.customFileFormatName = _.toUpper(_.get(stageData.find(item => item.property === 'FORMAT_NAME'), 'property_value', ''));
		}

		const fileFormatKey = external ? 'externalFileFormat' : 'fileFormat';
		if (hasStageCopyOptions(stageData)) {
			entityLevelData.stageCopyOptions = getStageCopyOptions(stageData)
		}

		return {
			...entityLevelData,
			[fileFormatKey]: fileFormat || 'custom',
			external,
			clusteringKey,
			formatTypeOptions: getFileFormatOptions(stageData),
			transient: Boolean(_.get(data, 'IS_TRANSIENT', false) && _.get(data, 'IS_TRANSIENT') !== 'NO'),
			description: _.get(data, 'COMMENT') || ''
		};
	} catch (err) {
		return {};
	}
};

const checkExternalMetaFields = fields => {
	const metaField = _.first(fields) || {};

	if (metaField.name === 'VALUE' && metaField.type === 'VARIANT') {
		return true;
	}

	return false;
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
			const list = item.property_value.slice(1,-1).split(',').map(_.trim);
			if (!_.isArray(list)) {
				return options;
			}

			return {
				...options,
				[item.property]: list.map(value => ({ [`${item.property}_item`]: value }))
			};
		}
		if (item.property_type === 'Boolean') {
			return {
				...options,
				[item.property]: item.property_value && item.property_value !== 'false'
			};
		}
		if (item.property_type === 'Long') {
			if (item.property === 'SIZE_LIMIT') {
				return {
					...options,
					sizeLimit: !!item.property_value,
					[item.property]: _.toNumber(item.property_value)
				};
			}
			return {
				...options,
				[item.property]: _.toNumber(item.property_value)
			};
		}

		return {
			...options,
			[item.property]: item.property_value
		};
	}, {});
};

const getViewData = async (fullName, logger) => {
	const [dbName, schemaName, tableName] = fullName.split('.');

	try {
		const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.views where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`);
		const data = _.first(rows);
		if (!_.isEmpty(data)) {
			return {
				secure: _.get(data, 'IS_SECURE') && _.get(data, 'IS_SECURE') !== 'NO',
				description: _.get(data, 'COMMENT') || ''
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
		const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.tables where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`);
		const data = _.first(rows);
		return {
			secure: _.get(data, 'IS_SECURE') && _.get(data, 'IS_SECURE') !== 'NO',
			description: _.get(data, 'COMMENT') || ''
		};
	} catch (err) {
		return {};
	}
};

const getExternalTableData  = async fullName => {
	const [dbName, schemaName, tableName] = fullName.split('.');

	try {
		const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.EXTERNAL_TABLES where TABLE_NAME='${removeQuotes(tableName)}' AND TABLE_SCHEMA='${removeQuotes(schemaName)}'`);
		const data = _.first(rows);
		const location = _.get(data, 'LOCATION', '').split('/');
		const namespace = _.first(location);
		const path = location.slice(1).join('/');
		return {
			location: {
				namespace,
				path: path ? '/' + path : ''
			}
		};
	} catch (err) {
		return {};
	}
};

const getFunctions = async (dbName, schemaName) => {
	const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.functions where FUNCTION_SCHEMA='${schemaName}'`);

	return rows.map(row => {
		const functionArguments = row['ARGUMENT_SIGNATURE'] === '()' ? '' : row['ARGUMENT_SIGNATURE'];

		return {
			name: row['FUNCTION_NAME'],
			functionLanguage: _.toLower(row['FUNCTION_LANGUAGE']),
			functionArguments,
			functionReturnType: row['DATA_TYPE'],
			functionBody: row['FUNCTION_DEFINITION'],
			functionDescription: row['COMMENT'] || ''
		}
	});
};

const getStages = async (dbName, schemaName) => {
	const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.stages where STAGE_SCHEMA='${schemaName}'`);

	return rows.map(row => {
		return {
			name: row['STAGE_NAME'],
			url: row['STAGE_URL'],
		};
	});
};

const getSequences = async (dbName, schemaName) => {
	const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.sequences where SEQUENCE_SCHEMA='${schemaName}'`);

	return rows.map(row => ({
		name: row['SEQUENCE_NAME'],
		sequenceStart: Number(_.get(row, 'START_VALUE')) || 1,
		sequenceIncrement: Number(_.get(row, 'INCREMENT')) || 1,
		sequenceComments: row['COMMENT'] || ''
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
			return { ...options, [key]: value.slice(1, -1).split(',').map(value => ({ [`${key}_item`]: _.trim(value) })) };
		} else if (checkboxOptions.includes(key)) {
			return { ...options, [key]: _.isBoolean(value) ? value : _.toUpper(value) !== 'FALSE' };
		} else if (numericOptions.includes(key)) {
			return { ...options, [key]: isNaN(value) ? '' : Number(value) };
		}

		return { ...options, [key]: value };
	}, {});
};

const getFileFormats = async (dbName, schemaName) => {
	const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.FILE_FORMATS where FILE_FORMAT_SCHEMA='${schemaName}'`);

	return Promise.all(rows.map(async row => {
		const describeProperties = await execute(`DESCRIBE FILE FORMAT "${removeQuotes(dbName)}"."${removeQuotes(schemaName)}"."${row['FILE_FORMAT_NAME']}"`);
		const propertiesRow = describeProperties.reduce((properties, { property, property_value }) => ({
			...properties,
			[property]: property_value
		}), {});

		return {
			name: row['FILE_FORMAT_NAME'],
			fileFormat: _.toUpper(row['FILE_FORMAT_TYPE']),
			formatTypeOptions: convertFileFormatsOptions({ ...row, ...propertiesRow }),
			fileFormatComments: row['COMMENT'] || ''
		};
	}));
};

const getContainerData = async schema => {
	if (containers[schema]) {
		return containers[schema];
	}
	const [ dbName, schemaName ] = schema.split('.');
	const dbNameWithoutQuotes = removeQuotes(dbName);

	try {
		const dbRows = await execute(`select * from "${dbNameWithoutQuotes}".information_schema.databases where DATABASE_NAME='${dbNameWithoutQuotes}'`);
		const dbData = _.first(dbRows);
		const schemaRows = await execute(`select * from "${dbNameWithoutQuotes}".information_schema.schemata where SCHEMA_NAME='${removeQuotes(schemaName)}'`);
		const isCaseSensitive = _.toUpper(schemaName) !== schemaName;
		const schemaData = _.first(schemaRows);
		const functions = await getFunctions(dbName, schemaName);
		const stages = await getStages(dbName, schemaName);
		const sequences = await getSequences(dbName, schemaName);
		const fileFormats = await getFileFormats(dbName, schemaName);

		const data = {
			transient: Boolean(_.get(schemaData, 'IS_TRANSIENT', false) && _.get(schemaData, 'IS_TRANSIENT') !== 'NO'),
			description: _.get(schemaData, 'COMMENT') || _.get(dbData, 'COMMENT') || '',
			managedAccess: _.get(schemaData, 'IS_TRANSIENT') !== 'NO',
			UDFs: functions,
			stages,
			sequences,
			fileFormats,
			isCaseSensitive,
		};
		containers[schema] = data;

		return data;
	} catch (err) {
		return {};
	}
}

const setDependencies = ({ lodash }) => _ = lodash;

const getObjSize = (obj) => {
	if (!obj) {
		return 0;
	}

	return BSON.calculateObjectSize(obj) / (1024 * 1024);
};

const filterDocuments = (rows) => {
	const size = getObjSize(rows);

	if (size < 200) {
		return rows;
	}

	return filterDocuments(rows.slice(0, rows.length / 2));
};

const applyScript = async script => {
	return await execute(script);
}

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
	setDependencies,
	applyScript,
};
