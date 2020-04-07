const snowflake = require('snowflake-sdk');
const _ = require('lodash');
let connection;
let containers = {};

const noConnectionError = { message: 'Connection error' };

const connect = ({ host, username, password }) => {
	return new Promise((resolve, reject) => {
		const account = (host || '')
			.trim()
			.replace(/\.snowflakecomputing\.com.*$/gi,'')
			.replace(/^http(s)?:\/\//gi, '');
		connection = snowflake.createConnection({ account, username, password });
		connection.connect(err => {
			if (err) {
				connection = null;
				return reject(err); 
			}

			resolve();
		});
	});
};

const disconnect = () => {
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

const testConnection = async info => {
	await connect(info);
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
	} catch {
		return '';
	}
};

const getDDL = async tableName => {
	try {
		const queryResult = await execute(`SELECT get_ddl('table', '${tableName}');`);

		return getFirstObjectItem(_.first(queryResult));
	} catch {
		return '';
	}
};

const getViewDDL = async viewName => {
	try {
		const queryResult = await execute(`SELECT get_ddl('view', '${viewName}');`);

		return getFirstObjectItem(_.first(queryResult));
	} catch {
		return '';
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
		
		return rows.map(filterNull);
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
	const complexTypes = ['variant', 'object', 'array'];
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
				};
			}

			return properties;
		}, {});

	return properties;
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

const getJsonSchema = async (documents, tableName) => {
	try {
		const rows = await execute(`DESC TABLE ${tableName};`);
		return {
			properties: getJsonSchemaFromRows(documents, rows)
		};
	} catch (err) {
		return { properties: {} };
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

const getEntityData = async fullName => {
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
		const external = _.get(data, 'TABLE_TYPE') === 'EXTERNAL TABLE';
		if (external) {
			const externalTableData = await getExternalTableData(fullName);
			entityLevelData = { ...data, ...externalTableData };
		}
		const fileFormatKey = external ? 'externalFileFormat' : 'fileFormat';
		if (hasStageCopyOptions(stageData)) {
			entityLevelData.stageCopyOptions = getStageCopyOptions(stageData)
		}

		return {
			...entityLevelData,
			[fileFormatKey]: fileFormat,
			external,
			clusteringKey,
			formatTypeOptions: getFileFormatOptions(stageData),
			transient: _.get(data, 'IS_TRANSIENT', false) && _.get(data, 'IS_TRANSIENT') !== 'NO',
			description: _.get(data, 'COMMENT') || ''
		};
	} catch (err) {
		return {};
	}
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

const getViewData = async fullName => {
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

const getFunctions = async dbName => {
	const rows = await execute(`select * from "${removeQuotes(dbName)}".information_schema.functions`);

	return rows.map(row => {
		const storedProcArgument = row['ARGUMENT_SIGNATURE'] === '()' ? '' : row['ARGUMENT_SIGNATURE'];

		return {
			name: row['FUNCTION_NAME'],
			storedProcLanguage: _.toLower(row['FUNCTION_LANGUAGE']),
			storedProcArgument,
			storedProcDataType: row['DATA_TYPE'],
			storedProcFunction: row['FUNCTION_DEFINITION'],
			storedProcComments: row['COMMENT']
		}
	});
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
		const schemaData = _.first(schemaRows);
		const functions = await getFunctions(dbName);

		const data = {
			transient: _.get(schemaData, 'IS_TRANSIENT', false) && _.get(schemaData, 'IS_TRANSIENT') !== 'NO',
			description: _.get(schemaData, 'COMMENT') || _.get(dbData, 'COMMENT') || '',
			DATA_RETENTION_TIME_IN_DAYS: _.get(schemaData, 'RETENTION_TIME') || 0,
			managedAccess: _.get(schemaData, 'IS_TRANSIENT') !== 'NO',
			UDFs: functions
		};
		containers[schema] = data;

		return data;
	} catch (err) {
		return {};
	}
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
	getContainerData
};
