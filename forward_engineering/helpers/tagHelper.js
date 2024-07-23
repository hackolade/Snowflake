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

		const keyValues = getTagKeyValues({ tags, isCaseSensitive });

		return `${indent}WITH TAG ( ${keyValues} )`;
	};

	/**
	 * @param {{ allowedValues: string[] }}
	 * @returns {string}
	 */
	const getTagAllowedValues = ({ allowedValues }) => {
		if (isEmpty(allowedValues)) {
			return '';
		}

		const values = allowedValues.map(({ value }) => toString(value)).join(', ');

		return ` ALLOWED_VALUES ${values}`;
	};

	/**
	 * @param {{ tags: Tag[], isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getTagKeyValues = ({ tags, isCaseSensitive }) => {
		return tags
			.filter(tag => tag.tagName)
			.map(tag => `${getTagName({ tagName: tag.tagName, isCaseSensitive })} = ${toString(tag.tagValue)}`)
			.join(', ');
	};

	/**
	 * @param {{ tagName: string, isCaseSensitive: boolean }}
	 * @returns {string}
	 */
	const getTagName = ({ tagName, isCaseSensitive }) => {
		const hasSpace = /\s/.test(tagName);

		return hasSpace ? getName(isCaseSensitive, tagName) : tagName;
	};

	return {
		getTagStatement,
		getTagAllowedValues,
		getTagKeyValues,
	};
};
