const _ = require('lodash');

module.exports = app => {
	const { clean } = app.require('@hackolade/ddl-fe-utils').general;
	const { addQuotes } = require('./general')(app);

	const mapProperties = (jsonSchema, iteratee) => {
		return Object.entries(jsonSchema.properties).map(iteratee);
	};

	const isUniqueKey = column => {
		return !(column.compositeUniqueKey || !column.unique);
	};

	const isPrimaryKey = column => {
		return !(column.compositeUniqueKey || column.compositePrimaryKey || !column.primaryKey);
	};

	const hydrateUniqueOptions = (options, columnName, isActivated, jsonSchema) =>
		clean({
			keyType: 'UNIQUE',
			name: options['constraintName'],
			columns: [
				{
					name: columnName,
					isActivated: isActivated,
				},
			],
			include: getKeys(options['include'] || options['indexInclude'] || [], jsonSchema),
			storageParameters: options['indexStorageParameters'],
			comment: options['indexComment'],
			tablespace: options['indexTablespace'],
		});

	const hydratePrimaryKeyOptions = (options, columnName, isActivated, jsonSchema) =>
		clean({
			keyType: 'PRIMARY KEY',
			name: options['constraintName'],
			columns: [
				{
					name: columnName,
					isActivated: isActivated,
				},
			],
			include: getKeys(options['include'] || options['indexInclude'] || [], jsonSchema),
			storageParameters: options['indexStorageParameters'],
			comment: options['indexComment'],
			tablespace: options['indexTablespace'],
		});

	const findName = (keyId, properties) => {
		return Object.keys(properties).find(name => properties[name].GUID === keyId);
	};

	const checkIfActivated = (keyId, properties) => {
		return _.get(
			Object.values(properties).find(prop => prop.GUID === keyId),
			'isActivated',
			true,
		);
	};

	const getKeys = (keys, jsonSchema) => {
		return _.map(keys, key => {
			return {
				name: findName(key.keyId, jsonSchema.properties),
				isActivated: checkIfActivated(key.keyId, jsonSchema.properties),
			};
		});
	};

	const getCompositePrimaryKeys = jsonSchema => {
		if (!Array.isArray(jsonSchema.primaryKey)) {
			return [];
		}

		return jsonSchema.primaryKey
			.filter(primaryKey => !_.isEmpty(primaryKey.compositePrimaryKey))
			.map(primaryKey => ({
				...hydratePrimaryKeyOptions(primaryKey, null, null, jsonSchema),
				columns: getKeys(primaryKey.compositePrimaryKey, jsonSchema),
			}));
	};

	const getCompositeUniqueKeys = jsonSchema => {
		if (!Array.isArray(jsonSchema.uniqueKey)) {
			return [];
		}

		return jsonSchema.uniqueKey
			.filter(uniqueKey => !_.isEmpty(uniqueKey.compositeUniqueKey))
			.map(uniqueKey => ({
				...hydrateUniqueOptions(uniqueKey, null, null, jsonSchema),
				columns: getKeys(uniqueKey.compositeUniqueKey, jsonSchema),
			}));
	};

	const getTableKeyConstraints = ({ jsonSchema }) => {
		if (!jsonSchema.properties) {
			return [];
		}

		const primaryKeyConstraints = mapProperties(jsonSchema, ([name, schema]) => {
			if (!isPrimaryKey(schema)) {
				return;
			} else if (_.isEmpty(schema.primaryKeyOptions)) {
				return;
			}

			return hydratePrimaryKeyOptions(_.first(schema.primaryKeyOptions), name, schema.isActivated, jsonSchema);
		}).filter(Boolean);

		const uniqueKeyConstraints = _.flatten(
			mapProperties(jsonSchema, ([name, schema]) => {
				if (!isUniqueKey(schema)) {
					return [];
				} else if (_.isEmpty(schema.uniqueKeyOptions) || !Array.isArray(schema.uniqueKeyOptions)) {
					return [];
				}

				return schema.uniqueKeyOptions.map(uniqueKey =>
					hydrateUniqueOptions(uniqueKey, name, schema.isActivated, jsonSchema),
				);
			}),
		).filter(Boolean);

		return [
			...primaryKeyConstraints,
			...getCompositePrimaryKeys(jsonSchema),
			...uniqueKeyConstraints,
			...getCompositeUniqueKeys(jsonSchema),
		];
	};

	/**
	 * @typedef {{ isActivated: boolean, name: string }} ClusteringKey
	 * @param {{ clusteringKey: ClusteringKey[], isParentActivated: boolean }} clusteringKeyArgs
	 * @returns {string}
	 */
	const getClusteringKey = ({ clusteringKey, isParentActivated }) => {
		if (!Array.isArray(clusteringKey) || clusteringKey.length === 0) {
			return '';
		}

		const mapName = ({ name }) => addQuotes(name);

		const activated = clusteringKey
			.filter(key => key.isActivated)
			.map(mapName)
			.join(', ');
		const deactivated = clusteringKey
			.filter(key => !key.isActivated)
			.map(mapName)
			.join(', ');

		if (!isParentActivated) {
			return `CLUSTER BY (${clusteringKey.map(mapName).join(', ')})\n`;
		}

		if (activated.length === 0) {
			return `// CLUSTER BY (${deactivated})\n`;
		}

		if (deactivated.length === 0) {
			return `CLUSTER BY (${activated})\n`;
		}

		return `CLUSTER BY (${activated}) //${deactivated}\n`;
	};

	return {
		getTableKeyConstraints,
		getClusteringKey,
	};
};
