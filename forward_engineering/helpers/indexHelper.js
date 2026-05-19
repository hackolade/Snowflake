const { commentIfDeactivated } = require('./commentHelpers/commentDeactivatedHelper');
const { preSpace } = require('../utils/preSpace');
const { getName } = require('./general');

const prepareIndexKeys = ({
	indexKeys,
	wholeStatementCommented,
	isCaseSensitive,
	divideIntoActivatedAndDeactivated,
}) => {
	const dividedKeys = divideIntoActivatedAndDeactivated(indexKeys || [], key => getName(isCaseSensitive, key.name));
	const commentedKeys = dividedKeys.deactivatedItems.length
		? commentIfDeactivated(
				dividedKeys.deactivatedItems.join(', '),
				{
					isActivated: wholeStatementCommented,
					isPartOfLine: true,
				},
				true,
			)
		: '';

	return (
		dividedKeys.activatedItems.join(', ') +
		(wholeStatementCommented && commentedKeys && dividedKeys.activatedItems.length
			? ', ' + commentedKeys
			: preSpace(commentedKeys))
	);
};

module.exports = {
	prepareIndexKeys,
};
