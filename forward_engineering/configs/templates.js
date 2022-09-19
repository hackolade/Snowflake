module.exports = {
	createSchema:
		'CREATE${transient} SCHEMA IF NOT EXISTS ${name}${managed_access}${data_retention}${comment};',
	createUDF:
		"CREATE OR REPLACE FUNCTION ${name}(${arguments})\n\tRETURNS ${return_type}\n\tLANGUAGE ${language}\n\tAS '\n${function}\n'${comment};\n",
	createSequence: 'CREATE SEQUENCE IF NOT EXISTS ${name} START ${start} INCREMENT ${increment}${comment};\n',
	createFileFormat: 'CREATE FILE FORMAT IF NOT EXISTS ${name}${options}${comment};\n',
	createStage:
		'CREATE${temporary} STAGE IF NOT EXISTS ${name} ${url}${storageIntegration}${credentials}${encryption};\n',

	columnDefinition: '${name} ${type}${collation}${default}${autoincrement}${not_nul}${inline_constraint}${comment}',
	externalColumnDefinition: '${name} ${type} as ${expression}',
	createTable:
		'CREATE${temporary}${transient} TABLE IF NOT EXISTS\n' +
		'\t${name} (\n' +
		'\t\t${column_definitions}' +
		'${out_of_line_constraints}\n' +
		'\t)${tableOptions};\n',
	createExternalTable:
		'CREATE EXTERNAL TABLE IF NOT EXISTS \n' +
		'\t${name} (\n' +
		'\t\t${column_definitions}${out_of_line_constraints}\n' +
		'\t)${tableOptions};\n',
	createAsSelect: 'CREATE TABLE IF NOT EXISTS ${name} AS ${selectStatement}${tableOptions};\n',
	createCloneTable: 'CREATE TABLE IF NOT EXISTS ${name} CLONE ${source_table}${tableOptions};\n',
	createLikeTable: 'CREATE TABLE IF NOT EXISTS ${name} LIKE ${source_table}${tableOptions};\n',
	createView:
		'CREATE${secure}${materialized} VIEW IF NOT EXISTS ${name} (\n' +
		'\t${column_list}\n' +
		')\n${copy_grants}${comment}AS ${select_statement}',
	alterSchemaScript: 'ALTER SCHEMA IF EXISTS ${name} ',
	alterTableScript: 'ALTER TABLE IF EXISTS ${name} ',
	alterEntityRename: 'RENAME TO ${name};\n',
	setPropertySchema: 'SET ${property};\n',
	unsetPropertySchema: 'UNSET ${property};\n',
	manageAccessSchema: '${access} MANAGED ACCESS;\n',
	setPropertyTable: 'SET ${property};\n',
	alterViewScript: 'ALTER VIEW IF EXISTS ${name} ',
};
