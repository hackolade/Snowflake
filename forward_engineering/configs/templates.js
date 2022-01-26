/*
 * Copyright © 2016-2022 by IntegrIT S.A. dba Hackolade.  All rights reserved.
 *
 * The copyright to the computer software herein is the property of IntegrIT S.A.
 * The software may be used and/or copied only with the written permission of
 * IntegrIT S.A. or in accordance with the terms and conditions stipulated in
 * the agreement/contract under which the software has been supplied.
 */

module.exports = {
	columnDefinition: '${name} ${type}${collation}${default}${autoincrement}${not_nul}${inline_constraint}${comment}',
	externalColumnDefinition: '${name} ${type} as ${expression}',
	createView:
	'CREATE${secure}${materialized} VIEW IF NOT EXISTS ${name} (\n' +
	'\t${column_list}\n' +
	')\n${copy_grants}${comment}AS SELECT ${table_columns}\nFROM ${table_name};\n',
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
};
