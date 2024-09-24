module.exports = {
	createDatabase: 'CREATE DATABASE IF NOT EXISTS ${name};\nUSE DATABASE ${name};\n',

	createSchema:
		'CREATE${transient} SCHEMA IF NOT EXISTS ${name}${managed_access}${data_retention}${comment};\nUSE SCHEMA ${name};\n',
	dropSchema: 'DROP SCHEMA IF EXISTS ${name};\n',

	createTable:
		'CREATE${orReplace}${temporary}${transient} TABLE${tableIfNotExists}\n' +
		'\t${name} (\n' +
		'\t\t${column_definitions}' +
		'${out_of_line_constraints}\n' +
		'\t)${tableOptions};\n',

	createDynamicTable:
		'CREATE${orReplace}${transient}${dynamic}${iceberg} TABLE${tableIfNotExists}\n' +
		'\t${name}\n' +
		'${column_definitions}' +
		'${targetLag}' +
		'${warehouse}' +
		'${externalVolume}' +
		'${catalog}' +
		'${baseLocation}' +
		'${refreshMode}' +
		'${initialize}' +
		'${clusterKeys}' +
		'${dataRetentionTime}' +
		'${maxDataExtensionTime}' +
		'${copyGrants}' +
		'${comment}' +
		'${tagsStatement}' +
		'${selectStatement};\n',

	createLikeTable: 'CREATE TABLE IF NOT EXISTS ${name} LIKE ${source_table}${tableOptions};\n',

	createCloneTable: 'CREATE TABLE IF NOT EXISTS ${name} CLONE ${source_table}${tableOptions};\n',

	createAsSelect: 'CREATE TABLE IF NOT EXISTS ${name} AS ${selectStatement}${tableOptions};\n',

	createExternalTable:
		'CREATE${orReplace} EXTERNAL TABLE${tableIfNotExists}\n' +
		'\t${name} (\n' +
		'\t\t${column_definitions}${out_of_line_constraints}\n' +
		'\t)${tableOptions};\n',

	columnDefinition:
		'${name} ${type}${collation}${default}${identity}${autoincrement}${not_nul}${inline_constraint}${comment}${tag}',

	externalColumnDefinition: '${name} ${type} as ${expression}${comment}',

	createTableForeignKey: '${constraint}FOREIGN KEY (${columns}) REFERENCES ${primary_table} (${primary_columns})',

	alterTableForeignKey:
		'ALTER TABLE IF EXISTS ${table_name} ADD ${constraint}FOREIGN KEY (${columns}) REFERENCES ${primary_table} (${primary_columns});',

	createView:
		'CREATE${secure}${materialized} VIEW IF NOT EXISTS ${name} (\n' +
		'\t${column_list}\n' +
		')\n${copy_grants}${comment}${tag}${clustering}AS ${select_statement};\n',

	createUDF:
		'CREATE${orReplace} FUNCTION ${name}(${arguments})\n\tRETURNS ${returnType}${notNull}\n\tLANGUAGE ${language}${parameters}${comment}\n\tAS ${body};\n',

	createProcedure:
		'CREATE${orReplace} PROCEDURE ${name}(${arguments})\n\tRETURNS ${returnType}${notNull}\n\tLANGUAGE ${language}${parameters}${comment}\n\tAS ${body};\n',

	createSequence: 'CREATE SEQUENCE IF NOT EXISTS ${name} START ${start} INCREMENT ${increment}${comment};\n',

	createFileFormat: 'CREATE FILE FORMAT IF NOT EXISTS ${name}${options}${comment};\n',

	createStage:
		'CREATE${temporary} STAGE IF NOT EXISTS ${name} ${url}${storageIntegration}${credentials}${encryption};\n',

	alterSchema: 'ALTER SCHEMA IF EXISTS ${name} ${operation} ${options};',
	alterTable: 'ALTER${dynamic} TABLE IF EXISTS ${name} ${action};',
	alterView: 'ALTER${materialized} VIEW IF EXISTS ${name} ${action};',

	alterSchemaScript: 'ALTER SCHEMA IF EXISTS ${name} ',
	alterTableScript: 'ALTER${dynamic} TABLE IF EXISTS ${name} ',
	alterEntityRename: 'RENAME TO ${name};\n',

	alterViewScript: 'ALTER VIEW IF EXISTS ${name} ',
	alterMaterializedViewScript: 'ALTER MATERIALIZED VIEW ${name} ',

	setPropertySchema: 'SET ${property};\n',
	unsetPropertySchema: 'UNSET ${property};\n',
	setPropertyTable: 'SET ${property};\n',

	manageAccessSchema: '${access} MANAGED ACCESS;\n',

	createTag: 'CREATE${orReplace} TAG${ifNotExist} ${name}${allowedValues}${comment};\n',
	dropTag: 'DROP TAG IF EXISTS ${name};\n',
	alterTag: 'ALTER TAG${ifExists} ${name} ${option}${optionValue};\n',
};
