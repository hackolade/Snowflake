/**
 * @typedef {{ id: string, tagName?: string, tagValue?: string }} Tag
 */

const { isEmpty } = require('lodash');

module.exports = ({ getName, toString }) => {
	/**
	 * @param {{ tags: Tag[], isCaseSensitive: boolean, indent: string }}
	 * @returns {string}
	 */
	const getTagStatement = ({ tags, isCaseSensitive, indent = ' ' }) => {
		if (isEmpty(tags)) {
			return '';
		}

		const tagStatements = tags
			.filter(tag => tag.tagName)
			.map(tag => `${getName(isCaseSensitive, tag.tagName)} = ${toString(tag.tagValue)}`)
			.join(', ');

		return `${indent}WITH TAG ( ${tagStatements} )`;
	};

	/**
	 * @param {string[]} allowedValues
	 * @returns {string}
	 */
	const getTagAllowedValues = allowedValues => {
		if (isEmpty(allowedValues)) {
			return '';
		}

		const values = allowedValues.map(({ value }) => toString(value)).join(', ');

		return ` ALLOWED_VALUES ${values}`;
	};

	return {
		getTagStatement,
		getTagAllowedValues,
	};
};
