const { 
	getNames, 
	getBaseAndContaienrNames,
} = require('./common');

const getViewName = view => (view && view.code || view.name) || '';

const getAddViewScript = (_, ddlProvider, app) => view => {
	const { getName } = require('../general')(_);
	const { mapProperties } = app.require('@hackolade/ddl-fe-utils');

	const { schemaName, databaseName } = getBaseAndContaienrNames(view, getName);

	const viewData = {
		name: view.code || view.name,
		keys: getKeys({ 
			viewSchema: view, 
			collectionRefsDefinitionsMap: view.compMod?.collectionData?.collectionRefsDefinitionsMap ?? {},
			ddlProvider,
			mapProperties,
			_
		}),
		schemaData: { schemaName, databaseName },
	};

	const hydratedView = ddlProvider.hydrateView({
		viewData,
		entityData: [view],
	});

	return ddlProvider.createView(hydratedView, {}, view.isActivated);
};

const getDeleteViewScript = _ => view => {
	const { getFullName, getName } = require('../general')(_);

	const jsonData = {
		...view,
		...(_.omit(view?.role, 'properties') || {}),
	};
	const { schemaName, databaseName, tableName } = getNames(jsonData, getName, getViewName);
	const fullName = getFullName(databaseName, getFullName(schemaName, tableName));
	const isMaterialized = jsonData.role?.materialized;

	return `DROP ${isMaterialized ? 'MATERIALIZED ' : ''}VIEW IF EXISTS ${fullName};`;
};

const getModifyViewScript = ddlProvider => view => {
	const data = ddlProvider.hydrateAlterView(view);

	return ddlProvider.alterView(data);
};

const getKeys = ({ 
	viewSchema, 
	collectionRefsDefinitionsMap, 
	ddlProvider,
	mapProperties,
	_,
}) => {
	return mapProperties(viewSchema, (propertyName, schema) => {
		const definition = collectionRefsDefinitionsMap[schema.refId];

		if (!definition) {
			return ddlProvider.hydrateViewColumn({
				name: propertyName,
				isActivated: schema.isActivated,
			});
		}

		const entityName =
			_.get(definition.collection, '[0].code', '') ||
			_.get(definition.collection, '[0].collectionName', '') ||
			'';
		const dbName = _.get(definition.bucket, '[0].code') || _.get(definition.bucket, '[0].name', '');
		const name = definition.name;

		if (name === propertyName) {
			return ddlProvider.hydrateViewColumn({
				containerData: definition.bucket,
				entityData: definition.collection,
				isActivated: schema.isActivated,
				definition: definition.definition,
				entityName,
				name,
				dbName,
			});
		}

		return ddlProvider.hydrateViewColumn({
			containerData: definition.bucket,
			entityData: definition.collection,
			isActivated: schema.isActivated,
			definition: definition.definition,
			alias: propertyName,
			entityName,
			name,
			dbName,
		});
	});
};


module.exports = {
	getAddViewScript,
	getDeleteViewScript,
	getModifyViewScript,
};
