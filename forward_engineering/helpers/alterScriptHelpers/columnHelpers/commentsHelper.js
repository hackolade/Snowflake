const { commentIfDeactivated } = require('../../commentHelpers/commentDeactivatedHelper');
const {
	getName,
	isParentContainerActivated,
	isObjectInDeltaModelActivated,
} = require('../../general');
const assignTemplates = require('../../../utils/assignTemplates');
const templates = require('../../../configs/templates');
const { escapeString } = require('../../../utils/escapeString');

/**
 * Studio clears jsonSchema.description on newly added columns so comments cannot be inlined.
 * The original text is kept on collection.role.properties[name].
 *
 * @param {{ jsonSchema: Object, roleProperty: Object }} dto
 * @return {string | undefined}
 */
const getAddedColumnComment = ({ jsonSchema, roleProperty } = {}) => {
	return (
		jsonSchema?.description ||
		jsonSchema?.refDescription ||
		roleProperty?.description ||
		roleProperty?.refDescription
	);
};

/**
 * @param {{
 *     collection: Object,
 *     name: string,
 *     jsonSchema: Object,
 *     fullName: string,
 *     scriptFormat: string,
 *     isCaseSensitive?: boolean,
 *     shouldIgnoreColumnComments?: boolean,
 * }} dto
 * @return {string | undefined}
 */
const getAddedCommentOnColumnScript = ({
	collection,
	name,
	jsonSchema,
	fullName,
	scriptFormat,
	isCaseSensitive,
	shouldIgnoreColumnComments = false,
} = {}) => {
	if (shouldIgnoreColumnComments) {
		return undefined;
	}

	if (jsonSchema?.description || jsonSchema?.refDescription) {
		return undefined;
	}

	const roleProperty = collection?.role?.properties?.[name];
	const comment = getAddedColumnComment({ jsonSchema, roleProperty });
	if (!comment) {
		return undefined;
	}

	const isContainerActivated = isParentContainerActivated(collection) !== false;
	const isCollectionActivated = isObjectInDeltaModelActivated(collection) !== false;
	const isColumnActivated = jsonSchema.isActivated !== false;
	const isActivated = isContainerActivated && isCollectionActivated && isColumnActivated;
	const columnName = getName(isCaseSensitive, name);
	const statement = assignTemplates(templates.columnComment, {
		fullName: `${fullName}.${columnName}`,
		comment: escapeString(scriptFormat, comment),
	});

	return commentIfDeactivated(statement, { isActivated });
};

module.exports = {
	getAddedCommentOnColumnScript,
};
