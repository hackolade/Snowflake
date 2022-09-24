const assignTemplates = require('../utils/assignTemplates');

module.exports = _ => {
	const { commentIfDeactivated } = require('./commentDeactivatedHelper')(_);
	const { tab } = require('./tableHelper')(_);

	const escape = value =>
		String(value)
			.replace(/\'/g, "''")
			.replace(/\\\\/g, '\\')
			.replace(/\\/g, '\\\\');
	const toNumber = value => (isNaN(value) ? '' : Number(value));
	const toBoolean = value => (value === true ? 'TRUE' : undefined);
	const toString = value =>
		_.isUndefined(value) ? value : `'${escape(value)}'`;
	const isNone = value => _.toLower(value) === 'none';
	const isAuto = value => _.toLower(value) === 'auto';
	const toStringIfNotNone = value => (isNone(value) ? value : toString(value));
	const toStringIfNotAuto = value => (isAuto(value) ? value : toString(value));
	const toOptions = options => {
		return Object.entries(options)
			.filter(([optionName, value]) => !_.isEmpty(value) || value !== false)
			.map(([optionName, value]) => {
				if (Array.isArray(value)) {
					value = '(' + value.filter(value => !_.isEmpty(value)).join(', ') + ')';
				}
	
				return `${optionName}=${value}`;
			})
			.join('\n');
	};

	const getEntityName = entityData => {
		return (entityData && (entityData.code || entityData.collectionName)) || '';
	};

	const findJsonSchemaChain = (keyId, jsonSchema, name) => {
		if (jsonSchema.GUID === keyId) {
			return [{ ...jsonSchema, name }];
		} else if (_.isPlainObject(jsonSchema.properties)) {
			const nestedName = Object.keys(jsonSchema.properties).reduce(
				(result, name) => {
					if (result.length) {
						return result;
					}
					const nestedName = findJsonSchemaChain(
						keyId,
						jsonSchema.properties[name],
						name
					);

					if (nestedName) {
						return result.concat(nestedName);
					}

					return result;
				},
				[]
			);

			if (nestedName.length) {
				return [{ ...jsonSchema, name }].concat(nestedName);
			}
		} else if (_.isArray(jsonSchema.items)) {
			const nestedName = jsonSchema.items.reduce((result, schema) => {
				if (result.length) {
					return result;
				}
				const nestedName = findJsonSchemaChain(keyId, schema, '');

				if (nestedName) {
					return result.concat(nestedName);
				}

				return result;
			}, []);

			if (nestedName.length) {
				return [{ ...jsonSchema, name }].concat(nestedName);
			}
		} else if (jsonSchema.items) {
			const nestedName = findJsonSchemaChain(keyId, jsonSchema.items, '');

			if (nestedName) {
				return [{ ...jsonSchema, name }].concat(nestedName);
			}
		}
	};

	const composeClusteringKey = (isCaseSensitive, jsonSchema, clusteringKey) => {
		const name = _.get(clusteringKey, 'clusteringKey[0].name', '');
		const isActivated = _.get(
			clusteringKey,
			'clusteringKey[0].isActivated',
			true
		);

		if (clusteringKey.expression) {
			return {
				name: assignTemplates(clusteringKey.expression, {
					name: getName(isCaseSensitive, name),
				}),
				isActivated,
				isExpression: true,
			};
		} else if (name) {
			return { name, isActivated };
		} else {
			const keyId = _.get(clusteringKey, 'clusteringKey[0].keyId', '');
			const name = findJsonSchemaChain(keyId, jsonSchema);

			if (Array.isArray(name)) {
				const type = _.get(name[name.length - 1], 'type', '')
					.replace(/json/i, '')
					.toLowerCase();
				return {
					name: `(${name
						.map(schema => getName(isCaseSensitive, schema.name))
						.filter(Boolean)
						.join(':')}::${type})`,
					isActivated,
					isExpression: true,
				};
			}
		}
	};

	const foreignKeysToString = (isCaseSensitive, keys) => {
		if (Array.isArray(keys)) {
			const splitter = ', ';
			let deactivatedKeys = [];
			const processedKeys = keys
				.reduce((keysString, key) => {
					let keyName = _.isString(key.name) ? key.name.trim() : key.trim();
					if (!key.isExpression) {
						keyName = getName(isCaseSensitive, keyName);
					}

					if (!_.get(key, 'isActivated', true)) {
						deactivatedKeys.push(keyName);

						return keysString;
					}

					return [...keysString, keyName];
				}, [])
				.filter(Boolean);

			if (processedKeys.length === 0) {
				return commentIfDeactivated(
					deactivatedKeys.join(splitter),
					{ isActivated: false },
					true
				);
			} else if (deactivatedKeys.length === 0) {
				return processedKeys.join(splitter);
			} else {
				return (
					processedKeys.join(splitter) +
					commentIfDeactivated(
						splitter + deactivatedKeys.join(splitter),
						{ isActivated: false },
						true
					)
				);
			}
		}
		return keys;
	};

	const foreignActiveKeysToString = (isCaseSensitive, keys) => {
		return keys
			?.map(key => getName(isCaseSensitive, key.name.trim()))
			.join(', ');
	};

	const clean = obj =>
		Object.entries(obj)
			.filter(([name, value]) => !_.isNil(value))
			.reduce(
				(result, [name, value]) => ({
					...result,
					[name]: value,
				}),
				{}
			);

	const getName = (isCaseSensitive, name) => {
		if (!name) {
			return name;
		}

		if (isCaseSensitive) {
			return addQuotes(name);
		}

		return isValidCaseInsensitiveName(name) ? name : addQuotes(name);
	};

	const isValidCaseInsensitiveName = name => {
		return /^[a-z_][a-z\d_\$]*$/i.test(name);
	};

	const addQuotes = string => {
		if (/^\".*\"$/.test(string)) {
			return string;
		}

		return `"${string}"`;
	};

	const getFullName = (schemaName, name) =>
		`${schemaName ? `${schemaName}.` : ''}${name}`;

	const addOptions = (options, comment) => {
		const allOptions = _.trim(
			tab(
				options
					.filter(statement => Boolean(_.trim(statement, '\t\n ')))
					.join('\n')
			),
			'\t\n'
		);

		if (_.trim(comment)) {
			return allOptions + '\n\t' + comment;
		}

		return allOptions;
	};

	const getDbName = containerData => {
		return _.get(containerData, 'code') || _.get(containerData, 'name', '');
	};

	const viewColumnsToString = (keys, isParentActivated) => {
		if (!isParentActivated) {
			return keys.map(key => key.name).join(',\n\t');
		}
	
		let activatedKeys = keys.filter(key => key.isActivated).map(key => key.name);
		let deactivatedKeys = keys.filter(key => !key.isActivated).map(key => key.name);
	
		if (activatedKeys.length === 0) {
			return commentIfDeactivated(deactivatedKeys.join(',\n\t'), { isActivated: false }, true);
		}
		if (deactivatedKeys.length === 0) {
			return activatedKeys.join(',\n\t');
		}
	
		return (
			activatedKeys.join(',\n\t') +
			'\n\t' +
			commentIfDeactivated(deactivatedKeys.join(',\n\t'), { isActivated: false }, true)
		);
	};

	return {
		escape,
		getEntityName,
		clean,
		getName,
		composeClusteringKey,
		toBoolean,
		toNumber,
		toString,
		toStringIfNotNone,
		toStringIfNotAuto,
		foreignKeysToString,
		foreignActiveKeysToString,
		getFullName,
		addOptions,
		toOptions,
		getDbName,
		viewColumnsToString,
	};
};
