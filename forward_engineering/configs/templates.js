/*
 * Copyright © 2016-2023 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

module.exports = {
	createDatabase: 'CREATE DATABASE IF NOT EXISTS ${name};\nUSE DATABASE ${name};\n',
	createSchema:
		'CREATE${transient} SCHEMA IF NOT EXISTS ${name}${managed_access}${data_retention}${comment};\nUSE SCHEMA ${name};\n',
	createTable:
		'CREATE${temporary}${transient} TABLE IF NOT EXISTS\n' +
		'\t${name} (\n' +
		'\t\t${column_definitions}' +
		'${out_of_line_constraints}\n' +
		'\t)${tableOptions};\n',
	createLikeTable: 'CREATE TABLE IF NOT EXISTS ${name} LIKE ${source_table}${tableOptions};\n',
	createCloneTable: 'CREATE TABLE IF NOT EXISTS ${name} CLONE ${source_table}${tableOptions};\n',
	createAsSelect: 'CREATE TABLE IF NOT EXISTS ${name} AS ${selectStatement}${tableOptions};\n',
	createExternalTable:
		'CREATE EXTERNAL TABLE IF NOT EXISTS \n' +
		'\t${name} (\n' +
		'\t\t${column_definitions}${out_of_line_constraints}\n' +
		'\t)${tableOptions};\n',
	columnDefinition:
		'${name} ${type}${collation}${default}${identity}${autoincrement}${not_nul}${inline_constraint}${comment}',
	externalColumnDefinition: '${name} ${type} as ${expression}${comment}',
	createTableForeignKey: '${constraint}FOREIGN KEY (${columns}) REFERENCES ${primary_table} (${primary_columns})',
	alterTableForeignKey:
		'ALTER TABLE IF EXISTS ${table_name} ADD ${constraint}FOREIGN KEY (${columns}) REFERENCES ${primary_table} (${primary_columns});',
	createView:
		'CREATE${secure}${materialized} VIEW IF NOT EXISTS ${name} (\n' +
		'\t${column_list}\n' +
		')\n${copy_grants}${comment}AS ${select_statement}',
	createUDF:
		"CREATE${orReplace} FUNCTION ${name}(${arguments})\n\tRETURNS ${returnType}${notNull}\n\tLANGUAGE ${language}${parameters}${comment}\n\tAS ${body};\n",
	createProcedure:
		'CREATE${orReplace} PROCEDURE ${name}(${arguments})\n\tRETURNS ${returnType}${notNull}\n\tLANGUAGE ${language}${parameters}${comment}\n\tAS ${body};\n',
	createSequence: 'CREATE SEQUENCE IF NOT EXISTS ${name} START ${start} INCREMENT ${increment}${comment};\n',
	createFileFormat: 'CREATE FILE FORMAT IF NOT EXISTS ${name}${options}${comment};\n',
	createStage:
		'CREATE${temporary} STAGE IF NOT EXISTS ${name} ${url}${storageIntegration}${credentials}${encryption};\n',

	alterSchema: 'ALTER SCHEMA IF EXISTS ${name} ${operation} ${options};',
	alterTable: 'ALTER TABLE IF EXISTS ${name} ${action};',
	alterView: 'ALTER${materialized} VIEW IF EXISTS ${name} ${action};',

	alterSchemaScript: 'ALTER SCHEMA IF EXISTS ${name} ',
	alterTableScript: 'ALTER TABLE IF EXISTS ${name} ',
	alterEntityRename: 'RENAME TO ${name};\n',
	setPropertySchema: 'SET ${property};\n',
	unsetPropertySchema: 'UNSET ${property};\n',
	manageAccessSchema: '${access} MANAGED ACCESS;\n',
	setPropertyTable: 'SET ${property};\n',
	alterViewScript: 'ALTER VIEW IF EXISTS ${name} ',
	alterMaterializedViewScript: 'ALTER MATERIALIZED VIEW ${name} ',
};
