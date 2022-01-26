const { checkFieldPropertiesChanged } = require('./common');

const getAddCollectionScript = (_, ddlProvider, dbVersion) => collection => {
  const { getEntityName } = require('../general')(_);
  const { createColumnDefinitionBySchema } =
    require('./createColumnDefinition')(_);

  const schemaName = collection.compMod.keyspaceName;
  const schemaData = { schemaName, dbVersion };
  const jsonSchema = {
    ...collection,
    ...(_.omit(collection?.role, 'properties') || {}),
  };
  const columnDefinitions = _.toPairs(jsonSchema.properties).map(
    ([name, column]) =>
      createColumnDefinitionBySchema({
        name,
        jsonSchema: column,
        parentJsonSchema: jsonSchema,
        ddlProvider,
        schemaData,
      })
  );

  const tableData = {
    name: getEntityName(jsonSchema),
    columns: columnDefinitions.map(ddlProvider.convertColumnDefinition),
    foreignKeyConstraints: [],
    schemaData,
    columnDefinitions,
  };
  const hydratedTable = ddlProvider.hydrateTable({
    tableData,
    entityData: [jsonSchema],
    jsonSchema,
  });

  return ddlProvider.createTable(hydratedTable, jsonSchema.isActivated);
};

const getDeleteCollectionScript = (_) => collection => {
  const { getEntityName, getFullName } = require('../general')(_);

  const jsonData = {
    ...collection,
    ...(_.omit(collection?.role, 'properties') || {}),
  };
  const tableName = getEntityName(jsonData);
  const schemaName = collection.compMod.keyspaceName;
  const fullName = getFullName(schemaName, tableName);

  return `DROP TABLE IF EXISTS ${fullName};`;
};

const getAddColumnScript = (_, ddlProvider, dbVersion) => collection => {
  const { getEntityName, getFullName } = require('../general')(_);
  const ddlProvider = require('../../ddlProvider')(null, null, app);

  const collectionSchema = {
    ...collection,
    ...(_.omit(collection?.role, 'properties') || {}),
  };
  const tableName = getEntityName(collectionSchema);
  const schemaName = collectionSchema.compMod?.keyspaceName;
  const fullName = getFullName(tableName, schemaName);
  const schemaData = { schemaName, dbVersion };

  return _.toPairs(collection.properties)
    .filter(([_, jsonSchema]) => !jsonSchema.compMod)
    .map(([name, jsonSchema]) =>
      createColumnDefinitionBySchema({
        name,
        jsonSchema,
        parentJsonSchema: collectionSchema,
        ddlProvider,
        schemaData,
      })
    )
    .map(ddlProvider.convertColumnDefinition)
    .map(script => `ALTER TABLE IF EXISTS ${fullName} ADD COLUMN ${script};`);
};

const getDeleteColumnScript = _ => collection => {
  const { getEntityName, getFullName } = require('../general')(_);

  const collectionSchema = {
    ...collection,
    ...(_.omit(collection?.role, 'properties') || {}),
  };
  const tableName = getEntityName(collectionSchema);
  const schemaName = collectionSchema.compMod?.keyspaceName;
  const fullName = getFullName(schemaName, tableName);

  return _.toPairs(collection.properties)
    .filter(([_, jsonSchema]) => !jsonSchema.compMod)
    .map(
      ([name]) => `ALTER TABLE IF EXISTS ${fullName} DROP COLUMN "${name}";`
    );
};

const getModifyColumnScript = _ => collection => {
  const { getEntityName, getFullName } = require('../general')(_);

  const collectionSchema = {
    ...collection,
    ...(_.omit(collection?.role, 'properties') || {}),
  };
  const tableName = getEntityName(collectionSchema);
  const schemaName = collectionSchema.compMod?.keyspaceName;
  const fullName = getFullName(schemaName, tableName);

  const renameColumnScripts = _.values(collection.properties)
    .filter(jsonSchema =>
      checkFieldPropertiesChanged(jsonSchema.compMod, ['name'])
    )
    .map(
      jsonSchema =>
        `ALTER TABLE IF EXISTS ${fullName} RENAME COLUMN ${jsonSchema.compMod.oldField.name} TO ${jsonSchema.compMod.newField.name};`
    );

  const changeTypeScripts = _.toPairs(collection.properties)
    .filter(([name, jsonSchema]) =>
      checkFieldPropertiesChanged(jsonSchema.compMod, ['type', 'mode'])
    )
    .map(
      ([name, jsonSchema]) =>
        `ALTER TABLE IF EXISTS ${fullName} ALTER COLUMN ${name} SET DATA TYPE ${
          jsonSchema.compMod.newField.mode || jsonSchema.compMod.newField.type
        };`
    );

  return [...renameColumnScripts, ...changeTypeScripts];
};

module.exports = {
  getAddCollectionScript,
  getDeleteCollectionScript,
  getAddColumnScript,
  getDeleteColumnScript,
  getModifyColumnScript,
};
